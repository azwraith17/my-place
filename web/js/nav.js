import { api } from './api.js';

const TABS = [
  { id: 'library', label: 'My Library', href: '/library.html' },
  { id: 'budget',  label: 'Budget',     href: '/budget.html' },
];

export function initNav(activeTab, extraHeaderHTML = '') {
  const tabs = TABS.map(t =>
    `<a href="${t.href}" class="tool-tab${t.id === activeTab ? ' active' : ''}">${t.label}</a>`
  ).join('');

  const frag = document.createRange().createContextualFragment(`
    <header>
      <a href="/library.html" class="header-logo">MY PLACE</a>
      <nav class="header-nav">${tabs}</nav>
      <div class="header-actions">
        ${extraHeaderHTML}
        <button class="btn btn-ghost btn-sm" id="logout-btn">Logout</button>
      </div>
    </header>
  `);

  document.body.prepend(frag);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    location.href = '/login.html';
  });
}
