"""Multi-model orchestrator — the brain of TriMind Agent.

Coordinates 3 LLM models in symbiosis:
  - Planner: Strategic reasoning, task decomposition
  - Executor: Code generation, command execution
  - Reviewer: Validation, error detection, improvement suggestions

Runs an autonomous loop: Plan → Execute → Review → Test → (repeat until done).
"""

import asyncio
import json
import logging
from typing import Any, Callable, Coroutine

from app.agent.memory import MemoryStore
from app.agent.ollama_client import OllamaClient
from app.config import get_config
from app.models import AgentMessage, Role, TaskStatus, ToolCall
from app.tools.browser import BrowserTool
from app.tools.file_manager import FileManagerTool
from app.tools.git_tool import GitTool
from app.tools.shell import ShellTool

logger = logging.getLogger("trimind.orchestrator")

# --- System prompts for each model role ---

PLANNER_SYSTEM = """You are the PLANNER of TriMind Agent — an autonomous AI development system.
Your role: Analyze the user's request, break it down into clear steps, and decide which tools to use.

Available tools:
- shell(command): Execute a shell command
- browser(url): Browse a webpage
- write_file(path, content): Write content to a file
- read_file(path): Read a file
- list_dir(path): List directory contents
- git_init(path): Initialize a git repository
- git_push(path, repo_name, remote_url): Push project to a remote git repository

You MUST respond in valid JSON with this exact structure:
{
  "analysis": "Brief analysis of the current state",
  "plan": ["step 1", "step 2", ...],
  "next_action": {
    "tool": "tool_name",
    "args": {"arg1": "value1"}
  },
  "is_complete": false
}

Set "is_complete" to true ONLY when the entire task is fully done and tested.
When using write_file, always provide complete file content — never use placeholders or partial code.
Think step by step. Be thorough. Generate COMPLETE, WORKING code."""

EXECUTOR_SYSTEM = """You are the EXECUTOR of TriMind Agent — an autonomous AI development system.
Your role: Take the planner's instructions and produce COMPLETE, WORKING code or commands.

Rules:
1. Write COMPLETE files — never use placeholders like "// ... rest of code" or "TODO"
2. All code must be production-quality, fully functional
3. Include ALL imports, dependencies, error handling
4. When writing code, write THE ENTIRE FILE content

You MUST respond in valid JSON:
{
  "action": "tool_name",
  "args": {"arg1": "value1"},
  "explanation": "What this does and why"
}

For write_file, "args" must have "path" and "content" (the FULL file content).
For shell, "args" must have "command".
For browser, "args" must have "url"."""

REVIEWER_SYSTEM = """You are the REVIEWER of TriMind Agent — an autonomous AI development system.
Your role: Analyze the output of executed actions, detect errors, and decide next steps.

You receive the action that was taken and its result. You must:
1. Check if the action succeeded
2. Identify any errors or issues
3. Decide if we should continue, retry, or fix something

You MUST respond in valid JSON:
{
  "assessment": "passed" | "failed" | "needs_improvement",
  "issues": ["issue 1", "issue 2"],
  "suggestion": "What to do next",
  "should_test": true | false,
  "test_command": "command to test (if should_test is true)",
  "is_project_complete": false
}

Be strict but fair. Only mark "is_project_complete" as true when everything works."""


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from model response, handling markdown code blocks."""
    text = text.strip()
    # Try to find JSON in code blocks
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        text = text[start:end].strip()
    # Find first { and last }
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end != -1:
        text = text[brace_start : brace_end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"error": "Failed to parse JSON", "raw": text[:500]}


class Orchestrator:
    """Coordinates the 3 models in an autonomous loop."""

    def __init__(
        self,
        ollama: OllamaClient,
        memory: MemoryStore,
        on_message: Callable[[AgentMessage], Coroutine[Any, Any, None]] | None = None,
    ):
        self.ollama = ollama
        self.memory = memory
        self.on_message = on_message

        cfg = get_config()
        self.planner_model = cfg.models.planner
        self.executor_model = cfg.models.executor
        self.reviewer_model = cfg.models.reviewer
        self.max_iterations = cfg.agent.max_iterations
        self.temperature = cfg.agent.temperature
        self.max_tokens = cfg.agent.max_tokens

        # Tools
        self.shell = ShellTool(
            workspace=cfg.tools.file_manager.workspace,
            timeout=cfg.tools.shell.timeout,
        )
        self.browser = BrowserTool(timeout=cfg.tools.browser.timeout)
        self.file_manager = FileManagerTool(workspace=cfg.tools.file_manager.workspace)
        self.git = GitTool(workspace=cfg.tools.file_manager.workspace)

        # State
        self._stop_flag = False
        self._status = TaskStatus.PENDING

    @property
    def status(self) -> TaskStatus:
        return self._status

    def stop(self) -> None:
        """Signal the agent to stop."""
        self._stop_flag = True

    def update_models(self, planner: str, executor: str, reviewer: str) -> None:
        """Dynamically update which models are assigned to each role."""
        self.planner_model = planner
        self.executor_model = executor
        self.reviewer_model = reviewer

    async def _emit(self, msg: AgentMessage) -> None:
        """Emit a message to the callback and save to memory."""
        if self.on_message:
            await self.on_message(msg)

    async def _call_model(self, model: str, system: str, prompt: str) -> str:
        """Call an Ollama model with retry."""
        for attempt in range(3):
            try:
                result = await self.ollama.chat(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                )
                if isinstance(result, str):
                    return result
                return str(result)
            except Exception as e:
                logger.warning(f"Model call failed (attempt {attempt + 1}): {e}")
                if attempt == 2:
                    return json.dumps({"error": f"Model unavailable: {e}"})
                await asyncio.sleep(1)
        return json.dumps({"error": "All retries failed"})

    async def _execute_tool(self, tool: str, args: dict[str, Any]) -> ToolCall:
        """Execute an agent tool and return the result."""
        tool_call = ToolCall(tool=tool, args=args)

        try:
            if tool == "shell":
                result = await self.shell.execute(args.get("command", ""))
                tool_call.result = result.output
                tool_call.success = result.success
            elif tool == "browser":
                result = await self.browser.browse(args.get("url", ""))
                tool_call.result = result.summary
                tool_call.success = result.success
            elif tool == "search":
                result = await self.browser.search(args.get("query", ""))
                tool_call.result = result.summary
                tool_call.success = result.success
            elif tool == "write_file":
                result = await self.file_manager.write_file(
                    args.get("path", ""), args.get("content", "")
                )
                tool_call.result = result.output
                tool_call.success = result.success
            elif tool == "read_file":
                result = await self.file_manager.read_file(args.get("path", ""))
                tool_call.result = result.output
                tool_call.success = result.success
            elif tool == "list_dir":
                result = await self.file_manager.list_dir(args.get("path", "."))
                tool_call.result = result.output
                tool_call.success = result.success
            elif tool == "tree":
                result = await self.file_manager.tree(args.get("path", "."))
                tool_call.result = result.output
                tool_call.success = result.success
            elif tool == "git_init":
                result = await self.git.init_repo(args.get("path", "."))
                tool_call.result = result.message
                tool_call.success = result.success
            elif tool == "git_push":
                result = await self.git.create_and_push(
                    project_path=args.get("path", "."),
                    repo_name=args.get("repo_name", ""),
                    remote_url=args.get("remote_url"),
                    token=args.get("token"),
                    username=args.get("username"),
                )
                tool_call.result = result.message
                tool_call.success = result.success
            else:
                tool_call.result = f"Unknown tool: {tool}"
                tool_call.success = False
        except Exception as e:
            tool_call.result = f"Tool error: {e}"
            tool_call.success = False

        return tool_call

    async def run(self, session_id: str, user_message: str) -> None:
        """Run the full autonomous agent loop for a task."""
        self._stop_flag = False
        self._status = TaskStatus.PLANNING

        # Save user message
        await self.memory.save_message(session_id, "user", user_message)

        # Build context from memory
        context = await self.memory.get_context_summary(session_id)

        # Emit user message
        await self._emit(AgentMessage(role=Role.USER, content=user_message))

        history: list[dict[str, str]] = []
        iteration = 0

        while iteration < self.max_iterations and not self._stop_flag:
            iteration += 1
            logger.info(f"=== Iteration {iteration}/{self.max_iterations} ===")

            # --- PHASE 1: PLANNER ---
            self._status = TaskStatus.PLANNING

            plan_prompt = self._build_planner_prompt(
                user_message, context, history, iteration
            )
            planner_raw = await self._call_model(
                self.planner_model, PLANNER_SYSTEM, plan_prompt
            )
            planner_data = _extract_json(planner_raw)

            plan_msg = AgentMessage(
                role=Role.PLANNER,
                content=planner_data.get("analysis", planner_raw[:500]),
                iteration=iteration,
            )
            await self._emit(plan_msg)
            await self.memory.save_message(
                session_id, "planner", plan_msg.content, iteration=iteration
            )

            # Check if planner says we're done
            if planner_data.get("is_complete"):
                self._status = TaskStatus.COMPLETED
                await self._emit(
                    AgentMessage(
                        role=Role.SYSTEM,
                        content="✅ Project completed successfully!",
                        iteration=iteration,
                    )
                )
                await self.memory.save_message(session_id, "system", "Task completed")
                return

            # Get next action from planner
            next_action = planner_data.get("next_action", {})
            tool_name = next_action.get("tool", "")
            tool_args = next_action.get("args", {})

            if not tool_name:
                # If planner didn't give an action, ask executor to decide
                tool_name = "shell"
                tool_args = {"command": "echo 'Awaiting instructions'"}

            # --- PHASE 2: EXECUTOR ---
            self._status = TaskStatus.EXECUTING

            exec_prompt = self._build_executor_prompt(
                user_message, planner_data, history
            )
            executor_raw = await self._call_model(
                self.executor_model, EXECUTOR_SYSTEM, exec_prompt
            )
            executor_data = _extract_json(executor_raw)

            # Use executor's refined action if available
            exec_tool = executor_data.get("action", tool_name)
            exec_args = executor_data.get("args", tool_args)

            # Execute the tool
            tool_call = await self._execute_tool(exec_tool, exec_args)

            exec_msg = AgentMessage(
                role=Role.EXECUTOR,
                content=executor_data.get("explanation", f"Executing: {exec_tool}"),
                tool_calls=[tool_call],
                iteration=iteration,
            )
            await self._emit(exec_msg)
            await self.memory.save_message(
                session_id,
                "executor",
                exec_msg.content,
                tool_calls=[tool_call.model_dump()],
                iteration=iteration,
            )

            # --- PHASE 3: REVIEWER ---
            self._status = TaskStatus.REVIEWING

            review_prompt = self._build_reviewer_prompt(
                user_message, planner_data, tool_call, history
            )
            reviewer_raw = await self._call_model(
                self.reviewer_model, REVIEWER_SYSTEM, review_prompt
            )
            reviewer_data = _extract_json(reviewer_raw)

            review_msg = AgentMessage(
                role=Role.REVIEWER,
                content=reviewer_data.get("assessment", "reviewing")
                + ": "
                + reviewer_data.get("suggestion", reviewer_raw[:300]),
                iteration=iteration,
            )
            await self._emit(review_msg)
            await self.memory.save_message(
                session_id, "reviewer", review_msg.content, iteration=iteration
            )

            # --- PHASE 4: AUTO-TEST ---
            if reviewer_data.get("should_test") and reviewer_data.get("test_command"):
                self._status = TaskStatus.TESTING
                test_result = await self.shell.execute(
                    reviewer_data["test_command"]
                )
                test_call = ToolCall(
                    tool="shell",
                    args={"command": reviewer_data["test_command"]},
                    result=test_result.output,
                    success=test_result.success,
                )
                test_msg = AgentMessage(
                    role=Role.SYSTEM,
                    content=f"Test {'PASSED ✅' if test_result.success else 'FAILED ❌'}: {reviewer_data['test_command']}",
                    tool_calls=[test_call],
                    iteration=iteration,
                )
                await self._emit(test_msg)

            # Check if reviewer says project is complete
            if reviewer_data.get("is_project_complete"):
                self._status = TaskStatus.COMPLETED
                await self._emit(
                    AgentMessage(
                        role=Role.SYSTEM,
                        content="✅ Project completed and validated by reviewer!",
                        iteration=iteration,
                    )
                )
                await self.memory.save_message(session_id, "system", "Task completed")
                return

            # Update history for next iteration
            history.append(
                {
                    "iteration": str(iteration),
                    "plan": planner_data.get("analysis", ""),
                    "action": f"{exec_tool}({json.dumps(exec_args)[:200]})",
                    "result": (tool_call.result or "")[:500],
                    "review": reviewer_data.get("assessment", ""),
                    "suggestion": reviewer_data.get("suggestion", ""),
                }
            )

        # Max iterations reached
        if self._stop_flag:
            self._status = TaskStatus.STOPPED
            await self._emit(
                AgentMessage(role=Role.SYSTEM, content="Agent stopped by user.")
            )
        else:
            self._status = TaskStatus.FAILED
            await self._emit(
                AgentMessage(
                    role=Role.SYSTEM,
                    content=f"Reached max iterations ({self.max_iterations}). Task may be incomplete.",
                )
            )

    def _build_planner_prompt(
        self,
        task: str,
        context: str,
        history: list[dict[str, str]],
        iteration: int,
    ) -> str:
        parts = [f"## Task\n{task}\n"]
        if context:
            parts.append(f"## Memory Context\n{context}\n")
        if history:
            parts.append("## Previous Iterations")
            for h in history[-5:]:
                parts.append(
                    f"- Iter {h['iteration']}: {h['action']} → {h['review']} | {h['suggestion']}"
                )
            parts.append("")
        parts.append(f"Current iteration: {iteration}/{self.max_iterations}")
        parts.append("Respond with your plan as JSON.")
        return "\n".join(parts)

    def _build_executor_prompt(
        self,
        task: str,
        plan: dict[str, Any],
        history: list[dict[str, str]],
    ) -> str:
        parts = [f"## Task\n{task}\n"]
        parts.append(f"## Planner's Analysis\n{plan.get('analysis', 'N/A')}\n")
        steps = plan.get("plan", [])
        if steps:
            parts.append("## Steps\n" + "\n".join(f"- {s}" for s in steps) + "\n")
        next_action = plan.get("next_action", {})
        if next_action:
            parts.append(f"## Requested Action\nTool: {next_action.get('tool')}\nArgs: {json.dumps(next_action.get('args', {}))}\n")
        if history:
            last = history[-1]
            parts.append(f"## Last Result\n{last.get('result', 'N/A')[:500]}\n")
        parts.append("Execute this action. Respond with JSON. For write_file, provide the COMPLETE file content.")
        return "\n".join(parts)

    def _build_reviewer_prompt(
        self,
        task: str,
        plan: dict[str, Any],
        tool_call: ToolCall,
        history: list[dict[str, str]],
    ) -> str:
        parts = [f"## Original Task\n{task}\n"]
        parts.append(f"## Plan\n{plan.get('analysis', 'N/A')}\n")
        parts.append(f"## Action Taken\nTool: {tool_call.tool}\nArgs: {json.dumps(tool_call.args)[:500]}\n")
        parts.append(f"## Result\nSuccess: {tool_call.success}\n{(tool_call.result or 'No output')[:1500]}\n")
        if history:
            parts.append(f"## Iteration Count: {len(history) + 1}")
        parts.append("Review this result. Respond with JSON. Be strict — only mark complete when everything works.")
        return "\n".join(parts)
