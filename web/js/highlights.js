import { api } from './api.js';
import { ulid } from './ulid.js';

// State
let _bookId = null;
let _highlights = [];
let _addOverlay = null;   // function(h) provided by reader module
let _removeOverlay = null; // function(id) provided by reader module
let _goTo = null;          // function(location) provided by reader module

const panel    = document.getElementById('highlights-panel');
const list     = document.getElementById('highlights-list');
const btnPanel = document.getElementById('btn-panel');
const btnClose = document.getElementById('btn-close-panel');

btnPanel.addEventListener('click', () => panel.classList.toggle('open'));
btnClose.addEventListener('click', () => panel.classList.remove('open'));

export function init(bookId, { addOverlay, removeOverlay, goTo }) {
  _bookId = bookId;
  _addOverlay = addOverlay;
  _removeOverlay = removeOverlay;
  _goTo = goTo;
}

export async function loadHighlights() {
  _highlights = await api.get(`/api/books/${_bookId}/highlights`);
  _highlights.forEach(h => _addOverlay(h));
  renderPanel();
}

export async function createHighlight(payload) {
  const h = {
    id: ulid(),
    color: payload.color,
    text: payload.text,
    note: payload.note || '',
    group_id: payload.group_id || null,
    location: payload.location,
  };

  // optimistic
  const optimistic = { ...h, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  _highlights.push(optimistic);
  _addOverlay(optimistic);
  renderPanel();

  try {
    const saved = await api.post(`/api/books/${_bookId}/highlights`, h);
    const idx = _highlights.findIndex(x => x.id === h.id);
    if (idx !== -1) _highlights[idx] = saved;
    renderPanel();
    return saved;
  } catch (err) {
    // rollback
    _removeOverlay(h.id);
    _highlights = _highlights.filter(x => x.id !== h.id);
    renderPanel();
    toast('Failed to save highlight — retry?', true);
    throw err;
  }
}

export async function patchHighlight(id, patch) {
  const updated = await api.patch(`/api/books/${_bookId}/highlights/${id}`, patch);
  const idx = _highlights.findIndex(h => h.id === id);
  if (idx !== -1) _highlights[idx] = updated;
  renderPanel();
  return updated;
}

export async function deleteHighlight(id) {
  await api.delete(`/api/books/${_bookId}/highlights/${id}`);
  _removeOverlay(id);
  _highlights = _highlights.filter(h => h.id !== id);
  renderPanel();
}

export function getHighlights() { return _highlights; }

function renderPanel() {
  list.innerHTML = '';
  if (!_highlights.length) {
    list.innerHTML = '<p style="color:var(--text-muted);padding:1rem;text-align:center">No highlights yet</p>';
    return;
  }

  for (const h of _highlights) {
    const card = document.createElement('div');
    card.className = 'hl-card' + (h.needs_reanchor ? ' orphaned' : '');
    card.dataset.color = h.color;
    card.dataset.id = h.id;

    const loc = h.location?.type === 'pdf'
      ? `p. ${h.location.page}`
      : (h.location?.chapter || '');

    card.innerHTML = `
      <div class="hl-card-text">${esc(h.text)}</div>
      <div class="hl-card-meta">${esc(loc)} &middot; ${h.color}
        <button style="margin-left:auto;float:right;color:var(--danger)" data-del="${h.id}">✕</button>
      </div>
      ${h.note ? `<div class="hl-card-note">${esc(h.note)}</div>` : ''}
      <textarea class="note-edit" data-id="${h.id}" placeholder="Add a note…"
        style="display:none;width:100%;margin-top:0.4em;resize:vertical"
      >${esc(h.note)}</textarea>
    `;

    card.addEventListener('click', e => {
      if (e.target.dataset.del) {
        e.stopPropagation();
        deleteHighlight(e.target.dataset.del).catch(() => {});
        return;
      }
      if (_goTo) _goTo(h.location);
      // Toggle note editor
      const ta = card.querySelector('textarea');
      ta.style.display = ta.style.display === 'none' ? 'block' : 'none';
      if (ta.style.display !== 'none') ta.focus();
    });

    const ta = card.querySelector('textarea');
    ta.addEventListener('blur', () => {
      const note = ta.value;
      if (note !== h.note) {
        patchHighlight(h.id, { note }).catch(() => {});
      }
    });

    list.appendChild(card);
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toast(msg, isError = false) {
  const area = document.getElementById('toast-area');
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  area.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
