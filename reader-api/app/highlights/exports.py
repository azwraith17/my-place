from datetime import datetime, timezone
from pathlib import Path

from .models import Highlight, HighlightStore, Color
from ..storage import atomic_write_text


_COLORS: list[Color] = ["yellow", "green", "blue", "pink"]


def _location_label(h: Highlight) -> str:
    loc = h.location
    if loc.get("type") == "pdf":
        return f"p. {loc.get('page', '?')}"
    return loc.get("chapter", "?")


def _txt_block(h: Highlight) -> str:
    date = h.created_at.strftime("%Y-%m-%d")
    label = _location_label(h)
    meta = f"— {label} · {date}"
    if h.note:
        meta += f" · note: {h.note}"
    return f"{h.text}\n{meta}"


def _slug(title: str) -> str:
    import re
    s = title.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    return re.sub(r"[\s_-]+", "_", s)[:50]


def regenerate_exports(store: HighlightStore, book_dir: Path, title: str) -> None:
    slug = _slug(title)
    exports = book_dir / "exports"

    for color in _COLORS:
        items = [h for h in store.highlights if h.color == color]
        text = "\n\n".join(_txt_block(h) for h in items)
        atomic_write_text(exports / f"{slug}_{color}.txt", text)

    _write_markdown(store, book_dir, title, slug)


def _write_markdown(store: HighlightStore, book_dir: Path, title: str, slug: str) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [f"# {title}", f"", f"*Export date: {now}*", ""]

    for color in _COLORS:
        items = [h for h in store.highlights if h.color == color]
        if not items:
            continue
        lines.append(f"## {color.capitalize()}")
        lines.append("")
        for h in items:
            label = _location_label(h)
            date = h.created_at.strftime("%Y-%m-%d")
            lines.append(f"> {h.text}")
            lines.append(f"")
            lines.append(f"*{label} · {date}*")
            if h.note:
                lines.append(f"")
                lines.append(f"**Note:** {h.note}")
            lines.append("")
            lines.append("---")
            lines.append("")

    atomic_write_text(book_dir / "exports" / "all_highlights.md", "\n".join(lines))
