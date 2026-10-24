'use strict';

/* ==========================================================================
   TipidTrack — script.js
   All data lives in one object (S) saved to localStorage.
   To add PHP/MySQL later, replace load() and save() with fetch() calls;
   the rest of the code stays the same.

   CONTENTS
    1. CONSTANTS
    2. STATE
    3. HELPERS
    4. CALCULATIONS
    5. UI HELPERS
    6. ALERTS
    7. FORMS AND ACTIONS
    8. RENDERING
    9. DEMO DATA, EXPORT AND IMPORT
   10. EVENTS
   11. START
   ========================================================================== */


/* ==========================================================================
   1. CONSTANTS
   Fixed lists used across the app: categories, pages, labels.
   ========================================================================== */
const KEY = 'tipidtrack.v1';
// Expense categories: [name, Lucide icon, color]
const CATS = [['Food and Drinks', 'utensils', '#e8a33d'], ['Transportation', 'bus', '#4aa3df'], ['School Supplies', 'pencil', '#9b7fe6'],
['Mobile Data and Internet', 'wifi', '#2fbf8a'], ['Personal Care', 'sparkles', '#e87fb0'], ['Entertainment', 'clapperboard', '#f0705a'],
['Shopping', 'shopping-bag', '#c9b458'], ['Emergency', 'siren', '#d9534f'], ['Other', 'ellipsis', '#928F89']];
// Category lookup by name → { icon, color }
const CM = Object.fromEntries(CATS.map(([n, i, c]) => [n, { i, c }]));
// Allowance sources
const SRC = ['Daily allowance', 'Weekly allowance', 'Scholarship', 'Part-time work', 'Other income'];
// Payment methods
const PAY = ['Cash', 'GCash', 'Maya', 'Debit card', 'Other'];
// Pages: [id, label, icon]
const NAV = [['overview', 'Overview', 'layout-dashboard'], ['transactions', 'Transactions', 'receipt'], ['allowances', 'Allowances', 'hand-coins'],
['budgets', 'Budgets', 'gauge'], ['savings', 'Savings Goals', 'piggy-bank'], ['analytics', 'Analytics', 'chart-line'],
['notifications', 'Notifications', 'bell'], ['settings', 'Settings', 'settings']];
// Wording for each dashboard period
const PL = { today: 'today', week: 'this week', month: 'this month', custom: 'in this range' };
// Budget status labels, from level 0 (fine) to 3 (exceeded)
const LV = ['On track', 'Approaching the limit', 'Almost at the limit', 'Budget exceeded'];
// True if the user prefers reduced motion
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;


/* ==========================================================================
   2. STATE
   All saved data lives in one object, S. Everything else here is temporary UI state.
   ========================================================================== */
// An empty data object (also the shape of the saved data)
const blank = () => ({
  init: false, demo: false, name: 'Student', income: [], expenses: [], xfers: [], goals: [],
  budget: { period: 'weekly', total: 0, cats: {} }, notifs: [], seen: [], set: { theme: 'dark', cur: 'PHP', w1: 70, w2: 90 }
});
// Read saved data from localStorage (falls back to empty)
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d ? { ...blank(), ...d } : blank(); } catch { return blank(); } };
let S = load();
// Write data to localStorage
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save. Browser storage may be full or blocked.'); } };
let sec = 'overview', F = { p: 'month', from: '', to: '' }, T = { q: '', cat: 'All', from: '', to: '', sort: 'new' }, PREV = {}, LAST = null, CH = {};


/* ==========================================================================
   3. HELPERS
   Small utility functions: DOM shortcuts, formatting, dates.
   ========================================================================== */
// DOM shortcuts
const $ = (s, e = document) => e.querySelector(s), $$ = (s, e = document) => [...e.querySelectorAll(s)];
// Unique id for each record
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Escape text before putting it into HTML (prevents injection)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Add up a field (default: amount) across a list
const sum = (a, k = 'amount') => a.reduce((s, x) => s + (+x[k] || 0), 0);
// Format a number as currency (₱ by default)
const fmt = n => new Intl.NumberFormat(S.set.cur === 'PHP' ? 'en-PH' : 'en-US', { style: 'currency', currency: S.set.cur }).format(n || 0);
const sym = () => S.set.cur === 'PHP' ? '₱' : '$';
// Read a CSS variable (used to color charts)
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
// Date helpers: dates are stored as "YYYY-MM-DD" (expenses also "THH:mm")
const pad = n => String(n).padStart(2, '0');
const ds = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ds(new Date());
const nowL = () => { const d = new Date(); return `${ds(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const pd = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const days = (a, b) => Math.round((pd(b) - pd(a)) / 864e5) + 1;
const inR = (x, [a, b]) => { const k = x.slice(0, 10); return k >= a && k <= b; };
const fd = s => (pd(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })) +
  (s.length > 10 ? ' ' + new Date(s).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '');
const wkStart = s => add(s, -((pd(s).getDay() + 6) % 7));
// Start and end dates for Today / This week / This month
function range(p) {
  const t = today(), d = pd(t);
  if (p === 'today') return [t, t];
  if (p === 'week') { const s = wkStart(t); return [s, add(s, 6)]; }
  return [ds(new Date(d.getFullYear(), d.getMonth(), 1)), ds(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
}
// The date range currently chosen in the dashboard filter
const curR = () => F.p === 'custom' && F.from && F.to && F.from <= F.to ? [F.from, F.to] : range(F.p === 'custom' ? 'month' : F.p);
// The equal-length period right before a range
const prevR = R => { const n = days(...R); return [add(R[0], -n), add(R[0], -1)]; };


/* ==========================================================================
   4. CALCULATIONS
   Totals are always calculated from the records, never stored twice.
   ========================================================================== */
// Amount saved in a goal = opening amount + transfers
const gs = g => g.start + sum(S.xfers.filter(x => x.goal === g.id));          // goal saved = opening amount + transfers
// Available balance = income − expenses − money moved to savings
const bal = () => sum(S.income) - sum(S.expenses) - sum(S.xfers);              // income − expenses − money moved to savings
// Percentage of a limit used
const pct = (v, l) => l > 0 ? v / l * 100 : 0;
// Budget status level: 0 normal, 1 approaching, 2 almost, 3 exceeded
const lvl = p => p >= 100 ? 3 : p >= S.set.w2 ? 2 : p >= S.set.w1 ? 1 : 0;
// Current budget period: dates, total spent, and spent per category
function binfo() {
  const p = S.budget.period, [a, b] = range(p === 'weekly' ? 'week' : 'month');
  const ex = S.expenses.filter(x => inR(x.date, [a, b])), by = {};
  ex.forEach(x => by[x.cat] = (by[x.cat] || 0) + x.amount);
  return { p, a, b, spent: sum(ex), by, total: S.budget.total, cats: S.budget.cats };
}
// Spending per category, biggest first
const byCat = E => { const m = {}; E.forEach(x => m[x.cat] = (m[x.cat] || 0) + x.amount); return Object.entries(m).sort((a, b) => b[1] - a[1]); };


/* ==========================================================================
   5. UI HELPERS
   Toasts, confetti, modal dialogs, and the reusable validated form.
   ========================================================================== */
// Small message that disappears after a moment
function toast(m) { const t = document.createElement('div'); t.className = 'toast-t'; t.textContent = m; $('#toasts').append(t); setTimeout(() => t.remove(), 2800); }
// Confetti burst for completed goals
function confetti() {
  if (REDUCE) return;
  for (let i = 0; i < 36; i++) {
    const d = document.createElement('i'); d.className = 'cf';
    d.style.cssText = `left:${50 + (Math.random() - .5) * 30}%;--x:${(Math.random() - .5) * 600}px;--r:${Math.random() * 720}deg;background:${['#3fcf9a', '#FCF6EC', '#e8a33d', '#4aa3df'][i % 4]};animation-delay:${Math.random() * .2}s`;
    document.body.append(d); setTimeout(() => d.remove(), 1900);
  }
}
// HTML for a friendly empty state
const empty = (ic, t, p, btn, a) => `<div class="empty"><i data-lucide="${ic}"></i><h4>${t}</h4><p>${p}</p>${btn ? `<button class="btn mt-2" data-a="${a}">${btn}</button>` : ''}</div>`;
// The shared Bootstrap modal
const modal = () => bootstrap.Modal.getOrCreateInstance($('#m'));
// Open the shared modal with a title, body and confirm button
function showModal(title, html, okLabel, onOk, danger) {
  $('#mT').textContent = title; $('#mB').innerHTML = html; $('#mErr').hidden = true;
  const ok = $('#mOk'); ok.textContent = okLabel; ok.classList.toggle('bad', !!danger);
  ok.onclick = () => { const e = onOk(); if (e) { $('#mErr').textContent = e; $('#mErr').hidden = false; } else modal().hide(); };
  modal().show();
}
// Confirmation dialog (used before deleting or resetting)
const ask = (title, msg, label, fn) => showModal(title, `<p>${msg}</p>`, label, () => { fn(); }, true);
/* Generic validated form: fields = [{k,l,t,r,z,o,d}] */
// Build a validated form from a field list, then call onSave with the values
function form(title, fields, v, onSave) {
  const html = `<form id="fm" novalidate>${fields.map(f => {
    const val = v?.[f.k] ?? f.d ?? '', id = 'f_' + f.k;
    const inp = f.t === 'select' ? `<select class="form-select" id="${id}">${f.o.map(o => `<option ${o == val ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : f.t === 'area' ? `<textarea class="form-control" id="${id}" rows="2" maxlength="200">${esc(val)}</textarea>`
        : `<input class="form-control" id="${id}" type="${f.t || 'text'}" value="${esc(val)}" ${f.t === 'number' ? 'step="0.01" min="0" inputmode="decimal"' : 'maxlength="60"'}>`;
    return `<div class="mb-3"><label class="form-label" for="${id}">${f.l}</label>${inp}<div class="invalid-feedback"></div></div>`;
  }).join('')}</form>`;
  showModal(title, html, 'Save', () => {
    const out = {}; let bad = false;
    fields.forEach(f => {
      const el = $('#f_' + f.k); let x = el.value.trim(), e = '';
      if (f.r && !x) e = 'This field is required.';
      else if (f.t === 'number' && x !== '') { const n = +x; if (!isFinite(n) || n < (f.z ? 0 : .01) || n > 1e8) e = f.z ? 'Enter 0 or more.' : 'Enter an amount above 0.'; x = n; }
      else if ((f.t === 'date' || f.t === 'datetime-local') && x && isNaN(Date.parse(x))) e = 'Enter a valid date.';
      el.classList.toggle('is-invalid', !!e); if (el.nextElementSibling) el.nextElementSibling.textContent = e;
      if (e) bad = true; out[f.k] = x;
    });
    return bad ? 'Fix the highlighted fields and try again.' : onSave(out);
  });
}
// After any change: check alerts, save, redraw, show a toast
function commit(msg) { checkAlerts(); save(); render(); if (msg) toast(msg); }


/* ==========================================================================
   6. ALERTS
   Budget and goal notifications. Each alert key fires only once per budget period.
   ========================================================================== */
// Add a notification once (skips keys already seen)
function note(key, title, text, type) {
  if (S.seen.includes(key)) return;
  S.seen.push(key); S.seen = S.seen.slice(-300);
  S.notifs.unshift({ id: uid(), t: Date.now(), title, text, type, read: false }); S.notifs = S.notifs.slice(0, 50);
}
// Create notifications for categories, overall budget and completed goals
function checkAlerts() {
  const B = binfo();
  CATS.forEach(([n]) => {
    const l = B.cats[n] || 0; if (!l) return;
    const p = pct(B.by[n] || 0, l), v = lvl(p);
    if (v) note(`c|${n}|${v}|${B.a}`, v === 3 ? `${n} budget exceeded` : `${n}: ${LV[v].toLowerCase()}`, `You've used ${Math.round(p)}% of your ${n} limit (${fmt(B.by[n])} of ${fmt(l)}).`, v);
  });
  if (B.total) {
    const p = pct(B.spent, B.total), v = lvl(p);
    if (v >= 2) note(`t|${v}|${B.a}`, v === 3 ? 'Overall budget exceeded' : 'Overall budget almost used up', `You've spent ${fmt(B.spent)} of your ${fmt(B.total)} ${B.p} budget (${Math.round(p)}%).`, v);
  }
  S.goals.forEach(g => { if (gs(g) >= g.target) note(`g|${g.id}`, 'Goal completed', `${g.name} reached ${fmt(g.target)}. Nice work.`, 'g'); });
}


/* ==========================================================================
   7. FORMS AND ACTIONS
   Add/edit/delete forms and the button-click router (ACT).
   ========================================================================== */
// Add or edit an expense
function expenseForm(id) {
  const ex = id && S.expenses.find(x => x.id === id);
  form(ex ? 'Edit expense' : 'Add expense', [
    { k: 'name', l: 'Expense name', r: 1 }, { k: 'amount', l: 'Amount', t: 'number', r: 1 },
    { k: 'cat', l: 'Category', t: 'select', o: CATS.map(c => c[0]) }, { k: 'date', l: 'Date and time', t: 'datetime-local', r: 1, d: nowL() },
    { k: 'method', l: 'Payment method', t: 'select', o: PAY }, { k: 'note', l: 'Notes (optional)', t: 'area' }], ex, v => {
      const r = { id: ex ? ex.id : uid(), name: v.name, amount: v.amount, cat: v.cat, date: v.date, method: v.method, note: v.note };
      if (ex) Object.assign(ex, r); else { S.expenses.push(r); LAST = r.id; }
      commit(ex ? 'Expense updated' : 'Expense added');
    });
}
// Add or edit an allowance
function incomeForm(id) {
  const x = id && S.income.find(i => i.id === id);
  form(x ? 'Edit allowance' : 'Add allowance', [
    { k: 'amount', l: 'Amount', t: 'number', r: 1 }, { k: 'date', l: 'Date received', t: 'date', r: 1, d: today() },
    { k: 'source', l: 'Source', t: 'select', o: SRC }, { k: 'note', l: 'Notes (optional)', t: 'area' }], x, v => {
      const r = { id: x ? x.id : uid(), amount: v.amount, date: v.date, source: v.source, note: v.note };
      if (x) Object.assign(x, r); else { S.income.push(r); LAST = r.id; }
      commit(x ? 'Allowance updated' : 'Allowance added');
    });
}
// Edit the budget period, total and category limits
function budgetForm() {
  const b = S.budget, v = { period: b.period === 'weekly' ? 'Weekly' : 'Monthly', total: b.total };
  CATS.forEach(([n], i) => v['c' + i] = b.cats[n] || 0);
  form('Edit budgets', [{ k: 'period', l: 'Budget period', t: 'select', o: ['Weekly', 'Monthly'] }, { k: 'total', l: 'Total budget (0 = none)', t: 'number', z: 1 },
  ...CATS.map(([n], i) => ({ k: 'c' + i, l: `${n} limit (0 = none)`, t: 'number', z: 1 }))], v, o => {
    const cats = {}; let s = 0;
    CATS.forEach(([n], i) => { const x = +o['c' + i] || 0; if (x) { cats[n] = x; s += x; } });
    if (+o.total && s > +o.total) return `Category limits add up to ${fmt(s)}, which is more than your total budget.`;
    S.budget = { period: o.period.toLowerCase(), total: +o.total || 0, cats }; commit('Budgets saved');
  });
}
// Add or edit a savings goal
function goalForm(id) {
  const g = id && S.goals.find(x => x.id === id);
  form(g ? 'Edit goal' : 'New savings goal', [
    { k: 'name', l: 'Goal name', r: 1 }, { k: 'target', l: 'Target amount', t: 'number', r: 1 },
    { k: 'start', l: 'Already saved (doesn\'t change your balance)', t: 'number', z: 1, d: 0 }, { k: 'date', l: 'Target date (optional)', t: 'date' },
    { k: 'desc', l: 'Description (optional)', t: 'area' }], g, v => {
      const r = { id: g ? g.id : uid(), name: v.name, target: v.target, start: +v.start || 0, date: v.date, desc: v.desc };
      if (g) Object.assign(g, r); else S.goals.push(r);
      commit(g ? 'Goal updated' : 'Goal created');
    });
}
// Add money to, or withdraw from, a goal (a transfer, not an expense)
function moveForm(id, out) {
  const g = S.goals.find(x => x.id === id);
  form(`${out ? 'Withdraw from' : 'Add to'} ${g.name}`, [{ k: 'amount', l: 'Amount', t: 'number', r: 1 }, { k: 'date', l: 'Date', t: 'date', r: 1, d: today() }, { k: 'note', l: 'Notes (optional)', t: 'area' }], null, v => {
    if (out && v.amount > gs(g)) return `This goal only has ${fmt(gs(g))} saved.`;
    if (!out && v.amount > bal()) return `You only have ${fmt(bal())} available to move.`;
    const before = gs(g);
    S.xfers.push({ id: uid(), goal: g.id, amount: out ? -v.amount : v.amount, date: v.date, note: v.note });
    if (before < g.target && gs(g) >= g.target) { confetti(); commit(`Goal reached: ${g.name}!`); } else commit(out ? 'Withdrawal recorded' : 'Contribution recorded');
  });
}
// Maps data-a="..." buttons to their actions
const ACT = {
  'add-e': () => expenseForm(), 'add-i': () => incomeForm(), 'add-g': () => goalForm(), 'edit-b': budgetForm,
  'edit-e': expenseForm, 'edit-i': incomeForm, 'edit-g': goalForm, 'in-g': id => moveForm(id, 0), 'out-g': id => moveForm(id, 1),
  'del-e': id => ask('Delete expense?', 'This removes it from your totals and charts.', 'Delete', () => { S.expenses = S.expenses.filter(x => x.id !== id); commit('Expense deleted'); }),
  'del-i': id => ask('Delete allowance?', 'This lowers your available balance.', 'Delete', () => { S.income = S.income.filter(x => x.id !== id); commit('Allowance deleted'); }),
  'del-g': id => ask('Delete goal?', 'Money saved in this goal returns to your available balance.', 'Delete goal', () => { S.goals = S.goals.filter(x => x.id !== id); S.xfers = S.xfers.filter(x => x.goal !== id); commit('Goal deleted'); }),
  'read-n': id => { const n = S.notifs.find(x => x.id === id); if (n) { n.read = true; save(); render(); } }
};
document.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && ACT[b.dataset.a]) ACT[b.dataset.a](b.dataset.id); });


/* ==========================================================================
   8. RENDERING
   Draws each page, the charts and the insights. render() redraws the current page.
   ========================================================================== */
// HTML for the edit and delete buttons
const acts = (k, id) => `<span class="acts"><button class="ib" data-a="edit-${k}" data-id="${id}" aria-label="Edit"><i data-lucide="pencil"></i></button><button class="ib" data-a="del-${k}" data-id="${id}" aria-label="Delete"><i data-lucide="trash-2"></i></button></span>`;
// HTML for one transaction row
function row(x, withActs) {
  const i = x.k === 'i', c = i ? { i: 'arrow-down-left', c: '#3fcf9a' } : CM[x.cat] || CM.Other;
  return `<div class="tx ${x.id === LAST ? 'new' : ''}"><span class="ic" style="--c:${c.c}"><i data-lucide="${c.i}"></i></span>
  <div class="tm"><b>${esc(x.name || x.source)}</b><small>${i ? esc(x.source) : `<span class="tag" style="--c:${c.c}">${esc(x.cat)}</span> ${esc(x.method)}`} · ${fd(x.date)}</small></div>
  <b class="${i ? 'pos' : ''}">${i ? '+' : '−'}${fmt(x.amount)}</b>${withActs ? acts(x.k, x.id) : ''}</div>`;
}
// Create or replace a chart; shows the empty message when there is no data
function chart(id, cfg, has) {
  const c = $('#' + id); c.parentElement.classList.toggle('empty', !has);
  CH[id]?.destroy(); delete CH[id]; if (!has) return;
  cfg.options = { responsive: true, maintainAspectRatio: false, ...cfg.options };
  CH[id] = new Chart(c, cfg);
}
// Chart tooltip text
const tip = { callbacks: { label: c => `${c.chart.config.type === 'doughnut' ? c.label : c.dataset.label}: ${fmt(c.parsed.y ?? c.parsed)}` } };
// Shared chart axes
const axes = () => ({ x: { grid: { display: false }, ticks: { color: css('--mu') } }, y: { beginAtZero: true, grid: { color: css('--line') }, ticks: { color: css('--mu'), callback: v => sym() + v } } });
// Shared chart legend
const legend = () => ({ labels: { color: css('--tx'), boxWidth: 12 } });
// Doughnut chart of spending by category
function catChart(id, E) {
  const d = byCat(E);
  chart(id, {
    type: 'doughnut', data: { labels: d.map(x => x[0]), datasets: [{ data: d.map(x => x[1]), backgroundColor: d.map(x => CM[x[0]].c), borderColor: css('--sf'), borderWidth: 2 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom', ...legend() }, tooltip: tip } }
  }, d.length > 0);
}
// Animate progress bars from 0 to their value
function bars() { requestAnimationFrame(() => requestAnimationFrame(() => $$('.pb i[data-p]').forEach(b => b.style.width = b.dataset.p + '%'))); }
// Count-up animation for the dashboard numbers
function counts() {
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k, to = +el.dataset.v, from = PREV[k] ?? 0; PREV[k] = to;
    if (REDUCE || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    (function f(t) { const p = Math.min(1, (t - t0) / 600); el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); })(t0);
  });
}
// Rule-based insights calculated from the records
function insights(R, E) {
  const L = [], exp = sum(E), B = binfo(), t = today();
  const top = byCat(E)[0];
  if (top) L.push([`${top[0]} is your highest spending category ${PL[F.p]}.`, `${fmt(top[1])}, ${Math.round(top[1] / exp * 100)}% of ${fmt(exp)} spent in this period.`]);
  const el = Math.max(1, days(R[0], R[1] < t ? R[1] : t));
  if (exp) L.push([`Your average daily spending is ${fmt(exp / el)}.`, `Calculated from ${fmt(exp)} over ${el} day(s).`]);
  if (B.total) {
    const p = pct(B.spent, B.total);
    L.push([`You have used ${Math.round(p)}% of your ${B.p} budget.`, `${fmt(B.spent)} spent of ${fmt(B.total)}. Status: ${LV[lvl(p)].toLowerCase()}.`]);
    const done = Math.max(1, days(B.a, t)), all = days(B.a, B.b), proj = B.spent / done * all;
    if (done >= 2 && proj > B.total) L.push([`Estimate: your current spending pace may exceed your ${B.p} budget.`, `If you keep spending ${fmt(B.spent / done)} a day, you'd reach about ${fmt(proj)}. This is an estimate, not a prediction.`]);
  }
  const g = S.goals.map(g => ({ g, r: g.target - gs(g) })).filter(x => x.r > 0).sort((a, b) => a.r - b.r)[0];
  if (g) L.push([`You are ${fmt(g.r)} away from your goal "${g.g.name}".`, `${fmt(gs(g.g))} saved of ${fmt(g.g.target)}.`]);
  const P = sum(S.expenses.filter(x => inR(x.date, prevR(R))));
  if (P && F.p !== 'today') L.push([`Spending is ${exp >= P ? 'up' : 'down'} ${Math.abs(Math.round((exp - P) / P * 100))}% compared with the previous period.`, `${fmt(exp)} now vs ${fmt(P)} before.`]);
  return L;
}
// Overview page: cards, charts, insights, recent transactions
function rOverview() {
  const R = curR(), E = S.expenses.filter(x => inR(x.date, R)), I = S.income.filter(x => inR(x.date, R));
  const saved = sum(S.goals.map(g => ({ amount: gs(g) }))), tgt = sum(S.goals, 'target');
  const B = binfo(), left = B.total ? Math.max(0, B.total - B.spent) : Math.max(0, bal());
  const dl = days(today(), B.b), lim = Math.min(left, Math.max(0, bal())) / Math.max(1, dl);
  const h = new Date().getHours();
  $('#date').textContent = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  $('#hi').textContent = `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${S.name}.`;
  const C = (ic, l, k, v, n) => `<div class="cd"><p class="lbl"><i data-lucide="${ic}"></i>${l}</p><p class="num" data-k="${k}" data-v="${v}">${fmt(v)}</p><p class="note">${n}</p></div>`;
  $('#cards').innerHTML = `<div class="hero"><p class="lbl"><i data-lucide="wallet"></i>Available balance</p><div><p class="num big" data-k="bal" data-v="${bal()}">${fmt(bal())}</p><p class="note mt-2">All income minus expenses and money moved to savings.</p></div></div>`
    + C('hand-coins', 'Total allowance', 'inc', sum(I), `Received ${PL[F.p]}`)
    + C('receipt-text', 'Total expenses', 'exp', sum(E), `Spent ${PL[F.p]}. Savings transfers aren't counted.`)
    + C('piggy-bank', 'Savings progress', 'sav', saved, tgt ? `of ${fmt(tgt)} across ${S.goals.length} goal(s)` : 'Create a goal to start saving')
    + C('calendar-clock', 'Daily spending limit', 'lim', lim, B.total ? `Left in your ${B.p} budget ÷ ${dl} day(s) left` : `Balance ÷ ${dl} day(s) left. Set a budget for a sharper limit.`);
  const R2 = [Math.max(R[0], add(R[1] > today() ? today() : R[1], -91)), R[1] > today() ? today() : R[1]], n = Math.max(1, days(...R2)), lab = [], val = [];
  for (let i = 0; i < n; i++) { const d = add(R2[0], i); lab.push(pd(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })); val.push(sum(E.filter(x => x.date.startsWith(d)))); }
  chart('c-line', {
    type: 'line', data: { labels: lab, datasets: [{ label: 'Spent', data: val, borderColor: css('--g'), backgroundColor: css('--g') + '22', fill: true, tension: .3, pointRadius: n > 31 ? 0 : 3 }] },
    options: { scales: axes(), plugins: { legend: { display: false }, tooltip: tip } }
  }, E.length > 0);
  catChart('c-cat', E);
  const ins = insights(R, E);
  $('#ins').innerHTML = ins.length ? ins.map(([a, b]) => `<li>${esc(a)}<small>${esc(b)}</small></li>`).join('') : `<li>${empty('lightbulb', 'No insights yet', 'Add an allowance and a few expenses. Insights come from your own records.')}</li>`;
  const rows = [...S.expenses.map(x => ({ ...x, k: 'e' })), ...S.income.map(x => ({ ...x, k: 'i' }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  $('#recent').innerHTML = rows.length ? rows.map(x => row(x)).join('') : empty('receipt', 'Nothing here yet', 'Record your allowance or an expense to get started.', 'Add expense', 'add-e');
}
// Transactions page (search, filter, sort)
function rTx() {
  const l = S.expenses.filter(x => (!T.q || x.name.toLowerCase().includes(T.q)) && (T.cat === 'All' || x.cat === T.cat) && (!T.from || x.date.slice(0, 10) >= T.from) && (!T.to || x.date.slice(0, 10) <= T.to));
  l.sort((a, b) => ({ new: b.date.localeCompare(a.date), old: a.date.localeCompare(b.date), high: b.amount - a.amount, low: a.amount - b.amount }[T.sort]));
  $('#txList').innerHTML = l.length ? l.map(x => row({ ...x, k: 'e' }, 1)).join('') : empty('search-x', 'No expenses found', S.expenses.length ? 'Try a different search or filter.' : 'Add your first expense to see it here.', 'Add expense', 'add-e');
}
// Allowances page
function rInc() {
  const l = [...S.income].sort((a, b) => b.date.localeCompare(a.date));
  $('#incList').innerHTML = l.length ? l.map(x => row({ ...x, k: 'i' }, 1)).join('') : empty('hand-coins', 'No allowance recorded', 'Add the money you receive so your balance is accurate.', 'Add allowance', 'add-i');
}
// Budgets page
function rBudgets() {
  const B = binfo(), names = CATS.map(c => c[0]).filter(n => B.cats[n] || B.by[n]).sort((a, b) => (B.by[b] || 0) - (B.by[a] || 0));
  const bar = p => `<div class="pb"><i class="l${lvl(p)}" data-p="${Math.min(100, p)}"></i></div>`;
  if (!B.total && !Object.keys(B.cats).length) { $('#bSum').innerHTML = ''; $('#bList').innerHTML = empty('gauge', 'No budget yet', 'Set a weekly or monthly budget and category limits to get alerts before you overspend.', 'Set a budget', 'edit-b'); return; }
  const p = pct(B.spent, B.total), top = byCat(S.expenses.filter(x => inR(x.date, [B.a, B.b])))[0];
  $('#bSum').innerHTML = `<p>${B.p === 'weekly' ? 'Weekly' : 'Monthly'} budget · ${fd(B.a)} to ${fd(B.b)}</p><p class="mu">${B.total ? `${fmt(B.spent)} of ${fmt(B.total)} used (${Math.round(p)}%)` : `${fmt(B.spent)} spent`}${top ? ` · ${top[0]} takes the biggest share` : ''}</p>`;
  $('#bList').innerHTML = (B.total ? `<div class="brow"><div><b>Overall</b><span class="st${lvl(p)}">${LV[lvl(p)]}</span></div>${bar(p)}<small class="mu">${fmt(Math.max(0, B.total - B.spent))} left</small></div>` : '')
    + names.map(n => {
      const l = B.cats[n] || 0, s = B.by[n] || 0, q = pct(s, l), c = CM[n];
      return `<div class="brow"><div><b><span class="tag" style="--c:${c.c}">${n}</span></b><span class="${l ? 'st' + lvl(q) : 'mu'}">${l ? LV[lvl(q)] : 'No limit set'}</span></div>${l ? bar(q) : ''}<small class="mu">${fmt(s)} spent${l ? ` of ${fmt(l)} · ${s > l ? fmt(s - l) + ' over' : fmt(l - s) + ' left'}` : ''}</small></div>`;
    }).join('');
}
// Savings goals page
function rSav() {
  $('#gList').innerHTML = S.goals.length ? S.goals.map(g => {
    const s = gs(g), p = Math.min(100, s / g.target * 100), rem = Math.max(0, g.target - s), done = s >= g.target; let plan = '';
    if (!done && g.date) { const d = days(today(), g.date); plan = d < 1 ? 'The target date has passed.' : d <= 60 ? `Save about ${fmt(rem / Math.ceil(d / 7))} a week to reach it by ${fd(g.date)}.` : `Save about ${fmt(rem / Math.max(1, Math.ceil(d / 30.44)))} a month to reach it by ${fd(g.date)}.`; }
    return `<article class="panel goal"><div class="d-flex justify-content-between align-items-start"><h3>${esc(g.name)}${done ? '<span class="badge2">Goal reached</span>' : ''}</h3>${acts('g', g.id)}</div>
    ${g.desc ? `<p class="mu">${esc(g.desc)}</p>` : ''}<div class="pb"><i class="${done ? 'l0' : 'l1'}" style="${done ? '' : 'background:var(--tx)'}" data-p="${p}"></i></div>
    <p><b>${fmt(s)}</b> <span class="mu">of ${fmt(g.target)} · ${done ? 'complete' : fmt(rem) + ' to go'}</span></p>${plan ? `<p class="mu">${plan} (estimate)</p>` : ''}
    <div class="gb"><button class="btn" data-a="in-g" data-id="${g.id}">Add money</button>${s > 0 ? `<button class="btn btn-ghost" data-a="out-g" data-id="${g.id}">Withdraw</button>` : ''}</div></article>`;
  }).join('')
    : `<div class="panel" style="grid-column:1/-1">${empty('piggy-bank', 'No savings goals yet', 'Start with an emergency fund or something you\'re saving up for.', 'New goal', 'add-g')}</div>`;
}
// Analytics page
function rAna() {
  const R = curR(), E = S.expenses.filter(x => inR(x.date, R)), I = S.income.filter(x => inR(x.date, R)), exp = sum(E), P = sum(S.expenses.filter(x => inR(x.date, prevR(R)))), top = byCat(E)[0];
  const ch = P ? Math.round((exp - P) / P * 100) : null;
  $('#aSum').innerHTML = `<div class="cd"><p class="lbl"><i data-lucide="trophy"></i>Highest-spending category</p><p class="num" style="font-size:25px">${top ? top[0] : 'None yet'}</p><p class="note">${top ? `${fmt(top[1])} ${PL[F.p]}` : 'Add expenses in this period'}</p></div>
  <div class="cd"><p class="lbl"><i data-lucide="trending-up"></i>Versus previous period</p><p class="num" style="font-size:25px">${ch === null ? 'No earlier data' : `${ch >= 0 ? '+' : '−'}${Math.abs(ch)}%`}</p><p class="note">${fmt(exp)} now${P ? ` vs ${fmt(P)} in the equal period before` : ''}</p></div>`;
  const key = days(...R) > 14 ? wkStart : s => s, m = {};
  I.forEach(x => { const k = key(x.date.slice(0, 10)); (m[k] ??= [0, 0])[0] += x.amount; });
  E.forEach(x => { const k = key(x.date.slice(0, 10)); (m[k] ??= [0, 0])[1] += x.amount; });
  const ks = Object.keys(m).sort(), lb = k => (days(...R) > 14 ? 'Week of ' : '') + pd(k).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  chart('a-bar', {
    type: 'bar', data: { labels: ks.map(lb), datasets: [{ label: 'Income', data: ks.map(k => m[k][0]), backgroundColor: css('--g') }, { label: 'Expenses', data: ks.map(k => m[k][1]), backgroundColor: css('--r') }] },
    options: { scales: axes(), plugins: { legend: legend(), tooltip: tip } }
  }, ks.length > 0);
  chart('a-sav', {
    type: 'bar', data: { labels: S.goals.map(g => g.name), datasets: [{ label: 'Saved', data: S.goals.map(gs), backgroundColor: css('--g') }, { label: 'Target', data: S.goals.map(g => g.target), backgroundColor: css('--line') }] },
    options: { scales: axes(), plugins: { legend: legend(), tooltip: tip } }
  }, S.goals.length > 0);
  const B = binfo(), cn = CATS.map(c => c[0]).filter(n => B.cats[n]);
  chart('a-bud', {
    type: 'bar', data: { labels: cn, datasets: [{ label: 'Budget', data: cn.map(n => B.cats[n]), backgroundColor: css('--line') }, { label: 'Actual', data: cn.map(n => B.by[n] || 0), backgroundColor: cn.map(n => css('--' + ['g', 'w', 'o', 'r'][lvl(pct(B.by[n] || 0, B.cats[n]))])) }] },
    options: { scales: axes(), plugins: { legend: legend(), tooltip: tip } }
  }, cn.length > 0);
}
// Notifications page
function rNotif() {
  $('#nList').innerHTML = S.notifs.length ? S.notifs.map(n => `<button class="nt ${n.read ? '' : 'un'}" data-a="read-n" data-id="${n.id}"><span class="d"></span><span><b>${esc(n.title)}</b>${esc(n.text)}<small>${new Date(n.t).toLocaleString('en-PH')}${n.read ? '' : ' · Unread'}</small></span></button>`).join('')
    : empty('bell-off', 'You\'re all caught up', 'Budget and savings alerts will show up here.');
}
// Settings page
function rSet() {
  $('#sName').value = S.name; $('#sTheme').value = S.set.theme; $('#sCur').value = S.set.cur; $('#sPer').value = S.budget.period; $('#w1').value = S.set.w1; $('#w2').value = S.set.w2;
}
// Update the bell count, profile, theme icon and filter buttons
function badge() {
  const n = S.notifs.filter(x => !x.read).length; $('#bd').textContent = n; $('#bd').hidden = !n;
  $('#av').textContent = (S.name[0] || 'S').toUpperCase(); $('#pn').textContent = S.name; $('#demoTag').hidden = !S.demo;
  $('#theme').innerHTML = `<i data-lucide="${S.set.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  $$('#filters [data-f]').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === F.p)); $('#cust').hidden = F.p !== 'custom';
}
// Redraw the current page
function render() {
  document.documentElement.dataset.theme = document.documentElement.dataset.bsTheme = S.set.theme;
  ({ overview: rOverview, transactions: rTx, allowances: rInc, budgets: rBudgets, savings: rSav, analytics: rAna, notifications: rNotif, settings: rSet })[sec]();
  badge(); $('#filters').hidden = !['overview', 'analytics'].includes(sec); LAST = null;
  lucide.createIcons(); bars(); counts();
}
// Switch page (no reload)
function go(s) {
  sec = s; const t = NAV.find(n => n[0] === s)[1];
  $$('[data-s]').forEach(x => x.classList.remove('on', 'enter'));
  const el = $('#' + s); el.classList.add('on'); void el.offsetWidth; el.classList.add('enter');
  $$('#nav button').forEach(b => { b.classList.toggle('act', b.dataset.s === s); b.toggleAttribute('aria-current', b.dataset.s === s); });
  $('#title').textContent = t; $('#crumb').textContent = 'TipidTrack / ' + t; history.replaceState(null, '', '#' + s);
  scrollTo(0, 0); render();
}


/* ==========================================================================
   9. DEMO DATA, EXPORT AND IMPORT
   Sample data, CSV/JSON export, and checking imported backups.
   ========================================================================== */
// Replace data with fictional sample data
function loadDemo() {
  const t = today(), ws = wkStart(t), o = n => add(t, n), at = (n, h) => `${o(n)}T${pad(h)}:00`, id = uid;
  const goals = [{ id: id(), name: 'Emergency Fund', target: 5000, start: 0, date: '', desc: 'Three weeks of allowance as a cushion.' },
  { id: id(), name: 'New Laptop', target: 35000, start: 0, date: add(t, 150), desc: 'For thesis and programming classes.' },
  { id: id(), name: 'School Projects', target: 1500, start: 0, date: '', desc: 'Printing, materials and a group project fund.' }];
  S = {
    ...blank(), init: true, demo: true, name: S.name, set: S.set, goals,
    income: [...[0, 7, 14, 21].map(n => ({ id: id(), amount: 1500, date: add(ws, -n), source: 'Weekly allowance', note: '' })), { id: id(), amount: 3000, date: o(-20), source: 'Scholarship', note: 'Monthly stipend' }, { id: id(), amount: 800, date: o(-9), source: 'Part-time work', note: 'Tutoring' }],
    expenses: [['Jeepney fare', 26, 'Transportation', 0, 7, 'Cash'], ['Lunch at canteen', 85, 'Food and Drinks', 0, 12, 'Cash'], ['Milk tea', 95, 'Food and Drinks', -1, 15, 'GCash'], ['Photocopy notes', 40, 'School Supplies', -1, 10, 'Cash'],
    ['Load 99 promo', 99, 'Mobile Data and Internet', -2, 19, 'GCash'], ['Dinner, rice meal', 120, 'Food and Drinks', -2, 18, 'Cash'], ['Tricycle', 40, 'Transportation', -3, 6, 'Cash'], ['Movie with friends', 280, 'Entertainment', -4, 17, 'Maya'],
    ['Shampoo', 110, 'Personal Care', -5, 13, 'Cash'], ['Lunch and snacks', 150, 'Food and Drinks', -6, 12, 'Cash'], ['Bond paper, folders', 185, 'School Supplies', -8, 11, 'Cash'], ['T-shirt on sale', 350, 'Shopping', -10, 16, 'GCash'],
    ['Groceries', 420, 'Food and Drinks', -12, 17, 'Debit card'], ['Bus to province', 260, 'Transportation', -15, 5, 'Cash'], ['Pharmacy, cough meds', 180, 'Emergency', -18, 20, 'Cash'], ['Wi-Fi share', 150, 'Mobile Data and Internet', -22, 9, 'GCash']]
      .map(([name, amount, cat, n, h, method]) => ({ id: id(), name, amount, cat, date: at(n, h), method, note: '' })),
    xfers: [[0, 1200, 7], [1, 2500, 14], [2, 1150, 3]].map(([i, amount, n]) => ({ id: id(), goal: goals[i].id, amount, date: o(-n), note: 'Demo transfer' })),
    budget: { period: 'weekly', total: 1500, cats: { 'Food and Drinks': 600, 'Transportation': 250, 'School Supplies': 250, 'Mobile Data and Internet': 150, 'Personal Care': 100, 'Entertainment': 150 } }
  };
}
// Make one CSV cell safe (quotes, and blocks spreadsheet formulas)
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// Download text as a file
function dl(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
// Export all records as CSV
function exportCsv() {
  const g = id => S.goals.find(x => x.id === id)?.name || '';
  const body = [...S.income.map(x => [x.date, 'Income', x.source, '', x.amount, '', x.note]), ...S.expenses.map(x => [x.date, 'Expense', x.name, x.cat, x.amount, x.method, x.note]),
  ...S.xfers.map(x => [x.date, x.amount > 0 ? 'Savings transfer in' : 'Savings withdrawal', g(x.goal), g(x.goal), Math.abs(x.amount), '', x.note])].sort((a, b) => b[0].localeCompare(a[0]));
  const r = [['Date', 'Type', 'Name or source', 'Category or goal', 'Amount', 'Payment method', 'Notes'], ...body];
  dl('tipidtrack-transactions.csv', r.map(l => l.map(csvCell).join(',')).join('\n'), 'text/csv'); toast('CSV exported');
}
// Check and sanitize an imported backup; throws an error if it is invalid
function clean(d) {
  const bad = m => { throw new Error(m); };
  if (!d || typeof d !== 'object') bad('This file is not a TipidTrack backup.');
  const okd = s => typeof s === 'string' && !isNaN(Date.parse(s)), num = (x, min = 0) => typeof x === 'number' && isFinite(x) && x > min && x < 1e9;
  const arr = (k, f) => { if (!Array.isArray(d[k])) bad(`The backup is missing its "${k}" list.`); return d[k].map((x, i) => f(x || {}) || bad(`Invalid ${k} record #${i + 1}.`)); };
  const o = blank(), tx = s => String(s || '').slice(0, 200);
  o.income = arr('income', x => num(x.amount) && okd(x.date) && { id: String(x.id || uid()), amount: x.amount, date: x.date.slice(0, 10), source: SRC.includes(x.source) ? x.source : 'Other income', note: tx(x.note) });
  o.expenses = arr('expenses', x => num(x.amount) && okd(x.date) && x.name && { id: String(x.id || uid()), name: tx(x.name).slice(0, 60), amount: x.amount, cat: CM[x.cat] ? x.cat : 'Other', date: x.date.slice(0, 16), method: PAY.includes(x.method) ? x.method : 'Other', note: tx(x.note) });
  o.goals = arr('goals', x => num(x.target) && x.name && num(x.start ?? 0, -1) && { id: String(x.id || uid()), name: tx(x.name).slice(0, 60), target: x.target, start: x.start || 0, date: okd(x.date) ? x.date.slice(0, 10) : '', desc: tx(x.desc) });
  o.xfers = arr('xfers', x => typeof x.amount === 'number' && isFinite(x.amount) && x.amount !== 0 && okd(x.date) && o.goals.some(g => g.id === String(x.goal)) && { id: String(x.id || uid()), goal: String(x.goal), amount: x.amount, date: x.date.slice(0, 10), note: tx(x.note) });
  const b = d.budget || {}; o.budget = { period: b.period === 'monthly' ? 'monthly' : 'weekly', total: num(b.total) ? b.total : 0, cats: {} };
  Object.entries(b.cats || {}).forEach(([k, v]) => { if (CM[k] && num(v)) o.budget.cats[k] = v; });
  const s = d.set || {}; o.set = { theme: s.theme === 'light' ? 'light' : 'dark', cur: s.cur === 'USD' ? 'USD' : 'PHP', w1: num(s.w1) && s.w1 < 98 ? s.w1 : 70, w2: num(s.w2) && s.w2 < 100 && s.w2 > (s.w1 || 70) ? s.w2 : 90 };
  o.name = tx(d.name).slice(0, 30) || 'Student'; o.init = true; o.demo = !!d.demo; return o;
}


/* ==========================================================================
   10. EVENTS
   Connects buttons, inputs and filters to the functions above.
   ========================================================================== */

// Build the navigation and static UI pieces
NAV.forEach(([s, t, i]) => $('#nav').insertAdjacentHTML('beforeend', `<button data-s="${s}" aria-label="${t}"><i data-lucide="${i}"></i><span>${t}</span></button>`));
$('#nav').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.s); };
$$('.box').forEach(b => b.insertAdjacentHTML('beforeend', `<div class="es"><i data-lucide="wallet"></i><p>${b.dataset.msg}</p></div>`));
$('#fc').innerHTML = '<option>All</option>' + CATS.map(c => `<option>${c[0]}</option>`).join('');

// Top bar buttons
$('#quick').onclick = () => expenseForm();
$('#bell').onclick = () => go('notifications');
$('#theme').onclick = () => { S.set.theme = S.set.theme === 'dark' ? 'light' : 'dark'; save(); render(); };

// Dashboard period filters
$$('#filters [data-f]').forEach(b => b.onclick = () => { F.p = b.dataset.f; render(); });
$('#fFrom').onchange = e => { F.from = e.target.value; render(); }; $('#fTo').onchange = e => { F.to = e.target.value; render(); };

// Transactions toolbar
$('#q').oninput = e => { T.q = e.target.value.trim().toLowerCase(); render(); };
$('#fc').onchange = e => { T.cat = e.target.value; render(); }; $('#fs').onchange = e => { T.sort = e.target.value; render(); };
$('#ff').onchange = e => { T.from = e.target.value; render(); }; $('#ft').onchange = e => { T.to = e.target.value; render(); };

// Notifications page buttons
$('#nRead').onclick = () => { S.notifs.forEach(n => n.read = true); save(); render(); };
$('#nClear').onclick = () => { S.notifs = []; save(); render(); toast('Notifications cleared'); };

// Settings page (saved as soon as a value changes)
$('#sName').onchange = e => { S.name = e.target.value.trim().slice(0, 30) || 'Student'; save(); render(); };
$('#sTheme').onchange = e => { S.set.theme = e.target.value; save(); render(); };
$('#sCur').onchange = e => { S.set.cur = e.target.value; save(); render(); };
$('#sPer').onchange = e => { S.budget.period = e.target.value; checkAlerts(); save(); render(); };
['w1', 'w2'].forEach(k => $('#' + k).onchange = e => {
  const w1 = k === 'w1' ? +e.target.value : S.set.w1, w2 = k === 'w2' ? +e.target.value : S.set.w2;
  if (!(w1 >= 1 && w1 < w2 && w2 <= 99)) { $('#sErr').textContent = 'Use whole numbers where "approaching" is lower than "almost at the limit", and both are below 100.'; $('#sErr').style.color = 'var(--r)'; return; }
  $('#sErr').style.color = ''; $('#sErr').textContent = 'Thresholds saved.'; S.set.w1 = w1; S.set.w2 = w2; save();
});

// Export, import, demo and reset
$('#xCsv').onclick = exportCsv;
$('#xJson').onclick = () => { dl('tipidtrack-backup.json', JSON.stringify({ ...S, exportedAt: new Date().toISOString() }, null, 2), 'application/json'); toast('Backup exported'); };
$('#xImp').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let n; try { n = clean(JSON.parse(r.result)); } catch (x) { return showModal('Import failed', `<p>${esc(x.message)}</p>`, 'OK', () => { }, false); }
    ask('Replace your data?', `This backup has ${n.expenses.length} expenses, ${n.income.length} allowance records and ${n.goals.length} goals. Importing replaces everything currently in this browser.`, 'Import and replace', () => { S = n; commit('Backup imported'); });
  };
  r.readAsText(f);
};
$('#xDemo').onclick = () => ask('Load demo data?', 'This replaces your current records with fictional sample data.', 'Load demo', () => { loadDemo(); commit('Demo data loaded'); });
$('#xReset').onclick = () => ask('Reset all data?', 'This permanently deletes every allowance, expense, budget, goal and notification in this browser. Export a backup first if you want to keep them.', 'Delete everything', () => {
  S = { ...blank(), set: S.set }; save(); $('#welcome').hidden = false;
});

// Welcome screen buttons
$$('#welcome [data-w]').forEach(b => b.onclick = () => {
  const w = b.dataset.w, nm = $('#wName').value.trim().slice(0, 30) || 'Student';
  if (w === 'demo') { S.name = nm; loadDemo(); S.name = nm; } else S = { ...blank(), set: S.set, name: nm };
  S.init = true; $('#welcome').hidden = true; checkAlerts(); save(); go('overview'); if (w === 'first') incomeForm();
});


/* ==========================================================================
   11. START
   Runs once when the page loads.
   ========================================================================== */
Chart.defaults.font.family = 'Archivo, system-ui, sans-serif';
if (!S.init) $('#welcome').hidden = false;
go(NAV.some(n => n[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'overview');