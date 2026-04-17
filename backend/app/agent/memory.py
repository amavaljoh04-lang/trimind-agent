"""Persistent memory system using SQLite."""

import json
import os
from datetime import datetime

import aiosqlite


class MemoryStore:
    """Long-term memory storage for the agent."""

    def __init__(self, db_path: str = "./data/memory.db"):
        self.db_path = os.path.abspath(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._db: aiosqlite.Connection | None = None

    async def initialize(self) -> None:
        """Create tables if they don't exist."""
        self._db = await aiosqlite.connect(self.db_path)
        await self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls TEXT DEFAULT '[]',
                timestamp TEXT NOT NULL,
                iteration INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                created_at TEXT NOT NULL,
                UNIQUE(key, category)
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'active',
                files TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
            CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
            CREATE INDEX IF NOT EXISTS idx_projects_session ON projects(session_id);
            """
        )
        await self._db.commit()

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None

    # --- Conversation Memory ---

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        tool_calls: list[dict] | None = None,
        iteration: int = 0,
    ) -> None:
        """Save a conversation message."""
        assert self._db is not None
        await self._db.execute(
            "INSERT INTO conversations (session_id, role, content, tool_calls, timestamp, iteration) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                session_id,
                role,
                content,
                json.dumps(tool_calls or []),
                datetime.utcnow().isoformat(),
                iteration,
            ),
        )
        await self._db.commit()

    async def get_conversation(
        self, session_id: str, limit: int = 50
    ) -> list[dict]:
        """Retrieve conversation history for a session."""
        assert self._db is not None
        cursor = await self._db.execute(
            "SELECT role, content, tool_calls, timestamp, iteration "
            "FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        )
        rows = await cursor.fetchall()
        return [
            {
                "role": r[0],
                "content": r[1],
                "tool_calls": json.loads(r[2]),
                "timestamp": r[3],
                "iteration": r[4],
            }
            for r in reversed(rows)
        ]

    async def get_all_sessions(self) -> list[dict]:
        """Get summary of all sessions."""
        assert self._db is not None
        cursor = await self._db.execute(
            """
            SELECT session_id,
                   MIN(timestamp) as created_at,
                   COUNT(*) as message_count,
                   (SELECT content FROM conversations c2
                    WHERE c2.session_id = c1.session_id
                    ORDER BY c2.id DESC LIMIT 1) as last_message
            FROM conversations c1
            GROUP BY session_id
            ORDER BY MAX(timestamp) DESC
            """
        )
        rows = await cursor.fetchall()
        return [
            {
                "session_id": r[0],
                "created_at": r[1],
                "message_count": r[2],
                "last_message": r[3][:100] if r[3] else None,
            }
            for r in rows
        ]

    # --- Facts Memory ---

    async def save_fact(
        self, key: str, value: str, category: str = "general", session_id: str | None = None
    ) -> None:
        """Store a key fact the agent learned."""
        assert self._db is not None
        await self._db.execute(
            "INSERT OR REPLACE INTO facts (session_id, key, value, category, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (session_id, key, value, category, datetime.utcnow().isoformat()),
        )
        await self._db.commit()

    async def get_facts(self, category: str | None = None) -> list[dict]:
        """Retrieve stored facts."""
        assert self._db is not None
        if category:
            cursor = await self._db.execute(
                "SELECT key, value, category, created_at FROM facts WHERE category = ?",
                (category,),
            )
        else:
            cursor = await self._db.execute(
                "SELECT key, value, category, created_at FROM facts"
            )
        rows = await cursor.fetchall()
        return [
            {"key": r[0], "value": r[1], "category": r[2], "created_at": r[3]}
            for r in rows
        ]

    async def search_facts(self, query: str) -> list[dict]:
        """Search facts by key or value."""
        assert self._db is not None
        cursor = await self._db.execute(
            "SELECT key, value, category, created_at FROM facts "
            "WHERE key LIKE ? OR value LIKE ?",
            (f"%{query}%", f"%{query}%"),
        )
        rows = await cursor.fetchall()
        return [
            {"key": r[0], "value": r[1], "category": r[2], "created_at": r[3]}
            for r in rows
        ]

    # --- Project Memory ---

    async def save_project(
        self,
        session_id: str,
        name: str,
        description: str = "",
        files: list[str] | None = None,
    ) -> int:
        """Track a project the agent is working on."""
        assert self._db is not None
        now = datetime.utcnow().isoformat()
        cursor = await self._db.execute(
            "INSERT INTO projects (session_id, name, description, files, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (session_id, name, description, json.dumps(files or []), now, now),
        )
        await self._db.commit()
        return cursor.lastrowid or 0

    async def update_project(
        self,
        project_id: int,
        status: str | None = None,
        files: list[str] | None = None,
        description: str | None = None,
    ) -> None:
        """Update project status or files."""
        assert self._db is not None
        updates: list[str] = []
        values: list[str | int] = []
        if status:
            updates.append("status = ?")
            values.append(status)
        if files is not None:
            updates.append("files = ?")
            values.append(json.dumps(files))
        if description:
            updates.append("description = ?")
            values.append(description)
        updates.append("updated_at = ?")
        values.append(datetime.utcnow().isoformat())
        values.append(project_id)

        await self._db.execute(
            f"UPDATE projects SET {', '.join(updates)} WHERE id = ?",
            values,
        )
        await self._db.commit()

    async def get_context_summary(self, session_id: str) -> str:
        """Build a context summary from memory for the agent."""
        parts: list[str] = []

        # Recent facts
        facts = await self.get_facts()
        if facts:
            fact_lines = [f"- {f['key']}: {f['value']}" for f in facts[-10:]]
            parts.append("Known facts:\n" + "\n".join(fact_lines))

        # Recent conversation summary
        conv = await self.get_conversation(session_id, limit=5)
        if conv:
            recent = [f"[{m['role']}]: {m['content'][:200]}" for m in conv]
            parts.append("Recent conversation:\n" + "\n".join(recent))

        return "\n\n".join(parts) if parts else "No prior context available."
