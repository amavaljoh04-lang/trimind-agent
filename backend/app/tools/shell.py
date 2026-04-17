"""Shell execution tool for the agent."""

import asyncio
import os
from dataclasses import dataclass


@dataclass
class ShellResult:
    command: str
    stdout: str
    stderr: str
    return_code: int
    timed_out: bool = False

    @property
    def success(self) -> bool:
        return self.return_code == 0 and not self.timed_out

    @property
    def output(self) -> str:
        parts: list[str] = []
        if self.stdout.strip():
            parts.append(self.stdout.strip())
        if self.stderr.strip():
            parts.append(f"STDERR:\n{self.stderr.strip()}")
        if self.timed_out:
            parts.append("[TIMEOUT]")
        if not parts:
            return f"(exit code {self.return_code})"
        return "\n".join(parts)


class ShellTool:
    """Execute shell commands in a sandboxed workspace."""

    def __init__(
        self,
        workspace: str = "./workspace",
        timeout: int = 30,
        allowed_commands: list[str] | None = None,
    ):
        self.workspace = os.path.abspath(workspace)
        self.timeout = timeout
        self.allowed_commands = allowed_commands or []
        os.makedirs(self.workspace, exist_ok=True)

    async def execute(self, command: str, cwd: str | None = None) -> ShellResult:
        """Execute a shell command and return the result."""
        work_dir = cwd or self.workspace

        # Security: block dangerous patterns
        dangerous = ["rm -rf /", "mkfs", "dd if=", ":(){", "fork bomb"]
        for pattern in dangerous:
            if pattern in command:
                return ShellResult(
                    command=command,
                    stdout="",
                    stderr=f"Blocked dangerous command pattern: {pattern}",
                    return_code=1,
                )

        # If allowed_commands is set, check the base command
        if self.allowed_commands:
            base_cmd = command.split()[0] if command.split() else ""
            if base_cmd not in self.allowed_commands:
                return ShellResult(
                    command=command,
                    stdout="",
                    stderr=f"Command '{base_cmd}' not in allowed commands list",
                    return_code=1,
                )

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=work_dir,
                env={**os.environ, "TERM": "dumb"},
            )

            timed_out = False
            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(), timeout=self.timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                stdout_bytes, stderr_bytes = await proc.communicate()
                timed_out = True

            return ShellResult(
                command=command,
                stdout=stdout_bytes.decode("utf-8", errors="replace"),
                stderr=stderr_bytes.decode("utf-8", errors="replace"),
                return_code=proc.returncode or -1,
                timed_out=timed_out,
            )
        except Exception as e:
            return ShellResult(
                command=command,
                stdout="",
                stderr=str(e),
                return_code=1,
            )

    async def execute_multi(self, commands: list[str]) -> list[ShellResult]:
        """Execute multiple commands sequentially."""
        results: list[ShellResult] = []
        for cmd in commands:
            result = await self.execute(cmd)
            results.append(result)
            if not result.success:
                break
        return results
