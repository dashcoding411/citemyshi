import { icon } from './icons.js';
import { API_BASE } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let wakeNotice = null;

// All server calls go through here. Retries briefly when the server is waking
// up or the network blips, and tells the user if it's taking a while.
export async function api(path, { method, body, raw, retries = 2 } = {}) {
  const slow = setTimeout(() => {
    if (API_BASE && !wakeNotice) wakeNotice = toast('Starting up. This can take up to 30 seconds…', { duration: 60000 });
  }, 4000);
  try {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(API_BASE + path, {
          method: method || (body ? 'POST' : 'GET'),
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        if (attempt < retries) { await sleep(1500 * (attempt + 1)); continue; }
        throw new Error('Can’t connect. Check your internet.');
      }
      if ([502, 503, 504].includes(res.status) && attempt < retries) { await sleep(2500 * (attempt + 1)); continue; }
      if (raw) { if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`); return res; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (res.status >= 500 ? 'Something went wrong. Try again.' : `Error ${res.status}`));
      return data;
    }
  } finally {
    clearTimeout(slow);
    if (wakeNotice) { wakeNotice(); wakeNotice = null; }
  }
}

// Start waking the server as soon as the page opens, before anyone types.
export const warmUp = () => fetch(`${API_BASE}/healthz`, { cache: 'no-store' }).catch(() => {});

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- toasts ----------
export function toast(msg, { action, error, duration = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  $('#toasts').appendChild(el);
  const close = () => { el.style.transition = 'opacity .2s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 200); };
  if (action) el.querySelector('button').onclick = () => { action.fn(); close(); };
  setTimeout(close, duration);
  return close;
}

// ---------- dropdown menus ----------
let openMenuEl = null;
export function closeMenu() { openMenuEl?.remove(); openMenuEl = null; }

// items: [{ label, icon, onClick, danger, hint, checked } | { sep: true } | { label, heading: true } | { html, onMount }]
export function openMenu(anchor, items, { align = 'left' } = {}) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  items.filter(Boolean).forEach(it => {
    if (it.sep) { m.insertAdjacentHTML('beforeend', '<div class="menu-sep"></div>'); return; }
    if (it.heading) { m.insertAdjacentHTML('beforeend', `<div class="menu-label">${esc(it.label)}</div>`); return; }
    if (it.html) { const w = document.createElement('div'); w.innerHTML = it.html; m.appendChild(w); it.onMount?.(w, closeMenu); return; }
    const b = document.createElement('button');
    b.className = `menu-item${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}`;
    b.setAttribute('role', 'menuitem');
    b.innerHTML = `${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>${it.hint ? `<span class="hint">${esc(it.hint)}</span>` : ''}`;
    b.onclick = e => { e.stopPropagation(); closeMenu(); it.onClick?.(); };
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let left = align === 'right' ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  m.style.left = `${left}px`; m.style.top = `${top}px`;
  openMenuEl = m;
  m.querySelector('.menu-item')?.focus({ preventScroll: true });
  m.addEventListener('keydown', e => {
    const btns = $$('.menu-item', m);
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
  });
  return m;
}
document.addEventListener('mousedown', e => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); });
window.addEventListener('resize', closeMenu);
document.addEventListener('scroll', e => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }, true);

// ---------- modals ----------
const modalStack = [];
export function openModal({ title, body, foot, wide, onClose, className = '' }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body"></div>
    ${foot !== false ? '<div class="modal-foot"></div>' : ''}
  </div>`;
  const modal = ov.firstElementChild;
  const bodyEl = $('.modal-body', modal);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (foot) { const f = $('.modal-foot', modal); if (typeof foot === 'string') f.innerHTML = foot; else f.appendChild(foot); }
  const prevFocus = document.activeElement;
  const api = {
    el: modal, body: bodyEl, foot: $('.modal-foot', modal),
    close(reason) {
      if (api.beforeClose && reason !== 'force' && api.beforeClose() === false) return;
      ov.remove();
      modalStack.splice(modalStack.indexOf(api), 1);
      onClose?.();
      prevFocus?.focus?.({ preventScroll: true });
    },
    setTitle(t) { $('.modal-head h2', modal).textContent = t; },
  };
  ov.addEventListener('mousedown', e => { if (e.target === ov) api.close(); });
  $('[data-close]', modal).onclick = () => api.close();
  document.body.appendChild(ov);
  modalStack.push(api);
  setTimeout(() => (modal.querySelector('[autofocus]') || modal.querySelector('input,select,textarea,button:not([data-close])'))?.focus(), 30);
  return api;
}
export const topModal = () => modalStack[modalStack.length - 1];

export function confirmDialog({ title, message, confirm = 'Confirm', danger }) {
  return new Promise(resolve => {
    let ok = false;
    const m = openModal({
      title, body: `<p style="margin:0;color:var(--text-2)">${message}</p>`,
      foot: `<span class="spacer"></span><button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>`,
      onClose: () => resolve(ok),
    });
    $('[data-no]', m.el).onclick = () => m.close();
    $('[data-yes]', m.el).onclick = () => { ok = true; m.close(); };
    setTimeout(() => $('[data-yes]', m.el).focus(), 40);
  });
}

export function promptDialog({ title, label, value = '', confirm = 'Save', placeholder = '' }) {
  return new Promise(resolve => {
    let result = null;
    const m = openModal({
      title, body: `<div class="field"><label>${esc(label)}</label><input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus></div>`,
      foot: `<span class="spacer"></span><button class="btn" data-no>Cancel</button><button class="btn btn-primary" data-yes>${esc(confirm)}</button>`,
      onClose: () => resolve(result),
    });
    const input = $('input', m.el);
    setTimeout(() => { input.focus(); input.select(); }, 40);
    const done = () => { result = input.value.trim(); m.close(); };
    input.onkeydown = e => { if (e.key === 'Enter') done(); };
    $('[data-no]', m.el).onclick = () => m.close();
    $('[data-yes]', m.el).onclick = done;
  });
}

// ---------- clipboard ----------
export async function copyRich(html, text) {
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
      return true;
    }
  } catch {}
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  // Last resort
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy'); ta.remove();
  return ok;
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Stable pastel colors for tags/folders
const TAG_COLORS = [
  ['#e8f0ff', '#2350c9'], ['#e9f8ee', '#16733a'], ['#fff1e6', '#b2560d'], ['#fbeaf5', '#a3277a'],
  ['#efeaff', '#5b3fc4'], ['#e6f7f8', '#0d7180'], ['#fff8db', '#8a6a00'], ['#ffecec', '#b42828'],
];
const TAG_COLORS_DARK = [
  ['#1d2a4a', '#9db8ff'], ['#163020', '#7fdca3'], ['#352416', '#f4a868'], ['#35192c', '#f19bd2'],
  ['#261f45', '#b9a6ff'], ['#122e31', '#79d3de'], ['#332c10', '#ebcd5c'], ['#3a1a1a', '#ff9d9d'],
];
export function tagColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const [bg, fg] = (dark ? TAG_COLORS_DARK : TAG_COLORS)[h % TAG_COLORS.length];
  return `--chip-bg:${bg};--chip-fg:${fg}`;
}
export const FOLDER_COLORS = ['#3b5bfd', '#7b5cff', '#e0559b', '#ef6b2f', '#e3a600', '#1fa365', '#0ea5b7', '#64748b'];
