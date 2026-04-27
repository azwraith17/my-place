import { translateText, hideTranslation } from './translate.js';

const popup     = document.getElementById('selection-popup');
const noteInput = document.getElementById('note-input');

let _onColor = null;   // callback(color, text, note)
let _debounceTimer = null;
let _pendingText = '';
let _pendingPayload = null;

export function initPopup({ onColor }) {
  _onColor = onColor;

  // Color swatches
  popup.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const color   = sw.dataset.color;
      const note    = noteInput.value.trim();
      const text    = _pendingText;
      const payload = _pendingPayload;
      dismiss();
      if (text && payload) {
        _onColor(color, text, note, payload);
      }
    });
  });

  document.getElementById('btn-translate').addEventListener('click', () => {
    if (_pendingText) translateText(_pendingText);
  });

  document.getElementById('btn-copy').addEventListener('click', () => {
    if (_pendingText) navigator.clipboard.writeText(_pendingText).catch(() => {});
    dismiss();
  });

  document.getElementById('btn-note').addEventListener('click', () => {
    noteInput.style.display = noteInput.style.display === 'none' ? 'block' : 'none';
    if (noteInput.style.display !== 'none') noteInput.focus();
  });

  document.getElementById('btn-dismiss').addEventListener('click', dismiss);
}

export function onSelection(rangeRect, text, payload) {
  clearTimeout(_debounceTimer);
  if (!text || !text.trim()) { dismiss(); return; }

  _debounceTimer = setTimeout(() => {
    _pendingText    = text.trim();
    _pendingPayload = payload;
    hideTranslation();
    noteInput.value = '';
    noteInput.style.display = 'none';
    positionPopup(rangeRect);
    popup.classList.add('visible');
  }, 150);
}

export function dismiss() {
  clearTimeout(_debounceTimer);
  popup.classList.remove('visible');
  hideTranslation();
  noteInput.value = '';
  noteInput.style.display = 'none';
  _pendingText    = '';
  _pendingPayload = null;
}

function positionPopup(rect) {
  popup.style.display = 'flex'; // temporary to get size
  const ph = popup.offsetHeight;
  const pw = popup.offsetWidth;
  popup.style.display = '';

  let top  = rect.top  + window.scrollY - ph - 8;
  let left = rect.left + window.scrollX + rect.width / 2 - pw / 2;

  if (top < 8) top = rect.bottom + window.scrollY + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));

  popup.style.top  = top  + 'px';
  popup.style.left = left + 'px';
}
