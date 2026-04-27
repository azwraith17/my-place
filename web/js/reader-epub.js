/**
 * EPUB reader module using foliate-js.
 * Exposes same interface as reader-pdf.js.
 */

import { onSelection as popupSelection, dismiss as dismissPopup } from './selection-popup.js';

const container = document.getElementById('epub-container');
const zoomLabel = document.getElementById('zoom-label');
const pageLabel = document.getElementById('page-label');
const btnPrev   = document.getElementById('btn-prev');
const btnNext   = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut= document.getElementById('btn-zoom-out');

let _view    = null;
let _selCb   = null;
let _fontSize = 100; // percent

export async function init(bookId, fileUrl) {
  container.hidden = false;

  // foliate-js expects a custom element; we use its book-viewer
  const { BookView } = await import('/vendor/foliate-js/view.js');
  _view = new BookView();
  container.appendChild(_view);

  const res  = await fetch(fileUrl, { credentials: 'include' });
  const blob = await res.blob();
  const file = new File([blob], 'book.epub', { type: 'application/epub+zip' });

  await _view.open(file);

  _view.addEventListener('relocate', e => {
    const loc = e.detail;
    pageLabel.textContent = loc?.fraction
      ? `${Math.round(loc.fraction * 100)}%`
      : '';
  });

  _attachNav();
  _attachSelectionListener();
}

export function onSelection(cb) { _selCb = cb; }

export function addHighlight(h) {
  if (!_view || !h.location?.cfi) return;
  try {
    _view.addAnnotation({ value: h.location.cfi, color: h.color, id: h.id });
  } catch (e) {
    console.warn('addAnnotation failed', e);
  }
}

export function removeHighlight(id) {
  if (!_view) return;
  try {
    _view.deleteAnnotation(id);
  } catch { /* ignore */ }
}

export function goToLocation(location) {
  if (!_view || !location?.cfi) return;
  _view.goTo(location.cfi).catch(() => {});
}

function _attachSelectionListener() {
  // foliate-js fires 'selection' events on the view element
  _view.addEventListener('selection', e => {
    const { text, range, cfi } = e.detail ?? {};
    if (!text || !text.trim()) { dismissPopup(); return; }

    const rect = range?.getBoundingClientRect() ?? { top: 0, left: 0, width: 0, bottom: 0 };
    const chapter = _view.renderer?.currentSection?.label ?? '';
    const payload = { type: 'epub', cfi, chapter };

    popupSelection(rect, text, payload);
    if (_selCb) _selCb({ rangeRect: rect, text, payload });
  });
}

function _attachNav() {
  btnPrev.addEventListener('click', () => _view?.prev().catch(() => {}));
  btnNext.addEventListener('click', () => _view?.next().catch(() => {}));

  btnZoomIn.addEventListener('click',  () => _setFontSize(_fontSize + 10));
  btnZoomOut.addEventListener('click', () => _setFontSize(_fontSize - 10));

  document.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft')  btnPrev.click();
    if (e.key === 'ArrowRight') btnNext.click();
    if (e.key === '+') btnZoomIn.click();
    if (e.key === '-') btnZoomOut.click();
    if (e.key === 'f') document.documentElement.requestFullscreen?.();
  });
}

function _setFontSize(size) {
  _fontSize = Math.max(60, Math.min(200, size));
  zoomLabel.textContent = _fontSize + '%';
  _view?.renderer?.setStyles?.(`body { font-size: ${_fontSize}% !important; }`);
}
