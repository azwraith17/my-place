import httpx
from fastapi import APIRouter, HTTPException, Query

from ..auth import Auth
from ..config import settings

router = APIRouter(prefix="/api/translate", tags=["translate"])


@router.get("")
async def translate(
    q: str = Query(..., description="Text to translate"),
    source: str = Query("en"),
    target: str = Query("fa"),
    _: None = Auth,
):
    url = f"{settings.libretranslate_url}/translate"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json={"q": q, "source": source, "target": target})
        if resp.status_code != 200:
            raise HTTPException(502, detail="Translation service error")
        return resp.json()
    except httpx.RequestError as e:
        raise HTTPException(503, detail=f"Translation service unreachable: {e}")
