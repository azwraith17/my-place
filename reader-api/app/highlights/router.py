from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, FileResponse

from ..auth import Auth
from ..storage import book_dir
from .models import Highlight, HighlightCreate, HighlightPatch, Color
from .service import get_highlights, create_highlight, patch_highlight, delete_highlight

router = APIRouter(prefix="/api/books/{book_id}/highlights", tags=["highlights"])


@router.get("", response_model=list[Highlight])
async def list_highlights(book_id: str, _: None = Auth):
    try:
        return await get_highlights(book_id)
    except FileNotFoundError as e:
        raise HTTPException(404, detail=str(e))


@router.post("", response_model=Highlight, status_code=201)
async def add_highlight(book_id: str, body: HighlightCreate, _: None = Auth):
    try:
        return await create_highlight(book_id, body)
    except FileNotFoundError as e:
        raise HTTPException(404, detail=str(e))


@router.patch("/{hid}", response_model=Highlight)
async def update_highlight(book_id: str, hid: str, body: HighlightPatch, _: None = Auth):
    try:
        return await patch_highlight(book_id, hid, body)
    except FileNotFoundError as e:
        raise HTTPException(404, detail=str(e))
    except KeyError as e:
        raise HTTPException(404, detail=str(e))


@router.delete("/{hid}", status_code=204)
async def remove_highlight(book_id: str, hid: str, _: None = Auth):
    try:
        await delete_highlight(book_id, hid)
    except (FileNotFoundError, KeyError) as e:
        raise HTTPException(404, detail=str(e))


@router.get("/export/{color}")
async def export_color(book_id: str, color: Color, _: None = Auth):
    from ..library.service import get_book
    import re

    meta = get_book(book_id)
    if not meta:
        raise HTTPException(404, detail="Book not found")

    slug = re.sub(r"[^\w]", "_", meta.title.lower())[:50]
    p = book_dir(book_id) / "exports" / f"{slug}_{color}.txt"
    if not p.exists():
        return PlainTextResponse("")
    return FileResponse(str(p), media_type="text/plain; charset=utf-8")


@router.get("/export/markdown")
async def export_markdown(book_id: str, _: None = Auth):
    from ..library.service import get_book

    meta = get_book(book_id)
    if not meta:
        raise HTTPException(404, detail="Book not found")

    p = book_dir(book_id) / "exports" / "all_highlights.md"
    if not p.exists():
        return PlainTextResponse("")
    return FileResponse(str(p), media_type="text/markdown; charset=utf-8")
