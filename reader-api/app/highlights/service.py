from datetime import datetime, timezone
from pathlib import Path

from ..storage import book_dir, read_json, atomic_write_json, book_lock
from ..library.service import get_book
from .models import Highlight, HighlightCreate, HighlightPatch, HighlightStore
from .exports import regenerate_exports


def _highlights_path(book_id: str) -> Path:
    return book_dir(book_id) / "highlights.json"


def _load_store(book_id: str) -> HighlightStore:
    path = _highlights_path(book_id)
    if not path.exists():
        raise FileNotFoundError(f"No highlights store for {book_id}")
    return HighlightStore(**read_json(path))


def _save_store(store: HighlightStore, book_id: str, title: str) -> None:
    path = _highlights_path(book_id)
    atomic_write_json(path, store.model_dump(mode="json"))
    regenerate_exports(store, book_dir(book_id), title)


async def get_highlights(book_id: str) -> list[Highlight]:
    async with book_lock(book_id):
        return _load_store(book_id).highlights


async def create_highlight(book_id: str, body: HighlightCreate) -> Highlight:
    from ..search.index import upsert_highlight

    meta = get_book(book_id)
    if not meta:
        raise FileNotFoundError("Book not found")

    async with book_lock(book_id):
        store = _load_store(book_id)

        # idempotent on client ULID
        existing = next((h for h in store.highlights if h.id == body.id), None)
        if existing:
            return existing

        now = datetime.now(timezone.utc)
        h = Highlight(
            id=body.id,
            color=body.color,
            text=body.text,
            note=body.note,
            created_at=now,
            updated_at=now,
            group_id=body.group_id,
            location=body.location,
        )
        store.highlights.append(h)
        _save_store(store, book_id, meta.title)

    await upsert_highlight(h, book_id, meta.title)
    return h


async def patch_highlight(book_id: str, hid: str, patch: HighlightPatch) -> Highlight:
    from ..search.index import upsert_highlight

    meta = get_book(book_id)
    if not meta:
        raise FileNotFoundError("Book not found")

    async with book_lock(book_id):
        store = _load_store(book_id)
        h = next((h for h in store.highlights if h.id == hid), None)
        if h is None:
            raise KeyError("Highlight not found")

        if patch.color is not None:
            h.color = patch.color
        if patch.note is not None:
            h.note = patch.note
        h.updated_at = datetime.now(timezone.utc)
        _save_store(store, book_id, meta.title)

    await upsert_highlight(h, book_id, meta.title)
    return h


async def delete_highlight(book_id: str, hid: str) -> None:
    from ..search.index import delete_highlight as fts_delete

    meta = get_book(book_id)
    if not meta:
        raise FileNotFoundError("Book not found")

    async with book_lock(book_id):
        store = _load_store(book_id)
        original_count = len(store.highlights)
        store.highlights = [h for h in store.highlights if h.id != hid]
        if len(store.highlights) == original_count:
            raise KeyError("Highlight not found")
        _save_store(store, book_id, meta.title)

    await fts_delete(hid)
