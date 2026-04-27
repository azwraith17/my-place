import sqlite3
from pathlib import Path
from typing import Any

from ..config import settings
from ..highlights.models import Highlight


def _db_path() -> Path:
    return settings.data_path / "search.db"


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_db_path()))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5(
            highlight_id UNINDEXED,
            book_id UNINDEXED,
            book_title,
            text,
            note,
            color UNINDEXED,
            tokenize = 'unicode61 remove_diacritics 2'
        );
        CREATE TABLE IF NOT EXISTS fts_meta (
            book_id TEXT PRIMARY KEY,
            last_indexed REAL
        );
    """)
    conn.commit()


async def startup_verify() -> None:
    """On startup, resync any books whose highlights.json is newer than last index."""
    settings.data_path.mkdir(parents=True, exist_ok=True)
    conn = _conn()
    _init_db(conn)

    lib = settings.library_path
    if not lib.exists():
        conn.close()
        return

    rows = {r["book_id"]: r["last_indexed"] for r in conn.execute("SELECT book_id, last_indexed FROM fts_meta")}
    for d in lib.iterdir():
        hp = d / "highlights.json"
        mp = d / "metadata.json"
        if not hp.exists() or not mp.exists():
            continue
        mtime = hp.stat().st_mtime
        book_id = d.name
        if rows.get(book_id, 0) < mtime:
            _reindex_book(conn, book_id)

    conn.close()


def _reindex_book(conn: sqlite3.Connection, book_id: str) -> None:
    import json

    hp = settings.library_path / book_id / "highlights.json"
    mp = settings.library_path / book_id / "metadata.json"
    if not hp.exists():
        return

    with open(hp) as f:
        store = json.load(f)
    with open(mp) as f:
        meta = json.load(f)

    title = meta.get("title", "")
    conn.execute("DELETE FROM highlights_fts WHERE book_id = ?", (book_id,))
    for h in store.get("highlights", []):
        conn.execute(
            "INSERT INTO highlights_fts(highlight_id, book_id, book_title, text, note, color) VALUES (?,?,?,?,?,?)",
            (h["id"], book_id, title, h.get("text", ""), h.get("note", ""), h.get("color", "")),
        )
    conn.execute(
        "INSERT OR REPLACE INTO fts_meta(book_id, last_indexed) VALUES (?, ?)",
        (book_id, (settings.library_path / book_id / "highlights.json").stat().st_mtime),
    )
    conn.commit()


async def upsert_highlight(h: Highlight, book_id: str, book_title: str) -> None:
    conn = _conn()
    _init_db(conn)
    conn.execute("DELETE FROM highlights_fts WHERE highlight_id = ?", (h.id,))
    conn.execute(
        "INSERT INTO highlights_fts(highlight_id, book_id, book_title, text, note, color) VALUES (?,?,?,?,?,?)",
        (h.id, book_id, book_title, h.text, h.note, h.color),
    )
    conn.commit()
    conn.close()


async def delete_highlight(hid: str) -> None:
    conn = _conn()
    _init_db(conn)
    conn.execute("DELETE FROM highlights_fts WHERE highlight_id = ?", (hid,))
    conn.commit()
    conn.close()


async def remove_book_from_index(book_id: str) -> None:
    conn = _conn()
    _init_db(conn)
    conn.execute("DELETE FROM highlights_fts WHERE book_id = ?", (book_id,))
    conn.execute("DELETE FROM fts_meta WHERE book_id = ?", (book_id,))
    conn.commit()
    conn.close()


def fts_search(q: str, color: str | None = None, book_id: str | None = None) -> list[dict]:
    conn = _conn()
    _init_db(conn)

    conditions = ["highlights_fts MATCH ?"]
    params: list[Any] = [q]

    if color:
        conditions.append("color = ?")
        params.append(color)
    if book_id:
        conditions.append("book_id = ?")
        params.append(book_id)

    where = " AND ".join(conditions)
    rows = conn.execute(
        f"SELECT highlight_id, book_id, book_title, text, note, color, "
        f"snippet(highlights_fts, 3, '<mark>', '</mark>', '…', 20) as snippet "
        f"FROM highlights_fts WHERE {where} "
        f"ORDER BY rank LIMIT 50",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
