"""Pydantic models for API requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Role(str, Enum):
    USER = "user"
    PLANNER = "planner"
    EXECUTOR = "executor"
    REVIEWER = "reviewer"
    SYSTEM = "system"


class ToolCall(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: str | None = None
    success: bool = True


class AgentMessage(BaseModel):
    role: Role
    content: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    iteration: int = 0


class TaskStatus(str, Enum):
    PENDING = "pending"
    PLANNING = "planning"
    EXECUTING = "executing"
    REVIEWING = "reviewing"
    TESTING = "testing"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class TaskRequest(BaseModel):
    message: str
    session_id: str | None = None


class TaskResponse(BaseModel):
    session_id: str
    status: TaskStatus
    messages: list[AgentMessage] = Field(default_factory=list)


class ModelInfo(BaseModel):
    name: str
    size: str | None = None
    modified_at: str | None = None
    digest: str | None = None


class ModelAssignment(BaseModel):
    planner: str
    executor: str
    reviewer: str


class SessionInfo(BaseModel):
    session_id: str
    status: TaskStatus
    created_at: datetime
    message_count: int
    last_message: str | None = None


class WSMessage(BaseModel):
    type: str  # "task", "stop", "status", "ping"
    data: dict[str, Any] = Field(default_factory=dict)


class WSResponse(BaseModel):
    type: str  # "message", "status", "tool_output", "error", "done", "pong"
    data: dict[str, Any] = Field(default_factory=dict)
