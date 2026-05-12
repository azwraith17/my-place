import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from ..auth import Auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/translate", tags=["translate"])

_ready = False
_init_lock = asyncio.Lock()
_translator = None  # argostranslate translation object


async def _ensure_ready(from_code: str, to_code: str) -> None:
    global _ready, _translator
    if _ready:
        return
    async with _init_lock:
        if _ready:
            return
        logger.info("Initialising local translation model %s→%s …", from_code, to_code)
        await asyncio.get_event_loop().run_in_executor(None, _load_model, from_code, to_code)
        _ready = True
        logger.info("Translation model ready.")


def _load_model(from_code: str, to_code: str) -> None:
    global _translator
    from argostranslate import package, translate

    installed = translate.get_installed_languages()
    from_langs = [l for l in installed if l.code == from_code]
    to_langs   = [l for l in installed if l.code == to_code]

    def _has_pair():
        if not from_langs or not to_langs:
            return False
        return from_langs[0].get_translation(to_langs[0]) is not None

    if not _has_pair():
        logger.info("Downloading language package %s→%s (one-time, ~130 MB) …", from_code, to_code)
        package.update_package_index()
        available = package.get_available_packages()
        pkg = next(
            (p for p in available if p.from_code == from_code and p.to_code == to_code),
            None,
        )
        if pkg is None:
            raise RuntimeError(f"No argostranslate package for {from_code}→{to_code}")
        package.install_from_path(pkg.download())

    installed   = translate.get_installed_languages()
    from_lang   = next(l for l in installed if l.code == from_code)
    to_lang     = next(l for l in installed if l.code == to_code)
    _translator = from_lang.get_translation(to_lang)


@router.get("")
async def translate(
    q: str = Query(..., description="Text to translate"),
    source: str = Query("en"),
    target: str = Query("fa"),
    _: None = Auth,
):
    try:
        await _ensure_ready(source, target)
    except Exception as e:
        raise HTTPException(503, detail=f"Translation model unavailable: {e}")

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _translator.translate, q)
    except Exception as e:
        raise HTTPException(500, detail=f"Translation failed: {e}")

    return {"translatedText": result}
