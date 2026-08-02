"""
Optional SQLite Database Module
Provides server-side persistence as an alternative to browser localStorage.

When ENABLE_DATABASE=true in .env, all project data is also saved to SQLite.
This allows data recovery, cross-browser access, and backup.
localStorage remains the primary store; DB is a secondary mirror.
"""

import os
import json
import sqlite3
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from contextlib import contextmanager

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DATABASE_PATH", "ninglet_data.db")
ENABLED = os.getenv("ENABLE_DATABASE", "false").lower() == "true"


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize database tables. Called on startup if ENABLE_DATABASE=true."""
    if not ENABLED:
        return

    logger.info(f"Initializing database at {DB_PATH}")
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '未命名项目',
                data TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                chapter_idx INTEGER NOT NULL,
                title TEXT DEFAULT '',
                content TEXT DEFAULT '',
                outline TEXT DEFAULT '',
                summary TEXT DEFAULT '',
                ai_score INTEGER DEFAULT 0,
                word_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                UNIQUE(project_id, chapter_idx)
            );

            # NOTE: memories 和 config_snapshots 表已定义但当前未使用
            # memories 系统完全在前端运行，通过 API 传递数据给后端搜索
            # 如需启用服务端记忆持久化，可在此添加写入逻辑
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                entry_type TEXT NOT NULL DEFAULT 'fact',
                content TEXT NOT NULL,
                chapter_idx INTEGER DEFAULT -1,
                tags TEXT DEFAULT '[]',
                importance INTEGER DEFAULT 5,
                access_count INTEGER DEFAULT 0,
                decay_factor REAL DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE IF NOT EXISTS config_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                config_type TEXT NOT NULL,
                config_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, chapter_idx);
            CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
            CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(entry_type);
        """)
    logger.info("Database initialized successfully")


def save_project_state(project_id: str, state: Dict[str, Any]):
    """Save full project state to database."""
    if not ENABLED:
        return
    try:
        with get_db() as conn:
            now = datetime.now().isoformat()
            conn.execute("""
                INSERT INTO projects (id, name, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    data = excluded.data,
                    updated_at = excluded.updated_at
            """, (project_id, state.get("name", "未命名项目"), json.dumps(state, ensure_ascii=False), now))
    except Exception as e:
        logger.error(f"Failed to save project state: {e}")


def save_chapter(project_id: str, chapter_idx: int, data: Dict[str, Any]):
    """Save or update a single chapter."""
    if not ENABLED:
        return
    try:
        with get_db() as conn:
            now = datetime.now().isoformat()
            content = data.get("content", "")
            word_count = len(content.replace(" ", "").replace("\n", ""))
            conn.execute("""
                INSERT INTO chapters (project_id, chapter_idx, title, content, outline, summary, ai_score, word_count, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, chapter_idx) DO UPDATE SET
                    title = excluded.title,
                    content = excluded.content,
                    outline = excluded.outline,
                    summary = excluded.summary,
                    ai_score = excluded.ai_score,
                    word_count = excluded.word_count,
                    updated_at = excluded.updated_at
            """, (
                project_id, chapter_idx,
                data.get("title", ""),
                content,
                data.get("outline", ""),
                data.get("summary", ""),
                data.get("aiScore", 0),
                word_count,
                now,
            ))
    except Exception as e:
        logger.error(f"Failed to save chapter {chapter_idx}: {e}")


def get_project_state(project_id: str) -> Optional[Dict[str, Any]]:
    """Load project state from database."""
    if not ENABLED:
        return None
    try:
        with get_db() as conn:
            row = conn.execute("SELECT data FROM projects WHERE id = ?", (project_id,)).fetchone()
            if row:
                return json.loads(row["data"])
    except Exception as e:
        logger.error(f"Failed to load project state: {e}")
    return None


def list_projects() -> List[Dict[str, Any]]:
    """List all saved projects."""
    if not ENABLED:
        return []
    try:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Failed to list projects: {e}")
    return []


def get_chapters(project_id: str) -> List[Dict[str, Any]]:
    """Get all chapters for a project."""
    if not ENABLED:
        return []
    try:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM chapters WHERE project_id = ? ORDER BY chapter_idx",
                (project_id,)
            ).fetchall()
            return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Failed to get chapters: {e}")
    return []
