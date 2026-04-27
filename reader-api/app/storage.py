import asyncio
import json
import os
from pathlib import Path
from typing import Any

from .config import settings

_book_locks: dict[str, asyncio.Lock] = {}


def book_lock(book_id: str) -> asyncio.Lock:
    if book_id not in _book_locks:
        _book_locks[book_id] = asyncio.Lock()
    return _book_locks[book_id]


def book_dir(book_id: str) -> Path:
    return settings.library_path / book_id


def ensure_book_dir(book_id: str) -> Path:
    d = book_dir(book_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / "exports").mkdir(exist_ok=True)
    return d


def read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path: Path, data: Any) -> None:
    """Write JSON atomically: tmp → fsync → rename → fsync dir."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, path)
    # fsync the directory so the rename survives power loss on ext4/SD
    dirfd = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(dirfd)
    finally:
        os.close(dirfd)


def atomic_write_text(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.rename(tmp, path)
    dirfd = os.open(str(path.parent), os.O_RDONLY)
    try:
        os.fsync(dirfd)
    finally:
        os.close(dirfd)
