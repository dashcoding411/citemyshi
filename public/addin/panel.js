// The citemyshi panel inside Word and Google Docs. One UI, two "hosts":
//   host-word.js  — Office.js (real Word footnotes + content controls)
//   host-docs.js  — Google Apps Script, via the sidebar bridge
//   host-mock.js  — an in-browser fake document, for testing
// Projects come from a connection code made on the website (read-only).
import { formatDocument } from '../js/formatter.js';
import { firebaseConfig } from '../js/firebase-config.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOTE_STYLES = /^(australian-guide-to-legal|chicago-notes|chicago-shortened|chicago-fullnote|oscola|turabian-notes|mhra-notes|new-harts-rules-notes|bluebook|mcgill|society-of-biblical-literature-fullnote)/;

const state = { host: null, code: '', project: null, isNote: false, q: '', open: null, busy: false };

// HTML from the formatter -> plain text + italic ranges (so editors keep their own fonts)
export function toRuns(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  let text = '';
  const italics = [];
  const walk = (node, italic) => {
    if (node.nodeType === 3) { const t = node.nodeValue; if (italic && t) italics.push([text.length, text.length + t.length]); text += t; return; }
    if (node.nodeType !== 1) return;
    const it = italic || /^(I|EM)$/.test(node.tagName) || /italic/.test(node.getAttribute('style') || '');
    node.childNodes.forEach(c => walk(c, it));
  };
  walk(doc.body.firstChild, false);
  return { text: text.replace(/\s+/g, ' ').trim(), italics };
}

// Same pinpoint rules as the website's planner
function parsePin(text, item) {
  const t = String(text || '').trim().replace(/-/g, '–');
  if (!t) return {};
  if (['legislation', 'bill'].includes(item?.type)) return { locator: /^\d/.test(t) ? `${/[–,]/.test(t) ? 'ss' : 's'} ${t}` : t, label: 'page' };
  if (item?.type === 'legal_case') { const m = t.match(/^para(?:graph)?s?\.?\s*(.+)$/i); return { locator: m ? `[${m[1]}]` : t, label: 'page' }; }
  let m;
  if ((m = t.match(/^para(?:graph)?s?\.?\s*(.+)$/i))) return { locator: m[1], label: 'paragraph' };
  if ((m = t.match(/^(?:ch|chap|chapter)\.?\s*(.+)$/i))) return { locator: m[1], label: 'chapter' };
  if ((m = t.match(/^(?:pp?\.?\s*)(.+)$/i))) return { locator: m[1], label: 'page' };
  return { locator: t, label: 'page' };
}

async function loadProject(code) {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 12) throw new Error('Codes are 12 letters and numbers, like K7Q2-M9XD-PL4W.');
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/links/${clean}?key=${firebaseConfig.apiKey}`);
  if (res.status === 404 || res.status === 403) throw new Error('No project has that code. Check it on citemyshi.web.app (project menu → Use in Word / Google Docs).');
  if (!res.ok) throw new Error('Couldn’t reach citemyshi — check your internet connection.');
  const data = JSON.parse((await res.json()).fields.data.stringValue);
  return { code: clean, project: data };
}

const label = it => {
  const who = it.author?.[0] ? (it.author[0].family || it.author[0].literal) : '';
  const year = it.issued?.['date-parts']?.[0]?.[0];
  return { title: it.title || 'Untitled', meta: [who, year].filter(Boolean).join(' · ') };
};

function status(msg, error) {
  const el = $('#status');
  el.textContent = msg || '';
  el.className = `status ${error ? 'err' : ''}`;
}

function render() {
  const app = $('#app');
  const p = state.project;
  if (!p) {
    app.innerHTML = `
      <div class="connect">
        <h2>Connect a project</h2>
        <p>On <b>citemyshi.web.app</b>, open your project’s menu (⋯) and choose <b>Use in Word / Google Docs</b>. Enter the code here:</p>
        <input id="code" class="input" placeholder="K7Q2-M9XD-PL4W" autocomplete="off" spellcheck="false" value="${esc(state.code)}">
        <button class="btn primary" id="connect">Connect</button>
        <p class="small">This document will remember the project. New sources you add on the website show up here automatically.</p>
      </div>`;
    $('#connect').onclick = connect;
    $('#code').onkeydown = e => { if (e.key === 'Enter') connect(); };
    return;
  }
  const q = state.q.toLowerCase();
  const items = p.items.filter(it => !q || JSON.stringify([it.title, it.author, it['container-title']]).toLowerCase().includes(q));
  app.innerHTML = `
    <div class="proj">
      <div><b>${esc(p.name)}</b><span class="small">${esc(p.styleTitle || p.style)}${state.isNote ? ' · footnotes' : ''}</span></div>
      <button class="link" id="change">Change</button>
    </div>
    <input id="q" class="input" placeholder="Search your sources…" value="${esc(state.q)}">
    <div class="hint small">${state.isNote
      ? (state.host.supportsFootnotes ? 'Click a source to add a footnote at your cursor.' : 'Put your cursor inside a footnote (Insert ▸ Footnote), then click a source.')
      : 'Click a source to add an in-text citation at your cursor.'} Add a page or section if you’re quoting.</div>
    <div class="list">${items.map(it => {
      const l = label(it);
      const open = state.open === it.id;
      return `<div class="src ${open ? 'open' : ''}" data-id="${esc(it.id)}">
        <div class="src-main" data-toggle><div class="t">${esc(l.title)}</div><div class="small">${esc(l.meta)}</div></div>
        ${open ? `<div class="src-insert"><input class="input pin" placeholder="${['legislation', 'bill'].includes(it.type) ? 's 9' : it.type === 'legal_case' ? 'page or [para]' : 'page (optional)'}" aria-label="Pinpoint"><button class="btn primary" data-insert>Insert</button></div>` : ''}
      </div>`;
    }).join('') || '<p class="small" style="padding:10px">No sources match.</p>'}</div>
    <div class="actions">
      <button class="btn" id="update" title="Renumber every citation: Ibid, short forms, numbering">↻ Update citations</button>
      <button class="btn" id="bib">Bibliography</button>
    </div>`;
  $('#change').onclick = () => { state.project = null; render(); };
  $('#q').oninput = e => { state.q = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#q'); i.focus(); i.setSelectionRange(pos, pos); };
  app.querySelectorAll('[data-toggle]').forEach(el => el.onclick = () => {
    const id = el.closest('.src').dataset.id;
    state.open = state.open === id ? null : id;
    render();
    app.querySelector('.src.open .pin')?.focus();
  });
  app.querySelectorAll('[data-insert]').forEach(b => b.onclick = () => insert(b.closest('.src').dataset.id, b.closest('.src').querySelector('.pin').value));
  app.querySelectorAll('.pin').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') insert(i.closest('.src').dataset.id, i.value); });
  $('#update').onclick = () => updateAll(true);
  $('#bib').onclick = bibliography;
}

async function connect() {
  const code = $('#code').value.trim();
  status('Connecting…');
  try {
    const r = await loadProject(code);
    state.code = r.code; state.project = r.project;
    state.isNote = NOTE_STYLES.test(r.project.style);
    await state.host.setStoredCode(r.code);
    status(`Connected to “${r.project.name}”.`);
    render();
  } catch (e) { status(e.message, true); }
}

async function refreshProject() {
  if (!state.code) return; // local test project
  try { const r = await loadProject(state.code); state.project = r.project; state.isNote = NOTE_STYLES.test(r.project.style); } catch {}
}

const busy = async (msg, fn) => {
  if (state.busy) return;
  state.busy = true; status(msg);
  try { await fn(); } catch (e) { status(e.message || String(e), true); } finally { state.busy = false; }
};

function insert(itemId, pinText) {
  return busy('Inserting…', async () => {
    const item = state.project.items.find(i => i.id === itemId);
    const payload = { i: itemId, p: pinText.trim() };
    // Insert a provisional citation, then renumber everything (Ibid etc.)
    const r = await formatDocument({ items: state.project.items, style: state.project.style, lang: state.project.lang, citations: [{ id: 'x', items: [{ id: itemId, ...parsePin(pinText, item) }] }] });
    await state.host.insertCitation({ payload, ...toRuns(r.citations[0].html), isNote: state.isNote });
    state.busy = false;
    await updateAll(false);
    status(state.isNote ? 'Footnote added.' : 'Citation added.');
  });
}

function updateAll(announce) {
  return busy('Updating citations…', async () => {
    await refreshProject();
    const p = state.project;
    let count = 0;
    await state.host.updateCitations(state.isNote, async payloads => {
      count = payloads.length;
      if (!payloads.length) return [];
      const known = new Set(p.items.map(i => i.id));
      const citations = payloads.map((pl, k) => ({ id: `c${k}`, items: known.has(pl.i) ? [{ id: pl.i, ...parsePin(pl.p, p.items.find(i => i.id === pl.i)) }] : [] }));
      const r = await formatDocument({ items: p.items, style: p.style, lang: p.lang, citations });
      const byId = new Map(r.citations.map(c => [c.id, c]));
      return citations.map(c => byId.has(c.id) ? toRuns(byId.get(c.id).html) : { text: '[source removed from project]', italics: [] });
    });
    if (announce) status(count ? `Updated ${count} citation${count === 1 ? '' : 's'}.` : 'No citemyshi citations in this document yet.');
  });
}

function bibliography() {
  return busy('Writing bibliography…', async () => {
    await refreshProject();
    const p = state.project;
    let payloads = [];
    await state.host.updateCitations(state.isNote, async pls => { payloads = pls; return null; }); // read only
    const known = new Set(p.items.map(i => i.id));
    const citations = payloads.filter(pl => known.has(pl.i)).map((pl, k) => ({ id: `c${k}`, items: [{ id: pl.i }] }));
    if (!citations.length) throw new Error('Insert some citations first — the bibliography lists the sources you cite.');
    const r = await formatDocument({ items: p.items, style: p.style, lang: p.lang, citations });
    const aglc = /^australian-guide-to-legal/.test(p.style);
    let entries = r.entries.map(e => ({ ...toRuns(e.html.replace(/<div class="csl-left-margin">([\s\S]*?)<\/div>/, '$1 ')), id: e.id }));
    if (aglc) {
      const part = it => it.type === 'legal_case' ? 'Cases' : ['legislation', 'bill'].includes(it.type) ? 'Legislation' : it.type === 'treaty' ? 'Treaties' : /article|book|chapter|report|thesis|paper-conference|entry/.test(it.type) ? 'Articles/Books/Reports' : 'Other';
      const order = ['Articles/Books/Reports', 'Cases', 'Legislation', 'Treaties', 'Other'];
      const groups = order.map(k => [k, entries.filter(e => part(p.items.find(i => i.id === e.id)) === k)]).filter(([, g]) => g.length);
      entries = groups.flatMap(([k, g], n) => [{ heading: `${String.fromCharCode(65 + n)} ${k}` }, ...g]);
    }
    const heading = /^modern-language/.test(p.style) ? 'Works Cited' : /^(chicago|turabian|australian-guide|oscola|mhra)/.test(p.style) ? 'Bibliography' : /harvard/.test(p.style) ? 'Reference List' : 'References';
    await state.host.writeBibliography({ heading, entries, hanging: !/^(ieee|nlm|american-medical|vancouver)/.test(p.style), boldHeading: !/^modern-language/.test(p.style) });
    status(`Bibliography updated (${r.entries.length} source${r.entries.length === 1 ? '' : 's'}).`);
  });
}

export async function start(host) {
  state.host = host;
  state.code = (await host.getStoredCode().catch(() => '')) || '';
  if (host.localProject && !state.code) {
    state.project = host.localProject; state.isNote = NOTE_STYLES.test(host.localProject.style);
  } else if (state.code) {
    status('Loading your project…');
    try { const r = await loadProject(state.code); state.project = r.project; state.isNote = NOTE_STYLES.test(r.project.style); status(''); }
    catch (e) { status(e.message, true); }
  }
  render();
}
