import { api } from './api.js';
import { initNav } from './nav.js';

initNav('books', '<button class="btn" id="upload-btn">+ Upload</button><input type="file" id="upload-input" accept=".pdf,.epub" multiple>');

const grid          = document.getElementById('library-grid');
const toastEl       = document.getElementById('toast-area');
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const uploadBtn     = document.getElementById('upload-btn');
const uploadInput   = document.getElementById('upload-input');

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

  const cover = book.cover_url
    ? `<img class="book-cover" src="${book.cover_url}" alt="" loading="lazy">`
    : `<div class="book-cover-placeholder">${book.format === 'pdf' ? '📄' : '📖'}</div>`;

  card.innerHTML = `
    ${cover}
    <span class="book-badge">${book.format}</span>
    <button class="delete-btn" title="Delete">✕</button>
    <div class="book-info">
      <div class="book-title">${esc(book.title)}</div>
      <div class="book-author">${esc(book.author)}</div>
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
      card.remove();
      if (!grid.querySelector('.book-card')) renderEmpty();
    } catch (err) {
      toast('Delete failed: ' + err.message, true);
    }
  });

  return card;
}

function renderEmpty() {
  const el = document.createElement('p');
  el.className = 'empty-msg';
  el.textContent = 'No books yet. Upload a PDF or EPUB to get started.';
  grid.appendChild(el);
}

async function loadLibrary() {
  try {
    const books = await api.get('/api/books');
    grid.innerHTML = '';
    if (books.length === 0) { renderEmpty(); return; }
    books.forEach(b => grid.appendChild(bookCard(b)));
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
  for (const file of files) {
    if (!file.name.match(/\.(pdf|epub)$/i)) { toast(`Skipping ${file.name} — not PDF/EPUB`, true); continue; }
    try {
      toast(`Uploading ${file.name}…`);
      const book = await api.uploadBook(file);
      grid.querySelector('.empty-msg')?.remove();
      grid.insertBefore(bookCard(book), grid.firstChild);
      toast(`Uploaded: ${book.title}`);
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

loadLibrary();
