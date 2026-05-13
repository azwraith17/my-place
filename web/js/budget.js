import { api } from './api.js';
import { ulid } from './ulid.js';
import { initNav } from './nav.js?v=3';

initNav('budget');

const toastEl    = document.getElementById('toast-area');
const monthLabel = document.getElementById('month-label');
const txnList    = document.getElementById('txn-list');
const addForm    = document.getElementById('add-form');
const addBtn     = document.getElementById('add-btn');
const cancelBtn  = document.getElementById('cancel-btn');
const sumIncome  = document.getElementById('sum-income');
const sumExpense = document.getElementById('sum-expense');
const sumBalance = document.getElementById('sum-balance');

let currentDate  = new Date();
let selectedType = 'income';

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  toastEl.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function monthStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthDisplay(d) {
  return d.toLocaleDateString('default', { month: 'long', year: 'numeric' });
}

function fmt(n) {
  return n.toLocaleString('default', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resetSummary() {
  sumIncome.textContent = '0.00';
  sumExpense.textContent = '0.00';
  sumBalance.textContent = '0.00';
  sumBalance.className = 'value';
}

function renderTxns(txns) {
  txnList.innerHTML = '';

  if (!txns.length) {
    resetSummary();
    txnList.innerHTML = '<p class="empty-msg">No transactions this month.</p>';
    return;
  }

  let income = 0, expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  const balance = income - expense;
  sumIncome.textContent  = fmt(income);
  sumExpense.textContent = fmt(expense);
  sumBalance.textContent = fmt(Math.abs(balance));
  if (balance < 0) sumBalance.textContent = '-' + sumBalance.textContent;
  sumBalance.className   = 'value ' + (balance >= 0 ? 'income' : 'expense');

  const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
  const groups = {};
  for (const t of sorted) {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  }

  for (const [date, items] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'day-group';
    const d = new Date(date + 'T00:00:00');
    const label = d.toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' });
    section.innerHTML = `<div class="day-header">${label}</div>`;

    for (const t of items) {
      const row = document.createElement('div');
      row.className = 'txn-row';
      row.dataset.id = t.id;
      const sign = t.type === 'income' ? '+' : '-';
      const cls  = t.type === 'income' ? 'income' : 'expense';
      row.innerHTML = `
        ${t.category ? `<span class="txn-cat">${esc(t.category)}</span>` : ''}
        <span class="txn-desc">${esc(t.description || '')}</span>
        <span class="txn-amount ${cls}">${sign}${fmt(t.amount)}</span>
        <button class="txn-delete" title="Delete">✕</button>
      `;
      row.querySelector('.txn-delete').addEventListener('click', () => deleteTxn(t.id));
      section.appendChild(row);
    }
    txnList.appendChild(section);
  }
}

async function load() {
  const month = monthStr(currentDate);
  monthLabel.textContent = monthDisplay(currentDate);
  txnList.innerHTML = '<p class="empty-msg">Loading…</p>';
  resetSummary();
  try {
    const txns = await api.get(`/api/budget/transactions?month=${month}`);
    renderTxns(txns);
  } catch (err) {
    toast('Failed to load: ' + err.message, true);
    txnList.innerHTML = '';
  }
}

async function deleteTxn(id) {
  try {
    await api.delete(`/api/budget/transactions/${id}`);
    load();
  } catch (err) {
    toast('Delete failed: ' + err.message, true);
  }
}

// Type toggle
document.getElementById('type-income').addEventListener('click', () => {
  selectedType = 'income';
  document.getElementById('type-income').classList.add('active');
  document.getElementById('type-expense').classList.remove('active');
});
document.getElementById('type-expense').addEventListener('click', () => {
  selectedType = 'expense';
  document.getElementById('type-expense').classList.add('active');
  document.getElementById('type-income').classList.remove('active');
});

// Show / hide form
addBtn.addEventListener('click', () => {
  addForm.classList.add('open');
  addBtn.style.display = 'none';
  document.getElementById('f-amount').focus();
});

function closeForm() {
  addForm.classList.remove('open');
  addBtn.style.display = '';
  addForm.reset();
  selectedType = 'income';
  document.getElementById('type-income').classList.add('active');
  document.getElementById('type-expense').classList.remove('active');
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
}

cancelBtn.addEventListener('click', closeForm);

// Submit
addForm.addEventListener('submit', async e => {
  e.preventDefault();
  const amount      = parseFloat(document.getElementById('f-amount').value);
  const category    = document.getElementById('f-category').value.trim();
  const description = document.getElementById('f-desc').value.trim();
  const date        = document.getElementById('f-date').value;
  if (!amount || !date) return;
  try {
    await api.post('/api/budget/transactions', { id: ulid(), type: selectedType, amount, category, description, date });
    closeForm();
    load();
  } catch (err) {
    toast('Failed to save: ' + err.message, true);
  }
});

// Month nav
document.getElementById('prev-month').addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  load();
});
document.getElementById('next-month').addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  load();
});

// Set default date and load
document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
load();
