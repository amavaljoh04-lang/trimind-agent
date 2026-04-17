"""TriMind Agent — FastAPI backend with WebSocket support."""

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.agent.hardware import detect_hardware
from app.agent.memory import MemoryStore
from app.agent.ollama_client import OllamaClient
from app.agent.orchestrator import Orchestrator
from app.config import get_config, load_config
from app.models import (
    AgentMessage,
    ModelAssignment,
    ModelInfo,
    TaskRequest,
    TaskStatus,
    WSResponse,
)

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("trimind")

# ── Shared state ─────────────────────────────────────────────────────
memory = MemoryStore()
ollama: OllamaClient | None = None
active_sessions: dict[str, Orchestrator] = {}
ws_connections: dict[str, list[WebSocket]] = {}


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Startup / shutdown."""
    global ollama
    cfg = load_config()

    os.makedirs(os.path.dirname(os.path.abspath(cfg.memory.db_path)), exist_ok=True)
    await memory.initialize()

    ollama = OllamaClient(base_url=cfg.ollama.base_url)
    os.makedirs(os.path.abspath(cfg.tools.file_manager.workspace), exist_ok=True)

    logger.info("TriMind Agent backend started")
    yield

    await memory.close()
    logger.info("TriMind Agent backend stopped")


# ── App ──────────────────────────────────────────────────────────────
app = FastAPI(title="TriMind Agent", version="0.1.0", lifespan=lifespan)

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


# ── Health ───────────────────────────────────────────────────────────
@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "trimind-agent"}


# ── Hardware Info ────────────────────────────────────────────────────
@app.get("/api/hardware")
async def get_hardware():
    hw = await detect_hardware()
    return hw.to_dict()


# ── Ollama Models ────────────────────────────────────────────────────
@app.get("/api/models")
async def list_models():
    assert ollama is not None
    try:
        models = await ollama.list_models()
        return {
            "models": [
                ModelInfo(
                    name=m.get("name", ""),
                    size=_format_size(m.get("size", 0)),
                    modified_at=m.get("modified_at", ""),
                    digest=m.get("digest", "")[:12],
                ).model_dump()
                for m in models
            ],
            "ollama_url": get_config().ollama.base_url,
            "healthy": True,
        }
    except Exception as e:
        return {
            "models": [],
            "ollama_url": get_config().ollama.base_url,
            "healthy": False,
            "error": str(e),
        }


@app.get("/api/models/assigned")
async def get_assigned_models():
    cfg = get_config()
    return ModelAssignment(
        planner=cfg.models.planner,
        executor=cfg.models.executor,
        reviewer=cfg.models.reviewer,
    ).model_dump()


@app.post("/api/models/assign")
async def assign_models(assignment: ModelAssignment):
    cfg = get_config()
    cfg.models.planner = assignment.planner
    cfg.models.executor = assignment.executor
    cfg.models.reviewer = assignment.reviewer
    for orch in active_sessions.values():
        orch.update_models(assignment.planner, assignment.executor, assignment.reviewer)
    return {"status": "ok", "assignment": assignment.model_dump()}


@app.post("/api/models/pull")
async def pull_model(data: dict[str, str]):
    assert ollama is not None
    model_name = data.get("name", "")
    if not model_name:
        return {"error": "Model name required"}
    try:
        progress: list[dict[str, Any]] = []
        async for update in ollama.pull_model(model_name):
            progress.append(update)
        return {
            "status": "ok",
            "model": model_name,
            "progress": progress[-1] if progress else {},
        }
    except Exception as e:
        return {"error": str(e)}


# ── Sessions ─────────────────────────────────────────────────────────
@app.get("/api/sessions")
async def list_sessions():
    sessions = await memory.get_all_sessions()
    return {"sessions": sessions}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    messages = await memory.get_conversation(session_id, limit=200)
    status = TaskStatus.COMPLETED
    if session_id in active_sessions:
        status = active_sessions[session_id].status
    return {"session_id": session_id, "status": status, "messages": messages}


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    if session_id in active_sessions:
        active_sessions[session_id].stop()
        return {"status": "stopped"}
    return {"error": "Session not found or not active"}


# ── Task (REST fallback) ────────────────────────────────────────────
@app.post("/api/task")
async def create_task(req: TaskRequest):
    assert ollama is not None
    session_id = req.session_id or str(uuid.uuid4())

    async def on_message(msg: AgentMessage) -> None:
        await _broadcast_ws(
            session_id,
            WSResponse(type="message", data=msg.model_dump(mode="json")),
        )

    orch = Orchestrator(ollama=ollama, memory=memory, on_message=on_message)
    active_sessions[session_id] = orch
    asyncio.create_task(_run_task(session_id, orch, req.message))

    return {"session_id": session_id, "status": "started"}


async def _run_task(session_id: str, orch: Orchestrator, message: str) -> None:
    try:
        await orch.run(session_id, message)
    except Exception as e:
        logger.exception(f"Task error in session {session_id}")
        await _broadcast_ws(
            session_id, WSResponse(type="error", data={"error": str(e)})
        )
    finally:
        await _broadcast_ws(
            session_id,
            WSResponse(type="done", data={"status": orch.status.value}),
        )
        active_sessions.pop(session_id, None)


# ── WebSocket ────────────────────────────────────────────────────────
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()

    if session_id not in ws_connections:
        ws_connections[session_id] = []
    ws_connections[session_id].append(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json(
                    WSResponse(type="pong", data={}).model_dump(mode="json")
                )

            elif msg_type == "task":
                assert ollama is not None
                user_message = data.get("data", {}).get("message", "")
                if not user_message:
                    await websocket.send_json(
                        WSResponse(
                            type="error", data={"error": "Empty message"}
                        ).model_dump(mode="json")
                    )
                    continue

                async def on_message(msg: AgentMessage) -> None:
                    await _broadcast_ws(
                        session_id,
                        WSResponse(
                            type="message", data=msg.model_dump(mode="json")
                        ),
                    )

                orch = Orchestrator(
                    ollama=ollama, memory=memory, on_message=on_message
                )
                active_sessions[session_id] = orch
                asyncio.create_task(_run_task(session_id, orch, user_message))

                await websocket.send_json(
                    WSResponse(
                        type="status",
                        data={"status": "started", "session_id": session_id},
                    ).model_dump(mode="json")
                )

            elif msg_type == "stop":
                if session_id in active_sessions:
                    active_sessions[session_id].stop()
                    await websocket.send_json(
                        WSResponse(
                            type="status", data={"status": "stopping"}
                        ).model_dump(mode="json")
                    )

    except WebSocketDisconnect:
        pass
    finally:
        if session_id in ws_connections:
            ws_connections[session_id] = [
                ws for ws in ws_connections[session_id] if ws != websocket
            ]
            if not ws_connections[session_id]:
                del ws_connections[session_id]


async def _broadcast_ws(session_id: str, response: WSResponse) -> None:
    if session_id not in ws_connections:
        return
    payload = response.model_dump(mode="json")
    dead: list[WebSocket] = []
    for ws in ws_connections[session_id]:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections[session_id].remove(ws)


def _format_size(size_bytes: int) -> str:
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    return f"{size:.1f} {units[i]}"
