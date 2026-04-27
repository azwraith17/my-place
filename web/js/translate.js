import { api } from './api.js';

const resultEl = document.getElementById('translation-result');

export async function translateText(text) {
  resultEl.textContent = '…';
  resultEl.style.display = 'block';
  try {
    const data = await api.get(
      `/api/translate?q=${encodeURIComponent(text)}&source=en&target=fa`
    );
    resultEl.textContent = data.translatedText || '—';
  } catch {
    resultEl.textContent = 'Translation failed';
  }
}

export function hideTranslation() {
  resultEl.style.display = 'none';
  resultEl.textContent = '';
}
