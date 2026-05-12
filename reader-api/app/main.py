from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .auth import router as auth_router
from .library.router import router as library_router
from .highlights.router import router as highlights_router
from .translate.router import router as translate_router
from .search.router import router as search_router
from .progress.router import router as progress_router
from .budget.router import router as budget_router
from .search.index import startup_verify
from .config import settings

_WEB_DIR = Path(__file__).parent.parent.parent / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.library_path.mkdir(parents=True, exist_ok=True)
    settings.data_path.mkdir(parents=True, exist_ok=True)
    await startup_verify()
    yield


app = FastAPI(title="Reader API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(library_router)
app.include_router(highlights_router)
app.include_router(translate_router)
app.include_router(search_router)
app.include_router(progress_router)
app.include_router(budget_router)

# Serve frontend static files at / (API routes take priority above)
if _WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_WEB_DIR), html=True), name="web")
