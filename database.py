import sqlite3
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime

DB_PATH = Path(__file__).parent / "messages.db"


def init_db():
    with connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                device TEXT,
                slow INTEGER NOT NULL DEFAULT 0,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS saved (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                label TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_history_sent_at ON history(sent_at DESC);
        """)
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(history)")}
        if "slow" not in cols:
            conn.execute("ALTER TABLE history ADD COLUMN slow INTEGER NOT NULL DEFAULT 0")
        if "rate" not in cols:
            conn.execute("ALTER TABLE history ADD COLUMN rate INTEGER NOT NULL DEFAULT 100")
            conn.execute("UPDATE history SET rate = 75 WHERE slow = 1")


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def add_history(text: str, device: str | None = None, rate: int = 100):
    with connect() as conn:
        conn.execute(
            "INSERT INTO history (text, device, rate) VALUES (?, ?, ?)",
            (text, device, int(rate)),
        )
        conn.execute("""
            DELETE FROM history WHERE id NOT IN (
                SELECT id FROM history ORDER BY sent_at DESC LIMIT 50
            )
        """)


def get_history(limit: int = 20):
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, text, device, rate, sent_at FROM history ORDER BY sent_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def add_saved(label: str, text: str) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO saved (label, text) VALUES (?, ?)",
            (label, text),
        )
        return cur.lastrowid


def update_saved(saved_id: int, label: str, text: str):
    with connect() as conn:
        conn.execute(
            "UPDATE saved SET label = ?, text = ? WHERE id = ?",
            (label, text, saved_id),
        )


def delete_saved(saved_id: int):
    with connect() as conn:
        conn.execute("DELETE FROM saved WHERE id = ?", (saved_id,))


def get_saved():
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, label, text, created_at FROM saved ORDER BY label COLLATE NOCASE"
        ).fetchall()
    return [dict(r) for r in rows]


# --- Settings repository ---

def get_setting(key: str) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )


def get_all_settings() -> dict:
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}
