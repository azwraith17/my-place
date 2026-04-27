from pydantic import BaseModel
from typing import Literal, Any
from datetime import datetime


Color = Literal["yellow", "green", "blue", "pink"]


class Highlight(BaseModel):
    id: str
    color: Color
    text: str
    note: str = ""
    created_at: datetime
    updated_at: datetime
    group_id: str | None = None
    location: dict[str, Any]


class HighlightCreate(BaseModel):
    id: str  # client-generated ULID
    color: Color
    text: str
    note: str = ""
    group_id: str | None = None
    location: dict[str, Any]


class HighlightPatch(BaseModel):
    color: Color | None = None
    note: str | None = None


class HighlightStore(BaseModel):
    version: int = 1
    book_id: str
    format: Literal["pdf", "epub"]
    highlights: list[Highlight] = []
