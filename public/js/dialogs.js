import { $, $$, esc, api, debounce, openModal, toast, copyRich } from './ui.js';
import { icon } from './icons.js';
import { state, active, updateProject, addItems, save } from './store.js';
import { formatSample, formatInText, styleInfo } from './formatter.js';

import { DEGREES } from './degrees.js';

const SAMPLE = { id: 'sample', type: 'article-journal', title: 'The psychology of procrastination', author: [{ given: 'Jordan', family: 'Rivera' }, { given: 'Sam', family: 'Okafor' }], 'container-title': 'Journal of Student Life', volume: '12', issue: '3', page: '45-67', issued: { 'date-parts': [[2023, 4, 2]] }, DOI: '10.1234/jsl.2023.045' };

let languagesCache = null;
const loadLanguages = () => (languagesCache ||= fetch('/locales/locales.json').then(r => r.json())
  .then(m => Object.entries(m['language-names']).map(([code, [native, english]]) => ({ code, native, english })).sort((a, b) => a.english.localeCompare(b.english)))
  .catch(() => [{ code: 'en-US', english: 'English (US)', native: 'English (US)' }]));

const TABS = [{ id: 'popular', label: 'Popular', icon: 'sparkles' }, ...DEGREES, { id: 'uni', label: 'Universities', icon: 'building' }];

export function openStylePicker() {
  const p = active();
  let tab = TABS.some(t => t.id === state.styleTab) ? state.styleTab : 'popular';
  let flat = [];
  let kb = -1;
  let seq = 0;
  const m = openModal({
    title: 'Citation style',
    wide: true,
    body: `
      <div class="style-search">${icon('search')}<input class="input" id="style-q" placeholder="Search all 10,869 styles — APA, AGLC, your uni, a journal…" autocomplete="off" autofocus></div>
      <div class="deg-tabs" role="tablist">${TABS.map(t => `<button class="deg-tab" role="tab" data-tab="${t.id}">${icon(t.icon)} ${esc(t.label)}</button>`).join('')}</div>
      <div class="style-list" id="style-list"></div>
      <div class="style-sample" id="style-sample" hidden></div>`,
    foot: `<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2)">${icon('languages')} Language
      <select class="select" id="style-lang" style="width:auto;max-width:240px;padding-top:6px;padding-bottom:6px"><option value="${esc(p.lang || '')}">${p.lang ? esc(p.lang) : 'Style’s own language (recommended)'}</option></select></label>
      <span class="spacer"></span><button class="btn" data-close-btn>Done</button>`,
  });
  const q = $('#style-q', m.el);
  const list = $('#style-list', m.el);
  const sample = $('#style-sample', m.el);
  const langSel = $('#style-lang', m.el);

  loadLanguages().then(langs => {
    langSel.innerHTML = `<option value="" ${!p.lang ? 'selected' : ''}>Style’s own language (recommended)</option>` +
      langs.map(l => `<option value="${esc(l.code)}" ${l.code === p.lang ? 'selected' : ''}>${esc(l.english)}${l.native !== l.english ? ` — ${esc(l.native)}` : ''}</option>`).join('');
  });

  const row = (s, extra = '') => `
    <button class="style-opt ${s.name === p.style ? 'current' : ''}" data-name="${esc(s.name)}" data-title="${esc(s.title)}">
      <span class="t">${esc(s.title)}${s.full && s.full !== s.title ? `<small>${esc(s.full)}</small>` : ''}</span>
      ${extra}${s.format ? `<span class="fmt">${esc(s.format)}</span>` : ''}
      ${s.name === p.style ? icon('check') : ''}
    </button>`;

  async function load() {
    const my = ++seq;
    const query = q.value.trim();
    $$('.deg-tab', m.el).forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    list.innerHTML = '<div class="skel"><div style="width:70%"></div><div style="width:50%"></div><div style="width:60%"></div></div>';
    try {
      let html = '';
      const deg = DEGREES.find(d => d.id === tab);
      if (tab === 'popular') {
        const results = await api(`/api/styles?q=${encodeURIComponent(query)}&limit=60`);
        if (my !== seq) return;
        const list2 = Array.isArray(results) ? results : results.results;
        if (!query && state.recentStyles?.length) {
          const recent = state.recentStyles.slice(0, 4).map(n => ({ name: n, title: n === p.style ? p.styleTitle : (list2.find(r => r.name === n)?.title || prettyName(n)) }));
          html += `<div class="menu-label">Recently used</div>${recent.map(s => row(s)).join('')}<div class="menu-label">Popular styles</div>`;
          html += list2.filter(r => !state.recentStyles.slice(0, 4).includes(r.name)).map(s => row(s)).join('');
        } else html += list2.map(s => row(s)).join('');
        if (!list2.length) html = noMatch(query);
      } else if (deg) {
        const more = await api(`/api/styles?degree=${deg.id}&q=${encodeURIComponent(query)}&limit=${query ? 100 : 300}`);
        if (my !== seq) return;
        const curated = deg.styles.filter(([n, t]) => !query || `${t} ${n}`.toLowerCase().includes(query.toLowerCase()));
        if (curated.length) html += `<div class="menu-label">Most used in ${esc(deg.label)}</div>${curated.map(([n, t, region]) => row({ name: n, title: t }, region ? `<span class="badge">${esc(region)}</span>` : '')).join('')}`;
        const rest = more.results.filter(r => !deg.styles.some(([n]) => n === r.name));
        if (rest.length) html += `<div class="menu-label">${query ? `Other matches (${more.total})` : `Every ${esc(deg.label)} style (${more.total})`}</div>${rest.map(s => row(s)).join('')}`;
        if (!query && more.total > 300) html += `<div class="results-empty" style="padding:12px">Showing the first 300 — type above to search all ${more.total}.</div>`;
        if (!html) html = noMatch(query);
      } else if (tab === 'uni') {
        const r = await api(`/api/styles?uni=1&q=${encodeURIComponent(query)}&limit=400`);
        if (my !== seq) return;
        html = r.results.length ? `<div class="menu-label">University &amp; institution house styles (${r.total})</div>${r.results.map(s => row(s)).join('')}` : noMatch(query, true);
      }
      list.innerHTML = html;
      flat = $$('.style-opt', list);
      kb = -1;
      flat.forEach((b, i) => {
        b.onclick = () => choose({ name: b.dataset.name, title: b.dataset.title });
        b.onmouseenter = () => showSample({ name: b.dataset.name, title: b.dataset.title });
      });
    } catch (e) { if (my === seq) list.innerHTML = `<div class="results-empty">${esc(e.message)}</div>`; }
  }

  function noMatch(query, uni) {
    return `<div class="results-empty">No styles match “${esc(query)}”${uni ? ' — try the city or a shorter name' : ''}.<br>
      <button class="btn btn-sm" style="margin-top:10px" data-search-all>Search all 10,869 styles</button></div>`;
  }

  const showSample = debounce(async s => {
    try {
      const r = await formatSample({ items: [SAMPLE], style: s.name, lang: langSel.value });
      sample.hidden = false;
      sample.innerHTML = `<div class="menu-label" style="padding:0 0 6px">Example · ${esc(s.title)}</div><div class="csl ${r.params.hangingIndent ? 'hanging' : ''}">${r.entries[0]?.html || ''}</div><div style="margin-top:6px;color:var(--muted);font-size:12.5px">${r.style.isNote ? 'Footnote' : 'In-text'}: ${r.entries[0]?.intext?.paren || ''}</div>`;
    } catch {}
  }, 180);

  async function choose(s) {
    list.style.opacity = '.6';
    try {
      const info = await styleInfo(s.name);
      const title = s.title && !/^[a-z0-9-]+$/.test(s.title) ? s.title : info.title;
      updateProject(p.id, { style: s.name, styleTitle: title });
      state.recentStyles = [s.name, ...(state.recentStyles || []).filter(n => n !== s.name)].slice(0, 8);
      state.styleTab = tab;
      save();
      m.close();
      toast(`Style changed to ${title}`);
    } catch (e) { toast(e.message, { error: true }); list.style.opacity = '1'; }
  }

  m.el.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; load(); q.focus(); return; }
    if (e.target.closest('[data-search-all]')) { tab = 'popular'; load(); }
  });
  q.oninput = debounce(load, 160);
  q.onkeydown = e => {
    if (!flat.length) return;
    const move = d => { kb = Math.max(0, Math.min(flat.length - 1, kb + d)); flat.forEach((b, i) => b.classList.toggle('kb', i === kb)); flat[kb].scrollIntoView({ block: 'nearest' }); showSample({ name: flat[kb].dataset.name, title: flat[kb].dataset.title }); };
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    if (e.key === 'Enter') { e.preventDefault(); const b = flat[Math.max(0, kb)]; choose({ name: b.dataset.name, title: b.dataset.title }); }
  };
  langSel.onchange = e => { updateProject(p.id, { lang: e.target.value }); toast(`Citation language: ${e.target.selectedOptions[0].textContent.split(' — ')[0]}`); showSample({ name: p.style, title: p.styleTitle }); };
  $('[data-close-btn]', m.el).onclick = () => m.close();
  load();
  showSample({ name: p.style, title: p.styleTitle });
  setTimeout(() => $('.deg-tab.active', m.el)?.scrollIntoView({ inline: 'center', block: 'nearest' }), 50);
}

const prettyName = n => n.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

const LOCATOR_LABELS = [['page', 'Page'], ['chapter', 'Chapter'], ['paragraph', 'Paragraph'], ['section', 'Section'], ['line', 'Line'], ['figure', 'Figure'], ['volume', 'Volume'], ['verse', 'Verse'], ['timestamp', 'Time']];

export function openInText(item) {
  const p = active();
  let last = {};
  const m = openModal({
    title: 'In-text citation',
    body: `
      <div class="grid" style="grid-template-columns:140px 1fr;margin-bottom:16px">
        <div class="field"><label>Cite a specific</label><select class="select" id="loc-label">${LOCATOR_LABELS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Number (optional)</label><input class="input" id="loc" placeholder="e.g. 42 or 42-45" autofocus></div>
      </div>
      <div id="intext-out"><div class="skel"><div style="width:40%"></div></div></div>
      <p style="color:var(--muted);font-size:12.5px;margin:12px 0 0">Tip: in-text citations go in your writing right after the quote or paraphrase.</p>`,
    foot: '<span class="spacer"></span><button class="btn" data-done>Done</button>',
  });
  const out = $('#intext-out', m.el);
  const run = debounce(async () => {
    try {
      const timestamp = $('#loc-label', m.el).value === 'timestamp';
      const r = await formatInText({ item, style: p.style, lang: p.lang, locator: $('#loc', m.el).value.trim(), label: timestamp ? 'page' : $('#loc-label', m.el).value });
      if (timestamp && $('#loc', m.el).value.trim()) {
        // CSL has no timestamp label, so cite it as a page and drop the "p."
        r.paren = r.paren.replace(/\bpp?\.\s*/, '');
        r.narrative = r.narrative.replace(/\bpp?\.\s*/, '');
      }
      last = r;
      out.innerHTML = [
        [r.isNote ? 'Footnote' : 'Parenthetical', r.paren],
        r.narrative && ['Narrative', r.narrative],
      ].filter(Boolean).map(([l, v], i) => `<div class="intext-row"><span class="lbl">${l}</span><span class="val">${v}</span><button class="btn btn-sm" data-copy="${i}">${icon('copy')} Copy</button></div>`).join('');
      $$('[data-copy]', out).forEach(b => b.onclick = async () => {
        const v = [last.paren, last.narrative][+b.dataset.copy];
        const tmp = document.createElement('div'); tmp.innerHTML = v;
        await copyRich(v, tmp.textContent);
        b.innerHTML = `${icon('check')} Copied`;
        setTimeout(() => { b.innerHTML = `${icon('copy')} Copy`; }, 1400);
      });
    } catch (e) { out.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; }
  }, 200);
  $('#loc', m.el).oninput = run;
  $('#loc-label', m.el).onchange = run;
  $('[data-done]', m.el).onclick = () => m.close();
  run();
}

export function openImport() {
  const m = openModal({
    title: 'Import citations',
    body: `
      <p style="margin:0 0 12px;color:var(--text-2)">Paste or upload citations exported from Zotero, Mendeley, EndNote, Google Scholar, MyBib, etc. Supports <b>BibTeX</b>, <b>RIS</b>, and <b>CSL-JSON</b>. You can also paste a list of DOIs.</p>
      <textarea class="input" id="imp-text" rows="10" placeholder="@article{smith2020, …}" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px"></textarea>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><label class="btn btn-sm">${icon('upload')} Choose file<input type="file" id="imp-file" accept=".bib,.ris,.json,.txt,.nbib,.enw" hidden></label><span id="imp-name" style="color:var(--muted);font-size:12.5px"></span></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-go>${icon('download')} Import</button>`,
  });
  $('#imp-file', m.el).onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    $('#imp-text', m.el).value = await f.text();
    $('#imp-name', m.el).textContent = f.name;
  };
  $('[data-cancel]', m.el).onclick = () => m.close();
  $('[data-go]', m.el).onclick = async () => {
    const btn = $('[data-go]', m.el);
    const text = $('#imp-text', m.el).value.trim();
    if (!text) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Importing…';
    try {
      let items;
      const dois = text.split(/\s+/).filter(Boolean);
      if (dois.every(d => /^(https?:\/\/(dx\.)?doi\.org\/|doi:)?10\.\d{4,9}\//i.test(d))) {
        items = (await Promise.allSettled(dois.map(d => api(`/api/cite?q=${encodeURIComponent(d)}`)))).filter(r => r.status === 'fulfilled').map(r => r.value.item);
      } else {
        try {
          const json = JSON.parse(text);
          if (json.app === 'citemyshi') throw new Error('That’s a full citemyshi backup — use “Restore backup” in the sidebar menu instead.');
        } catch (e) { if (e.message.startsWith('That’s')) throw e; }
        items = (await api('/api/import', { body: { text } })).items;
      }
      if (!items.length) throw new Error('No citations found in that text');
      addItems(items.map(({ id, 'citation-key': ck, ...rest }) => ({ _source: 'Imported', ...rest })));
      m.close();
      toast(`Imported ${items.length} citation${items.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast(e.message, { error: true });
      btn.disabled = false; btn.innerHTML = `${icon('download')} Import`;
    }
  };
}

export function pickProject({ title, exclude, onPick, copyOption = true }) {
  let copy = false;
  const projects = state.projects.filter(p => p.id !== exclude);
  const byFolder = id => projects.filter(p => p.folderId === id);
  const row = p => `<button class="style-opt" data-pid="${p.id}"><span style="color:var(--muted)">${icon('file')}</span><span class="t">${esc(p.name)}</span><span class="fmt">${p.items.length}</span></button>`;
  const html = `
    ${state.folders.map(f => byFolder(f.id).length ? `<div class="menu-label">${esc(f.name)}</div>${byFolder(f.id).map(row).join('')}` : '').join('')}
    ${byFolder(null).length ? `${state.folders.length ? '<div class="menu-label">Not in a folder</div>' : ''}${byFolder(null).map(row).join('')}` : ''}
    <button class="style-opt" data-new style="color:var(--brand);font-weight:600">${icon('plus')}<span class="t">New project…</span></button>`;
  const m = openModal({
    title,
    body: `<div class="style-list" style="margin:0">${html}</div>`,
    foot: copyOption ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="pp-copy"> Keep a copy here too</label><span class="spacer"></span><button class="btn" data-cancel>Cancel</button>` : '<span class="spacer"></span><button class="btn" data-cancel>Cancel</button>',
  });
  $('#pp-copy', m.el)?.addEventListener('change', e => { copy = e.target.checked; });
  $$('[data-pid]', m.el).forEach(b => b.onclick = () => { m.close(); onPick(b.dataset.pid, { copy }); });
  $('[data-new]', m.el).onclick = () => { m.close(); onPick(null, { copy }); };
  $('[data-cancel]', m.el).onclick = () => m.close();
}
