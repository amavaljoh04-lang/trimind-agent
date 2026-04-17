"""File management tool for the agent."""

import os
from dataclasses import dataclass

import aiofiles


@dataclass
class FileResult:
    path: str
    operation: str
    success: bool
    content: str | None = None
    error: str | None = None

    @property
    def output(self) -> str:
        if not self.success:
            return f"Error ({self.operation}) {self.path}: {self.error}"
        if self.content is not None:
            return self.content
        return f"OK: {self.operation} {self.path}"


class FileManagerTool:
    """File operations within the agent workspace."""

    def __init__(self, workspace: str = "./workspace"):
        self.workspace = os.path.abspath(workspace)
        os.makedirs(self.workspace, exist_ok=True)

    def _resolve(self, path: str) -> str:
        """Resolve path within workspace, preventing directory traversal."""
        resolved = os.path.normpath(os.path.join(self.workspace, path))
        if not resolved.startswith(self.workspace):
            raise ValueError(f"Path escapes workspace: {path}")
        return resolved

    async def read_file(self, path: str) -> FileResult:
        """Read a file."""
        try:
            full = self._resolve(path)
            async with aiofiles.open(full, "r") as f:
                content = await f.read()
            return FileResult(path=path, operation="read", success=True, content=content)
        except Exception as e:
            return FileResult(path=path, operation="read", success=False, error=str(e))

    async def write_file(self, path: str, content: str) -> FileResult:
        """Write content to a file."""
        try:
            full = self._resolve(path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            async with aiofiles.open(full, "w") as f:
                await f.write(content)
            return FileResult(path=path, operation="write", success=True)
        except Exception as e:
            return FileResult(path=path, operation="write", success=False, error=str(e))

    async def list_dir(self, path: str = ".") -> FileResult:
        """List directory contents."""
        try:
            full = self._resolve(path)
            entries: list[str] = []
            for entry in sorted(os.listdir(full)):
                entry_path = os.path.join(full, entry)
                prefix = "d" if os.path.isdir(entry_path) else "f"
                size = os.path.getsize(entry_path) if os.path.isfile(entry_path) else 0
                entries.append(f"[{prefix}] {entry}  ({size} bytes)" if size else f"[{prefix}] {entry}/")
            return FileResult(
                path=path,
                operation="list",
                success=True,
                content="\n".join(entries) if entries else "(empty directory)",
            )
        except Exception as e:
            return FileResult(path=path, operation="list", success=False, error=str(e))

    async def delete_file(self, path: str) -> FileResult:
        """Delete a file."""
        try:
            full = self._resolve(path)
            os.remove(full)
            return FileResult(path=path, operation="delete", success=True)
        except Exception as e:
            return FileResult(path=path, operation="delete", success=False, error=str(e))

    async def tree(self, path: str = ".", max_depth: int = 3) -> FileResult:
        """Show directory tree."""
        try:
            full = self._resolve(path)
            lines: list[str] = []
            self._build_tree(full, lines, "", max_depth, 0)
            return FileResult(
                path=path,
                operation="tree",
                success=True,
                content="\n".join(lines) if lines else "(empty)",
            )
        except Exception as e:
            return FileResult(path=path, operation="tree", success=False, error=str(e))

    def _build_tree(
        self, dir_path: str, lines: list[str], prefix: str, max_depth: int, depth: int
    ) -> None:
        if depth >= max_depth:
            return
        try:
            entries = sorted(os.listdir(dir_path))
        except PermissionError:
            return
        for i, entry in enumerate(entries):
            is_last = i == len(entries) - 1
            connector = "└── " if is_last else "├── "
            entry_path = os.path.join(dir_path, entry)
            lines.append(f"{prefix}{connector}{entry}")
            if os.path.isdir(entry_path):
                ext = "    " if is_last else "│   "
                self._build_tree(entry_path, lines, prefix + ext, max_depth, depth + 1)
