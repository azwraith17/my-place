from fastapi import APIRouter, Query

from ..auth import Auth
from .index import fts_search

router = APIRouter(prefix="/api/highlights", tags=["search"])


@router.get("/search")
async def search_highlights(
    q: str = Query(...),
    color: str | None = Query(None),
    book: str | None = Query(None),
    _: None = Auth,
):
    return fts_search(q, color, book)
