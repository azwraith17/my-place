import { api } from './api.js';

const TABS = [
  { id: 'books',  label: 'Books',  href: '/library.html' },
  { id: 'budget', label: 'Budget', href: '/budget.html' },
];

export function initNav(activeTab, extraHeaderHTML = '') {
  const tabs = TABS.map(t =>
    `<a href="${t.href}" class="tool-tab${t.id === activeTab ? ' active' : ''}">${t.label}</a>`
  ).join('');

  const frag = document.createRange().createContextualFragment(`
    <header>
      <h1>Library</h1>
      ${extraHeaderHTML}
      <button class="btn btn-ghost" id="logout-btn">Logout</button>
    </header>
    <nav class="tool-nav">${tabs}</nav>
  `);

  document.body.prepend(frag);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    location.href = '/login.html';
  });
}
