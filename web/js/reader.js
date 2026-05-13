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

if (!bookId) { location.href = '/library.html'; }

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

  // Outline panel
  const outlinePanel = document.getElementById('outline-panel');
  document.getElementById('btn-outline').addEventListener('click', () => {
    outlinePanel.classList.toggle('open');
  });
  document.getElementById('btn-close-outline').addEventListener('click', () => {
    outlinePanel.classList.remove('open');
  });

  const outline = await readerModule.getOutline?.() ?? [];
  _renderOutlineTree(document.getElementById('outline-tree'), outline);
}

function _renderOutlineTree(container, items, depth = 0) {
  if (!items.length) {
    if (depth === 0) {
      container.innerHTML = '<div class="outline-empty">No outline available</div>';
    }
    return;
  }
  const group = document.createElement('div');
  group.className = 'outline-group';
  items.forEach(item => {
    const entry = document.createElement('div');
    entry.className = 'outline-entry';
    entry.style.paddingLeft = (depth * 14 + 12) + 'px';

    if (item.children.length) {
      const toggle = document.createElement('button');
      toggle.className = 'outline-toggle';
      toggle.textContent = '▶';
      entry.appendChild(toggle);

      const title = document.createElement('span');
      title.className = 'outline-title';
      title.textContent = item.title;
      entry.appendChild(title);

      const childWrap = document.createElement('div');
      childWrap.hidden = true;
      _renderOutlineTree(childWrap, item.children, depth + 1);

      toggle.addEventListener('click', () => {
        childWrap.hidden = !childWrap.hidden;
        toggle.textContent = childWrap.hidden ? '▶' : '▼';
      });
      title.addEventListener('click', () => item.navigate());

      group.appendChild(entry);
      group.appendChild(childWrap);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'outline-no-toggle';
      entry.appendChild(placeholder);

      const title = document.createElement('span');
      title.className = 'outline-title';
      title.textContent = item.title;
      title.addEventListener('click', () => item.navigate());
      entry.appendChild(title);

      group.appendChild(entry);
    }
  });
  container.appendChild(group);
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
