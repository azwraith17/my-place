/**
 * Reader bootstrap — detects format and dynamically imports the right module.
 * Wires up selection-popup ↔ highlights ↔ progress.
 */

import { api } from './api.js';
import { initPopup, dismiss as dismissPopup } from './selection-popup.js';
import { init as initHighlights, loadHighlights, createHighlight, getHighlights } from './highlights.js';

const params = new URLSearchParams(location.search);
const bookId = params.get('id');
const jumpTo = params.get('hl'); // highlight id to jump to after load

if (!bookId) { location.href = '/'; }

const titleEl = document.getElementById('reader-title');

let readerModule = null;

async function boot() {
  const meta = await api.get(`/api/books/${bookId}`);
  document.title = meta.title + ' — Reader';
  titleEl.textContent = meta.title;

  const fileUrl = `/api/books/${bookId}/file`;

  if (meta.format === 'pdf') {
    readerModule = await import('./reader-pdf.js');
  } else {
    readerModule = await import('./reader-epub.js');
  }

  // Init highlights module first so addOverlay/removeOverlay are available
  initHighlights(bookId, {
    addOverlay:    h   => readerModule.addHighlight(h),
    removeOverlay: id  => readerModule.removeHighlight(id),
    goTo:          loc => readerModule.goToLocation(loc),
  });

  // Wire selection popup
  initPopup({
    onColor: async (color, text, note, location) => {
      await createHighlight({ color, text, note, location });
      window.getSelection()?.removeAllRanges();
      dismissPopup();
    },
  });

  // Give the PDF module access to live highlights for zoom re-render
  readerModule.setHighlightSource?.(() => getHighlights());

  // Init reader (renders pages)
  await readerModule.init(bookId, fileUrl);

  // Load highlights and overlay them
  await loadHighlights();

  // Restore reading progress
  const progress = await api.get(`/api/books/${bookId}/progress`).catch(() => null);
  if (progress?.location && !jumpTo) {
    readerModule.goToLocation(
      typeof progress.location === 'string'
        ? { type: 'epub', cfi: progress.location }
        : { type: 'pdf', page: progress.location }
    );
  }

  // Jump to a specific highlight (from search)
  if (jumpTo) {
    const hl = getHighlights().find(h => h.id === jumpTo);
    if (hl) readerModule.goToLocation(hl.location);
  }

  // Save progress periodically
  _startProgressSaving(meta.format);

  // Fullscreen button
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    document.documentElement.requestFullscreen?.();
  });
}

function _startProgressSaving(format) {
  setInterval(async () => {
    let location;
    if (format === 'pdf') {
      // Read page from label
      const label = document.getElementById('page-label').textContent;
      const page  = parseInt(label, 10);
      if (!isNaN(page)) location = page;
    } else {
      // For EPUB we can't easily get CFI from outside the module; skip for now
      return;
    }
    if (location != null) {
      api.put(`/api/books/${bookId}/progress`, { location }).catch(() => {});
    }
  }, 10000);
}

boot().catch(err => {
  console.error(err);
  document.body.innerHTML = `<p style="color:red;padding:2rem">Failed to load book: ${err.message}</p>`;
});
