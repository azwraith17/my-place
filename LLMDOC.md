# My Place — LLM Project Documentation

> Complete context for an LLM starting a new session on this codebase.
> Last updated: 2026-05-13

---

## 1. What This Project Is

**My Place** is a self-hosted personal dashboard running on a Raspberry Pi 5.
It is a single-user application (one password for everything) with two top-level features:

- **My Library** — a personal e-book / document shelf. Upload PDFs and EPUBs, read them in-browser, highlight text, add notes, search highlights, track reading progress.
- **Budget** — personal transaction tracker (income/expenses by month).

There is no external auth provider, no database beyond SQLite (FTS only) and flat JSON files, and no build step — plain ES modules in the browser.

---

## 2. Tech Stack

### Backend
| Piece | Detail |
|---|---|
| Language | Python 3.13 |
| Framework | FastAPI (async, uvicorn, single worker) |
| Auth | itsdangerous signed cookie (`URLSafeTimedSerializer`). One shared password. |
| File format detection | python-magic |
| PDF parsing | pypdf (metadata), pdftoppm CLI (cover), Pillow (cover resize/placeholder) |
| EPUB parsing | ebooklib |
| Search | SQLite FTS5 (`highlights_fts`) — full-text search across highlight text and notes |
| Translation | argostranslate (offline, on-device) |
| Settings | pydantic-settings, reads from `.env` |

### Frontend
| Piece | Detail |
|---|---|
| Language | Vanilla JS ES modules (no bundler, no framework) |
| PDF rendering | PDF.js (vendor bundle at `/vendor/pdfjs/`) |
| EPUB rendering | foliate-js (vendor at `/vendor/foliate-js/`) |
| Highlights rendering | CSS Custom Highlight API (PDF); foliate-js annotations (EPUB) |
| Arabic font | Vazirmatn (woff2, for Persian/Arabic translation results) |
| Build | None — files served as-is |

### Infrastructure
| Piece | Detail |
|---|---|
| Host | Raspberry Pi 5, Linux (Debian-based) |
| Process | systemd service (`my-place.service`), uvicorn on port 8000 |
| Reverse proxy | nginx (system nginx, not containerised in prod) |
| Auth gate | nginx `auth_request` to `/api/auth/verify` — all pages except `/`, `/login.html`, `/css/`, `/vendor/` require a valid cookie |
| Max upload | 200 MB (nginx `client_max_body_size`) |
| Docker Compose | Present but **not used in production** — dev reference only |

---

## 3. Repository Layout

```
my-place/                          # git root
└── my-place/                      # project root
    ├── .env                       # secrets (READER_PASSWORD, COOKIE_SECRET, LIBRARY_PATH, DATA_PATH)
    ├── .env.example
    ├── deploy/
    │   └── my-place.service       # systemd unit
    ├── nginx/
    │   └── reader.conf            # nginx server block
    ├── reader-api/                # Python backend
    │   ├── Dockerfile
    │   ├── pyproject.toml
    │   └── app/
    │       ├── main.py            # FastAPI app, lifespan, router mounting, static serving
    │       ├── auth.py            # login/logout/verify + Auth dependency
    │       ├── config.py          # Settings (pydantic-settings)
    │       ├── storage.py         # book_dir, ensure_book_dir, atomic_write_json/text, book_lock
    │       ├── library/           # book CRUD
    │       │   ├── models.py      # BookMeta, BookUpdate
    │       │   ├── router.py      # /api/books CRUD + file/cover serving
    │       │   └── service.py     # list/get/save/delete, extract_*_meta, generate_*_cover
    │       ├── highlights/        # per-book highlights
    │       │   ├── models.py      # Highlight, HighlightCreate, HighlightPatch, HighlightStore
    │       │   ├── router.py      # /api/books/{id}/highlights CRUD + export endpoints
    │       │   ├── service.py     # get/create/patch/delete + search index sync
    │       │   └── exports.py     # regenerate per-color .txt and all_highlights.md after every write
    │       ├── search/            # full-text search across highlights
    │       │   ├── index.py       # SQLite FTS5, upsert/delete/search, startup_verify
    │       │   └── router.py      # GET /api/highlights/search?q=
    │       ├── progress/          # reading progress (last page / CFI)
    │       │   └── router.py      # GET/PUT /api/books/{id}/progress
    │       ├── translate/         # on-device translation via argostranslate
    │       │   └── router.py      # POST /api/translate
    │       └── budget/            # budget tracker
    │           ├── models.py
    │           ├── router.py      # GET/POST/DELETE /api/budget/transactions
    │           └── service.py
    ├── web/                       # frontend (static files, served by FastAPI StaticFiles)
    │   ├── index.html             # public home page
    │   ├── login.html             # login form
    │   ├── library.html           # My Library page
    │   ├── reader.html            # book reader (PDF + EPUB)
    │   ├── budget.html
    │   ├── css/
    │   │   ├── base.css           # global design tokens, header, buttons, inputs, toasts
    │   │   └── reader.css         # reader layout, panels, highlight cards, outline panel
    │   ├── js/
    │   │   ├── api.js             # fetch wrappers (get/post/patch/put/delete + uploadBook)
    │   │   ├── nav.js             # injects <header> + tab navigation into every page
    │   │   ├── library.js         # library grid, filter tabs, upload, search
    │   │   ├── reader.js          # boot: detects format, imports reader module, wires everything
    │   │   ├── reader-pdf.js      # PDF.js integration + CSS Highlight API
    │   │   ├── reader-epub.js     # foliate-js integration
    │   │   ├── highlights.js      # highlight state, panel, CRUD, optimistic UI
    │   │   ├── selection-popup.js # floating popup on text selection (color swatches, note, translate)
    │   │   ├── translate.js       # calls /api/translate, renders result in popup
    │   │   ├── budget.js
    │   │   └── ulid.js            # client-side ULID generator (highlight IDs)
    │   └── vendor/
    │       ├── pdfjs/             # PDF.js (pdf.mjs + pdf.worker.mjs)
    │       ├── foliate-js/        # EPUB/PDF/CB reader library
    │       └── vazirmatn/         # Arabic/Persian font
    └── data/
        ├── budget.json
        └── search.db              # SQLite FTS5 database
```

---

## 4. Data Storage — Per-Book Directory

Every uploaded book gets a UUID hex directory under `LIBRARY_PATH` (default `/library`):

```
/library/{book_id}/
    metadata.json     — BookMeta (id, title, author, format, cover_url, shelf_type)
    book.pdf          — or book.epub (the uploaded file)
    cover.jpg         — JPEG cover (extracted from PDF p1 / EPUB embedded / Pillow placeholder)
    highlights.json   — HighlightStore (version, book_id, format, highlights[])
    progress.json     — { location, updated_at }
    exports/
        {slug}_yellow.txt
        {slug}_green.txt
        {slug}_blue.txt
        {slug}_pink.txt
        all_highlights.md
```

**Important invariants:**
- `cover.jpg` always exists after upload — if no real cover is found, a deterministic Pillow-generated solid-color JPEG is created. Cover served with `Cache-Control: public, max-age=31536000, immutable`.
- `highlights.json` is created (empty) at upload time.
- Writes use `atomic_write_json` (tmp → fsync → rename → fsync dir) — safe on ext4/SD card.
- Per-book `asyncio.Lock` via `book_lock(book_id)` — prevents concurrent writes to the same book.
- Export files are regenerated synchronously on every highlight create/patch/delete.

---

## 5. Data Models

### BookMeta (`library/models.py`)
```python
class BookMeta(BaseModel):
    id: str                          # UUID hex
    title: str
    author: str = ""
    format: Literal["pdf", "epub"]
    cover_url: str | None = None     # always set now: /api/books/{id}/cover
    shelf_type: str = "book"         # "book" | "article" | "paper" | "other"
```

### Highlight (`highlights/models.py`)
```python
class Highlight(BaseModel):
    id: str                          # client-generated ULID
    color: Literal["yellow", "green", "blue", "pink"]
    text: str
    note: str = ""
    created_at: datetime
    updated_at: datetime
    group_id: str | None = None
    location: dict                   # { type, ... } — see Location section below
```

### Highlight Location schemas
- **PDF**: `{ "type": "pdf", "page": int, "startOffset": int, "endOffset": int }` — character offsets within the page's text layer DOM
- **EPUB**: `{ "type": "epub", "cfi": str, "chapter": str }` — CFI (Canonical Fragment Identifier)

---

## 6. API Endpoints

### Auth (`/api/auth/`)
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | `{ password }` → sets `reader_session` cookie |
| POST | `/api/auth/logout` | Clears cookie |
| GET | `/api/auth/verify` | Used by nginx auth_request (returns 200 or 401) |

### Library (`/api/books/`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/books` | List all BookMeta, sorted by title |
| POST | `/api/books` | Upload file (`multipart/form-data`: `file`, `shelf_type`) |
| GET | `/api/books/{id}` | Single BookMeta |
| PATCH | `/api/books/{id}` | Update `{ shelf_type }` |
| DELETE | `/api/books/{id}` | Delete book + all data + remove from FTS |
| GET | `/api/books/{id}/file` | Serve PDF or EPUB file |
| GET | `/api/books/{id}/cover` | Serve cover.jpg (immutable cache header) |

### Highlights (`/api/books/{id}/highlights/`)
| Method | Path | Description |
|---|---|---|
| GET | `/api/books/{id}/highlights` | List all highlights for book |
| POST | `/api/books/{id}/highlights` | Create highlight (idempotent on ULID) |
| PATCH | `/api/books/{id}/highlights/{hid}` | Update `color` and/or `note` |
| DELETE | `/api/books/{id}/highlights/{hid}` | Delete highlight |
| GET | `/api/books/{id}/highlights/export/{color}` | Download color-filtered .txt export |
| GET | `/api/books/{id}/highlights/export/markdown` | Download all_highlights.md |

### Search
| Method | Path | Description |
|---|---|---|
| GET | `/api/highlights/search?q=` | FTS5 search across all highlights (optional: `color=`, `book=`) |

### Progress
| Method | Path | Description |
|---|---|---|
| GET | `/api/books/{id}/progress` | Get `{ location, updated_at }` |
| PUT | `/api/books/{id}/progress` | Save `{ location }` (int=PDF page, str=EPUB CFI) |

### Translate
| Method | Path | Description |
|---|---|---|
| POST | `/api/translate` | `{ text, target_lang }` → `{ result }` via argostranslate |

### Budget
| Method | Path | Description |
|---|---|---|
| GET | `/api/budget/transactions?month=YYYY-MM` | List transactions |
| POST | `/api/budget/transactions` | Create transaction |
| DELETE | `/api/budget/transactions/{id}` | Delete transaction |

---

## 7. Frontend Architecture

### Pages
- **`/index.html`** — public home, redirects authenticated users to library
- **`/login.html`** — password form, POSTs to `/api/auth/login`
- **`/library.html`** — My Library (book grid, filter tabs, search)
- **`/reader.html`** — book reader (shared for PDF and EPUB)
- **`/budget.html`** — budget tracker

### nav.js — shared header
Every authenticated page calls `initNav(activeTabId, extraHTML)`. It injects:
```html
<header>
  <a class="header-logo">MY PLACE</a>
  <nav class="header-nav">  <!-- tab links -->
  <div class="header-actions">  <!-- extraHTML + logout button -->
</header>
```
Current tabs: `{ id: 'library', label: 'My Library', href: '/library.html' }` and Budget.

### api.js — fetch layer
Thin wrappers over `fetch`. All requests are same-origin with `credentials: 'include'` (sends the session cookie). On 401, redirects to `/login.html`. Key method: `api.uploadBook(file, shelfType)` — sends multipart FormData.

### library.js — library grid

**State:** `allItems[]` (all BookMeta), `activeFilter` (shelf_type or 'all').

**Filter tabs:** rendered by `renderFilterBar()`. Options: All / Books / Articles / Papers / Other. Client-side filtering of `allItems`.

**Upload flow:** Header has a `<select id="upload-type-select">` (Book/Article/Paper/Other) + `+ Add` button. The selected `shelf_type` is sent with the file upload.

**Cards:** Each card (`bookCard(b)`) shows cover image with `loading="lazy"` and `onerror` fallback to `pixelBookSVG(book.id)` (pixel art data URL). The badge shows the shelf type label, not the file format.

**Performance:** `content-visibility: auto` + `contain-intrinsic-size: 0 280px` on `.book-card` — browser skips off-screen card rendering for large grids.

**pixelBookSVG(id):** Generates a pixel-art book cover SVG as a data URL. Deterministic hash of book ID → one of 6 color palettes. Used only as `onerror` fallback since all books now have a server-saved `cover.jpg`.

### reader.js — reader bootstrap

1. Fetches BookMeta to get title and format
2. Dynamically imports `reader-pdf.js` or `reader-epub.js`
3. Inits highlight module → init popup → sets highlight source → `readerModule.init()`
4. Loads highlights → restores progress → jumps to specific highlight if `?hl=` param
5. Starts progress auto-save (every 10s, PDF only)
6. Wires fullscreen button, outline panel toggle, highlights panel (via highlights.js)
7. Calls `readerModule.getOutline?.()` → renders TOC tree in `#outline-tree`

### reader-pdf.js — PDF rendering

- Renders **all pages** upfront as `<canvas>` elements with text layers in `#pdf-container`
- IntersectionObserver tracks current page → updates `#page-label`
- **Highlights:** CSS Custom Highlight API (`CSS.highlights.set(name, range)`) — zero coordinate math, works perfectly at any zoom level. Ranges stored as character offsets within the page's text layer.
- **Zoom:** re-renders all pages + re-applies all highlights
- **Exports:** `getOutline()` — calls `pdfDoc.getOutline()`, resolves named destinations via `pdfDoc.getDestination()` + `pdfDoc.getPageIndex()`, returns `{ title, children, navigate() }` tree

### reader-epub.js — EPUB rendering

- Uses foliate-js `BookView` custom element inside `#epub-container`
- Highlights via `_view.addAnnotation({ value: cfi, color, id })`
- Navigation via `_view.goTo(cfi)` or `_view.goTo(href)` for outline items
- Font size zoom via `_view.renderer.setStyles()`
- **Exports:** `getOutline()` — reads `_view.book.toc`, maps items to same `{ title, children, navigate() }` shape

### Outline panel

Toggled by `#btn-outline` (≡ symbol, keyboard shortcut planned). Slides in from **left**. Hierarchical tree with ▶/▼ toggles for sections with children. Implemented in `reader.js::_renderOutlineTree()`. Falls back to "No outline available" message.

### highlights.js — highlight state machine

Maintains `_highlights[]` in memory. Optimistic create (immediate overlay + panel update), rollback on API failure. IDs are client-generated ULIDs (monotonic, sortable). Every mutating operation syncs to FTS via the backend.

### selection-popup.js

Shown on text selection. Contains:
- 4 color swatches (yellow/green/blue/pink)
- Translate button (calls `/api/translate`, shows result with RTL text for Arabic/Persian)
- Copy, Note, Dismiss buttons

---

## 8. Design System (base.css)

Dark theme only. CSS custom properties on `:root`:
- Background: `--bg: #141418`, `--surface: #1e1e24`, `--surface2: #28282f`, `--surface3: #2e2e38`
- Text: `--text: #e4e4f0`, `--text-muted: #7a7a90`
- Accent: `--accent: #6b8cff` (indigo-blue), `--accent-dim: rgba(107,140,255,0.12)`
- Danger: `--danger: #ff5f5f`, Success: `--success: #4caf7d`
- Radius: `--radius: 8px`

Reusable classes: `.btn`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.tool-tab`, `.toast`, `.toast.error`

---

## 9. Auth Flow

1. Nginx receives request for any protected page
2. nginx `auth_request /_auth` → proxies to `/api/auth/verify`
3. FastAPI checks `reader_session` cookie via `itsdangerous`
4. Returns 200 (allow) or 401 (nginx redirects to `/login.html?next=...`)
5. On successful login, `itsdangerous` signed token set as HttpOnly cookie
6. API endpoints also re-check via `Auth = Depends(require_auth)` FastAPI dependency

---

## 10. Search (FTS5)

- SQLite database at `DATA_PATH/search.db`
- Virtual table `highlights_fts` with columns: `highlight_id`, `book_id`, `book_title`, `text`, `note`, `color`
- Tokenizer: `unicode61 remove_diacritics 2`
- On startup: `startup_verify()` rescans all book directories and reindexes any `highlights.json` newer than `fts_meta.last_indexed`
- Live sync: every highlight create/patch/delete calls `upsert_highlight` / `delete_highlight`
- Search returns: `highlight_id`, `book_id`, `book_title`, `text`, `note`, `color`, `snippet` (HTML with `<mark>` tags)
- Library search box (`#search-input`) searches with 350ms debounce, shows results above the grid

---

## 11. Cover Generation Pipeline

On book upload, covers are attempted in this order:
1. **PDF**: `pdftoppm` CLI → renders page 1 → Pillow resizes to 400×600 JPEG
2. **EPUB**: ebooklib iterates `ITEM_COVER` then images with "cover" in filename
3. **Fallback**: Pillow generates a deterministic solid-color JPEG (palette from book_id hash, 6 options, includes spine stripe)

All covers saved as `cover.jpg` in the book directory. Every book always has a cover after upload. Served with immutable cache headers.

---

## 12. Deployment (Production)

```bash
# Restart service after code changes
sudo systemctl restart my-place

# Check logs
journalctl -u my-place -f

# Service file location
/etc/systemd/system/my-place.service
# (symlinked or copied from deploy/my-place.service)

# Python venv
/home/azwraith176/projects/my-place/my-place/venv/

# Working directory for uvicorn
/home/azwraith176/projects/my-place/my-place/reader-api/

# Library data
/library/{book_id}/   (or whatever LIBRARY_PATH is set to in .env)
/data/search.db
```

The `.env` file at `/home/azwraith176/projects/my-place/my-place/.env` contains:
- `READER_PASSWORD` — the single login password
- `COOKIE_SECRET` — signing key for itsdangerous
- `LIBRARY_PATH` — where books are stored (default `/library`)
- `DATA_PATH` — where search.db lives (default `/data`)

---

## 13. Conventions & Patterns

### Python
- Module pattern: each feature is a package with `models.py`, `router.py`, `service.py`
- No ORM, no migration system — flat JSON files + SQLite FTS only
- `atomic_write_json` everywhere — never write JSON files directly
- `asyncio.Lock` per book for concurrent write safety
- FastAPI dependency injection: `_: None = Auth` on every protected endpoint

### JavaScript
- No bundler, no TypeScript, no npm — plain ES modules with `import`/`export`
- Version cache-busting via `?v=N` on `<script>` tags and imports
- `esc(s)` function in every module that renders user content (XSS prevention)
- Toast notifications via `toast(msg, isError)` — auto-dismiss in 4s
- Optimistic UI for highlights (create immediately, rollback on failure)
- Client-generated IDs (ULID) for highlights — server is idempotent on the same ID

### Shelf types
`shelf_type` on `BookMeta` defaults to `"book"`. Valid values: `book`, `article`, `paper`, `other`. Stored in `metadata.json`. Can be changed via `PATCH /api/books/{id}` with `{ "shelf_type": "..." }`. The upload form has a `<select id="upload-type-select">` to set it on upload.

---

## 14. Known Limitations / Future Work

- Single user / single password — no multi-user support
- EPUB reading progress not saved (CFI hard to access outside foliate-js module)
- No pagination in library — all books loaded at once (mitigated by `content-visibility: auto`)
- argostranslate models must be downloaded manually before translate works
- No HTTPS termination shown in nginx config — assumed to be handled upstream (e.g. Cloudflare tunnel or another nginx)
- Existing books uploaded before `shelf_type` was added default to `"book"` (Pydantic default handles this transparently)
- Existing books uploaded before placeholder cover generation will still show pixelBookSVG fallback until re-uploaded (onerror handler covers them)
