/**
 * PDF reader module using PDF.js.
 * Exposes: init(bookId, fileUrl), onSelection(cb), addHighlight(h), removeHighlight(id),
 *          goToLocation(loc), setHighlightSource(fn)
 *
 * Highlights are rendered via the CSS Custom Highlight API against the PDF.js text layer,
 * so they align perfectly with the text at any zoom level — no coordinate math needed.
 */

import { onSelection as popupSelection, dismiss as dismissPopup } from './selection-popup.js';

const PDFJS_URL = '/vendor/pdfjs/pdf.mjs';

let _pdfDoc     = null;
let _scale      = 1.5;
let _bookId     = null;
let _pdfjsLib   = null;
let _pages      = [];   // { pageNum, wrapper, canvas, viewport }
let _selCb      = null;
let _getHighlights = () => [];

const container = document.getElementById('pdf-container');
const zoomLabel = document.getElementById('zoom-label');
const pageLabel = document.getElementById('page-label');
const btnPrev   = document.getElementById('btn-prev');
const btnNext   = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut= document.getElementById('btn-zoom-out');

export function setHighlightSource(fn) { _getHighlights = fn; }

export async function init(bookId, fileUrl) {
  _bookId = bookId;
  container.hidden = false;

  _pdfjsLib = await import(PDFJS_URL);
  _pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

  _pdfDoc = await _pdfjsLib.getDocument(fileUrl).promise;
  pageLabel.textContent = `1 / ${_pdfDoc.numPages}`;

  await _renderAllPages();
  _attachSelectionListener();
  _attachNav();
}

async function _renderAllPages() {
  container.innerHTML = '';
  _pages = [];
  for (let i = 1; i <= _pdfDoc.numPages; i++) {
    await _renderPage(i);
  }
}

async function _renderPage(pageNum) {
  const page     = await _pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: _scale });

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-page-wrapper';
  wrapper.dataset.page = pageNum;
  wrapper.style.width  = viewport.width  + 'px';
  wrapper.style.height = viewport.height + 'px';

  const canvas  = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  wrapper.appendChild(canvas);

  const textLayerDiv = document.createElement('div');
  textLayerDiv.className = 'textLayer';
  wrapper.appendChild(textLayerDiv);

  container.appendChild(wrapper);
  _pages.push({ pageNum, wrapper, canvas, viewport, page });

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const textLayer = new _pdfjsLib.TextLayer({
    textContentSource: page.streamTextContent(),
    container: textLayerDiv,
    viewport,
  });
  await textLayer.render();
}

// ── Highlights (CSS Custom Highlight API) ────────────────────────────────────

const _hlColors = {
  yellow: 'rgba(255,220,0,0.5)',
  green:  'rgba(80,200,80,0.45)',
  blue:   'rgba(80,160,255,0.45)',
  pink:   'rgba(255,100,180,0.45)',
};

export function addHighlight(h) {
  const { location } = h;
  if (!location || location.type !== 'pdf') return;
  if (typeof CSS === 'undefined' || !CSS.highlights) return;

  const pageData = _pages.find(p => p.pageNum === location.page);
  if (!pageData) return;

  const textLayerDiv = pageData.wrapper.querySelector('.textLayer');
  if (!textLayerDiv) return;

  const range = _offsetToRange(textLayerDiv, location.startOffset, location.endOffset);
  if (!range) return;

  CSS.highlights.set(`hl-${h.id}`, new Highlight(range));
  _ensureHighlightStyle(h.id, h.color);
}

export function removeHighlight(id) {
  if (typeof CSS !== 'undefined' && CSS.highlights) {
    CSS.highlights.delete(`hl-${id}`);
  }
  document.getElementById(`hl-style-${id}`)?.remove();
}

export function goToLocation(location) {
  if (!location || location.type !== 'pdf') return;
  const wrapper = container.querySelector(`[data-page="${location.page}"]`);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _ensureHighlightStyle(id, color) {
  const styleId = `hl-style-${id}`;
  if (document.getElementById(styleId)) return;
  const bg = _hlColors[color] ?? _hlColors.yellow;
  const el = document.createElement('style');
  el.id = styleId;
  el.textContent = `::highlight(hl-${id}){background-color:${bg};color:inherit;}`;
  document.head.appendChild(el);
}

// Walk text nodes in the text layer and find the DOM Range for [startOffset, endOffset].
function _offsetToRange(textLayerDiv, startOffset, endOffset) {
  const walker = document.createTreeWalker(textLayerDiv, NodeFilter.SHOW_TEXT);
  let total = 0;
  let startNode = null, startOff = 0, endNode = null, endOff = 0;
  let nd;
  while ((nd = walker.nextNode())) {
    const len = nd.length;
    if (!startNode && total + len > startOffset) {
      startNode = nd;
      startOff  = startOffset - total;
    }
    if (!endNode && total + len >= endOffset) {
      endNode = nd;
      endOff  = endOffset - total;
      break;
    }
    total += len;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOff);
  range.setEnd(endNode, endOff);
  return range;
}

// ── Selection ───────────────────────────────────────────────────────────────

export function onSelection(cb) { _selCb = cb; }

function _attachSelectionListener() {
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { dismissPopup(); return; }

    const text = sel.toString();
    if (!text.trim()) { dismissPopup(); return; }

    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();

    const payload = _buildPayload(sel, range);
    if (!payload) return;

    popupSelection(rect, text, payload);
    if (_selCb) _selCb({ rangeRect: rect, text, payload });
  });
}

// Store char offsets within the page's text layer so we can recreate the Range
// at any zoom level without coordinate math.
function _buildPayload(sel, range) {
  let node = range.startContainer;
  while (node && node !== document.body) {
    if (node.classList?.contains('pdf-page-wrapper')) break;
    node = node.parentNode;
  }
  if (!node || node === document.body) return null;

  const pageNum  = parseInt(node.dataset.page, 10);
  const pageData = _pages.find(p => p.pageNum === pageNum);
  if (!pageData) return null;

  const textLayerDiv = node.querySelector('.textLayer');
  if (!textLayerDiv) return null;

  const walker = document.createTreeWalker(textLayerDiv, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let nd;
  while ((nd = walker.nextNode())) textNodes.push(nd);

  function charOffset(container, offset) {
    let total = 0;
    for (const n of textNodes) {
      if (n === container) return total + offset;
      total += n.length;
    }
    return -1;
  }

  const startOffset = charOffset(range.startContainer, range.startOffset);
  const endOffset   = charOffset(range.endContainer,   range.endOffset);
  if (startOffset < 0 || endOffset < 0 || startOffset >= endOffset) return null;

  return { type: 'pdf', page: pageNum, startOffset, endOffset };
}

// ── Nav ─────────────────────────────────────────────────────────────────────

function _attachNav() {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const p = parseInt(e.target.dataset.page, 10);
        pageLabel.textContent = `${p} / ${_pdfDoc.numPages}`;
      }
    }
  }, { root: container, threshold: 0.5 });

  _pages.forEach(({ wrapper }) => io.observe(wrapper));

  btnPrev.addEventListener('click', () => {
    const cur = _currentPage();
    if (cur > 1) _gotoPage(cur - 1);
  });
  btnNext.addEventListener('click', () => {
    const cur = _currentPage();
    if (cur < _pdfDoc.numPages) _gotoPage(cur + 1);
  });
  btnZoomIn.addEventListener('click',  () => _setZoom(_scale + 0.25));
  btnZoomOut.addEventListener('click', () => _setZoom(_scale - 0.25));

  document.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft')  btnPrev.click();
    if (e.key === 'ArrowRight') btnNext.click();
    if (e.key === '+') btnZoomIn.click();
    if (e.key === '-') btnZoomOut.click();
    if (e.key === 'f') document.documentElement.requestFullscreen?.();
  });
}

function _currentPage() {
  for (const { wrapper, pageNum } of _pages) {
    const rect = wrapper.getBoundingClientRect();
    if (rect.top >= 0 || rect.bottom > 0) return pageNum;
  }
  return 1;
}

function _gotoPage(n) {
  const wrapper = container.querySelector(`[data-page="${n}"]`);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function _setZoom(newScale) {
  _scale = Math.max(0.5, Math.min(4, newScale));
  zoomLabel.textContent = Math.round(_scale * 100) + '%';
  // Ranges point into old DOM nodes — clear before re-render, recreate after.
  const highlights = _getHighlights();
  highlights.forEach(h => {
    if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete(`hl-${h.id}`);
  });
  await _renderAllPages();
  highlights.forEach(h => addHighlight(h));
}
