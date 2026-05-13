import { api } from './api.js';
import { initNav } from './nav.js?v=3';

const UPLOAD_EXTRA = `
  <div class="upload-group">
    <select id="upload-type-select">
      <option value="book">Book</option>
      <option value="article">Article</option>
      <option value="paper">Paper</option>
      <option value="other">Other</option>
    </select>
    <button class="btn" id="upload-btn">+ Add</button>
    <input type="file" id="upload-input" accept=".pdf,.epub" multiple>
  </div>
`;

initNav('library', UPLOAD_EXTRA);

const grid             = document.getElementById('library-grid');
const toastEl          = document.getElementById('toast-area');
const searchInput      = document.getElementById('search-input');
const searchResults    = document.getElementById('search-results');
const uploadBtn        = document.getElementById('upload-btn');
const uploadInput      = document.getElementById('upload-input');
const uploadTypeSelect = document.getElementById('upload-type-select');
const bookCount        = document.getElementById('book-count');
const filterBar        = document.getElementById('filter-bar');

const SHELF_TYPES = [
  { value: 'all',     label: 'All' },
  { value: 'book',    label: 'Books' },
  { value: 'article', label: 'Articles' },
  { value: 'paper',   label: 'Papers' },
  { value: 'other',   label: 'Other' },
];

const TYPE_LABELS = { book: 'Book', article: 'Article', paper: 'Paper', other: 'Other' };

let allItems = [];
let activeFilter = 'all';

// Pixel art cover palettes: [cover, spine, gem, line]
const BOOK_PALETTES = [
  ['#203090', '#0c1a60', '#6080ff', '#a0b8ff'],
  ['#20602a', '#0c3014', '#40c060', '#90dca0'],
  ['#602080', '#300c40', '#c050ff', '#e0a0ff'],
  ['#206060', '#0c3030', '#40c0c0', '#90dcd8'],
  ['#803030', '#401818', '#e05050', '#ffb0b0'],
  ['#806020', '#403010', '#ffc040', '#ffe090'],
];

function pixelBookSVG(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [cover, spine, gemColor, lineColor] = BOOK_PALETTES[h % BOOK_PALETTES.length];
  const S = 8;

  const parts = [];
  const r = (x, y, w = 1, h = 1, fill, op = '') =>
    parts.push(`<rect x="${x*S}" y="${y*S}" width="${w*S}" height="${h*S}" fill="${fill}"${op ? ` opacity="${op}"` : ''}/>`);

  r(0, 0, 16, 24, '#0d0d16');
  r(0, 0, 2, 24, spine);
  r(2, 0, 12, 24, cover);
  r(14, 0, 1, 24, '#6a5c3a');
  r(15, 0, 1, 24, '#c8b99a');
  r(2, 0, 12, 1, '#ffffff', '0.12');

  const cx = 8, cy = 9;
  for (let dy = -3; dy <= 3; dy++) {
    const spread = 3 - Math.abs(dy);
    for (let dx = -spread; dx <= spread; dx++) {
      r(cx + dx, cy + dy, 1, 1, gemColor);
    }
  }
  r(7, 7, 1, 1, '#ffffff', '0.5');
  r(8, 6, 1, 1, '#ffffff', '0.3');

  r(4, 15, 8, 1, lineColor);
  r(4, 17, 6, 1, lineColor);
  r(4, 19, 4, 1, lineColor);

  const W = 16 * S, H = 24 * S;
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" shape-rendering="crispEdges">${parts.join('')}</svg>`
  );
}

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  toastEl.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function bookCard(book) {
  const card = document.createElement('div');
  card.className = 'book-card';
  card.dataset.id = book.id;
  card.dataset.shelfType = book.shelf_type || 'book';

  const coverSrc = book.cover_url || pixelBookSVG(book.id);
  const typeLabel = TYPE_LABELS[book.shelf_type] || book.shelf_type || 'Book';

  card.innerHTML = `
    <img class="book-cover" src="${coverSrc}" alt="" loading="lazy" onerror="this.src='${pixelBookSVG(book.id)}'">
    <span class="book-badge">${esc(typeLabel)}</span>
    <button class="delete-btn" title="Delete">✕</button>
    <div class="book-info">
      <div class="book-title">${esc(book.title)}</div>
      <div class="book-author">${esc(book.author || '—')}</div>
    </div>
  `;

  card.addEventListener('click', e => {
    if (e.target.classList.contains('delete-btn')) return;
    location.href = `/reader.html?id=${book.id}`;
  });

  card.querySelector('.delete-btn').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/books/${book.id}`);
      allItems = allItems.filter(b => b.id !== book.id);
      card.remove();
      updateCount();
      if (!grid.querySelectorAll('.book-card').length) renderEmpty();
    } catch (err) {
      toast('Delete failed: ' + err.message, true);
    }
  });

  return card;
}

function updateCount() {
  const visible = grid.querySelectorAll('.book-card').length;
  bookCount.textContent = `${visible} item${visible === 1 ? '' : 's'}`;
}

function renderFilterBar() {
  filterBar.innerHTML = '';
  SHELF_TYPES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'filter-tab' + (t.value === activeFilter ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      activeFilter = t.value;
      renderGrid();
    });
    filterBar.appendChild(btn);
  });
}

function renderGrid() {
  renderFilterBar();
  grid.innerHTML = '';

  const filtered = activeFilter === 'all'
    ? allItems
    : allItems.filter(b => (b.shelf_type || 'book') === activeFilter);

  if (!filtered.length) {
    renderEmpty();
  } else {
    filtered.forEach(b => grid.appendChild(bookCard(b)));
  }
  updateCount();
}

function renderEmpty() {
  grid.innerHTML = `
    <div class="empty-msg">
      <svg class="empty-shelf" viewBox="0 0 160 50" width="160" height="50" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
        <rect x="0"  y="34" width="160" height="8"  fill="#2e2e38"/>
        <rect x="0"  y="42" width="160" height="4"  fill="#1e1e24"/>
        <rect x="24" y="30" width="2"   height="2"  fill="#6b8cff" opacity="0.35"/>
        <rect x="68" y="28" width="2"   height="2"  fill="#c050ff" opacity="0.30"/>
        <rect x="112" y="31" width="2"  height="2"  fill="#40c0c0" opacity="0.30"/>
      </svg>
      <p>Nothing here yet.<br>Drop a PDF or EPUB here, or click <strong>+ Add</strong>.</p>
    </div>
  `;
}

async function loadLibrary() {
  try {
    allItems = await api.get('/api/books');
    renderGrid();
  } catch (err) {
    toast('Failed to load library', true);
  }
}

uploadBtn.addEventListener('click', () => uploadInput.click());
uploadInput.addEventListener('change', () => handleFiles(Array.from(uploadInput.files)));

grid.addEventListener('dragover', e => { e.preventDefault(); grid.classList.add('drag-over'); });
grid.addEventListener('dragleave', () => grid.classList.remove('drag-over'));
grid.addEventListener('drop', e => {
  e.preventDefault();
  grid.classList.remove('drag-over');
  handleFiles(Array.from(e.dataTransfer.files));
});

async function handleFiles(files) {
  const shelfType = uploadTypeSelect.value;
  for (const file of files) {
    if (!file.name.match(/\.(pdf|epub)$/i)) { toast(`Skipping ${file.name} — not PDF/EPUB`, true); continue; }
    try {
      toast(`Uploading ${file.name}…`);
      const item = await api.uploadBook(file, shelfType);
      allItems.unshift(item);
      grid.querySelector('.empty-msg')?.remove();
      grid.insertBefore(bookCard(item), grid.firstChild);
      updateCount();
      toast(`Added: ${item.title}`);
    } catch (err) {
      toast(`Failed to upload ${file.name}: ${err.message}`, true);
    }
  }
}

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) { searchResults.hidden = true; searchResults.innerHTML = ''; return; }
  searchTimer = setTimeout(() => runSearch(q), 350);
});

async function runSearch(q) {
  try {
    const results = await api.get(`/api/highlights/search?q=${encodeURIComponent(q)}`);
    searchResults.hidden = false;
    searchResults.innerHTML = '';
    if (!results.length) {
      searchResults.innerHTML = '<p style="padding:0.5em;color:var(--text-muted)">No results</p>';
      return;
    }
    results.forEach(r => {
      const el = document.createElement('div');
      el.className = 'search-result';
      el.innerHTML = `<strong>${esc(r.book_title)}</strong> · <span style="color:var(--text-muted)">${r.color}</span><br>${r.snippet}`;
      el.addEventListener('click', () => {
        location.href = `/reader.html?id=${r.book_id}&hl=${r.highlight_id}`;
      });
      searchResults.appendChild(el);
    });
  } catch (err) {
    /* silently ignore search errors */
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

loadLibrary();
