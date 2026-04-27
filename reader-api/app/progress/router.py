from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..auth import Auth
from ..storage import book_dir, read_json, atomic_write_json

router = APIRouter(prefix="/api/books/{book_id}/progress", tags=["progress"])


class ProgressData(BaseModel):
    location: str | int | None = None
    updated_at: datetime | None = None


class ProgressUpdate(BaseModel):
    location: str | int


@router.get("", response_model=ProgressData)
async def get_progress(book_id: str, _: None = Auth):
    p = book_dir(book_id) / "progress.json"
    if not p.exists():
        return ProgressData()
    try:
        return ProgressData(**read_json(p))
    except Exception:
        return ProgressData()


@router.put("", response_model=ProgressData)
async def save_progress(book_id: str, body: ProgressUpdate, _: None = Auth):
    d = book_dir(book_id)
    if not d.exists():
        raise HTTPException(404, detail="Book not found")
    data = {"location": body.location, "updated_at": datetime.now(timezone.utc).isoformat()}
    atomic_write_json(d / "progress.json", data)
    return ProgressData(**data)
