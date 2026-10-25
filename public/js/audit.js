// Data-quality tools: where each citation's details came from, one-click
// repair of incomplete citations, and checking a paper's in-text citations
// against the bibliography.
import { $, esc, api, openModal } from './ui.js';
import { icon } from './icons.js';
import * as S from './store.js';
import { active } from './store.js';
import { missingInfo } from './types.js';

// Sources backed by an official registry or platform API
const VERIFIED = new Set(['DOI', 'ISBN', 'PubMed', 'PubMed Central', 'arXiv', 'Crossref', 'Google Books', 'book search', 'Wikipedia', 'YouTube', 'Vimeo', 'Zotero translator']);
const SCANNED = new Set(['Webpage', 'PDF']);

export function sourceBadge(item) {
  const s = item._source;
  if (!s) return '';
  if (VERIFIED.has(s)) return `<span class="src-pill ok" title="Details came from ${esc(s)}">${icon('check')} Verified · ${esc(s === 'book search' ? 'book database' : s)}</span>`;
  if (item._checked) return `<span class="src-pill ok" title="You reviewed and saved these details">${icon('check')} Checked by you</span>`;
  if (SCANNED.has(s)) return `<span class="src-pill" title="Read from the page’s own metadata — worth a quick check">${icon('globe')} Scanned from ${s === 'PDF' ? 'PDF' : 'page'}</span>`;
  if (s === 'URL') return `<span class="src-pill warn" title="The page couldn’t be opened, so details were guessed from the link">${icon('link')} Guessed from link</span>`;
  if (s === 'Imported') return `<span class="src-pill">${icon('upload')} Imported</span>`;
  return `<span class="src-pill">${icon('pencil')} Entered manually</span>`;
}

export const needsReview = s => SCANNED.has(s) || s === 'URL';

const isEmpty = v => v == null || v === '' || (Array.isArray(v) && !v.length);

// Re-looks up every incomplete citation by its DOI / ISBN / PMID / URL and
// fills only the fields that are empty — never overwrites what's there.
export async function fixAll(onProgress) {
  const p = active();
  const targets = p.items.filter(i => missingInfo(i).length);
  const queue = targets.filter(i => i.DOI || i.ISBN || i.PMID || i.URL);
  let fixed = 0, done = 0;
  async function worker() {
    while (queue.length) {
      const it = queue.shift();
      const q = it.DOI || it.ISBN || (it.PMID && `PMID:${it.PMID}`) || it.URL;
      try {
        const r = await api(`/api/cite?q=${encodeURIComponent(q)}`);
        if (r.mode === 'item' && r.item) {
          const patch = {};
          for (const [k, v] of Object.entries(r.item)) {
            if (k === 'id' || k.startsWith('_') || k === 'type' || k === 'accessed') continue;
            if (isEmpty(it[k]) && !isEmpty(v)) patch[k] = v;
          }
          if (Object.keys(patch).length) {
            const before = missingInfo(it).length;
            if (VERIFIED.has(r.source)) patch._source = r.source;
            S.updateItem(it.id, patch, p.id);
            if (missingInfo({ ...it, ...patch }).length < before) fixed++;
          }
        }
      } catch {}
      onProgress?.(++done, queue.length + done);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const still = p.items.filter(i => missingInfo(i).length).length;
  return { fixed, still, tried: targets.length };
}

// ---------- paper checker ----------
const STOP = new Set(['et', 'al', 'and', 'see', 'also', 'cf', 'eg', 'ie', 'p', 'pp', 'para', 'chap', 'ch', 'in', 'the', 'of', 'for', 'as', 'cited', 'qtd', 'emphasis', 'added', 'original', 'n', 'd', 'nd', 'figure', 'fig', 'figs', 'table', 'tables', 'chapter', 'section', 'appendix', 'page', 'equation', 'eq', 'step', 'part', 'vol', 'volume', 'line', 'lines', 'note', 'notes', 'box', 'exhibit', 'slide', 'question', 'example', 'item', 'year', 'years', 'age', 'aged', 'n']);

function refKey(item) {
  const names = [];
  for (const role of ['author', 'editor', 'director', 'performer', 'composer']) for (const n of item[role] || []) {
    const v = (n.family || n.literal || '').toLowerCase().trim();
    if (v) names.push(v);
  }
  const year = item.issued?.['date-parts']?.[0]?.[0];
  return { names, year: year ? String(year) : null, title: (item.title || '').toLowerCase() };
}

function parseCitationPart(part) {
  const year = (part.match(/\b(1[5-9]\d\d|20\d\d)[a-z]?\b/) || part.match(/\bn\.\s?d\./i) || [])[0];
  const quoted = (part.match(/[“"']([^“”"']{3,})[”"']/) || [])[1];
  const names = (part.replace(/[“"'][^“”"']*[”"']/g, ' ').match(/\p{Lu}[\p{L}'’-]+/gu) || [])
    .filter(w => !STOP.has(w.toLowerCase().replace(/[.’']/g, '')));
  const hasPage = /\b\d{1,4}(?:[-–]\d{1,4})?\s*$/.test(part.trim());
  return { year: year ? (/n\.?\s?d/i.test(year) ? 'n.d.' : year.replace(/[a-z]$/, '')) : null, names, quoted, hasPage };
}

function matches(c, ref) {
  if (c.year && c.year !== 'n.d.' && ref.year && c.year !== ref.year) return false;
  if (c.year === 'n.d.' && ref.year) return false;
  if (c.quoted && ref.title.startsWith(c.quoted.toLowerCase().replace(/[.,]$/, '').slice(0, 25))) return true;
  return c.names.some(n => { n = n.toLowerCase(); return ref.names.some(r => r === n || r.split(/[\s-]+/).includes(n) || (r.length > 6 && r.startsWith(n))); });
}

export function analyzePaper(text, items, fmt) {
  const refs = items.map(i => ({ item: i, key: refKey(i), cited: 0 }));
  const sample = fmt?.entries?.[0]?.intext?.paren || '';
  const numeric = /^\s*(<[^>]+>)*\s*[[(]?\d+[\])]?\s*(<\/[^>]+>)*\s*$/.test(sample);
  const missing = [];
  let found = 0;

  if (numeric) {
    const order = fmt.entries.map(e => e.id);
    for (const m of text.matchAll(/\[(\d+(?:\s*[-–,]\s*\d+)*)\]/g)) {
      found++;
      for (const chunk of m[1].split(',')) {
        const [a, b] = chunk.split(/[-–]/).map(x => parseInt(x, 10));
        for (let n = a; n <= (b || a); n++) {
          const ref = refs.find(r => r.item.id === order[n - 1]);
          if (ref) ref.cited++; else missing.push(`[${n}]`);
        }
      }
    }
  } else {
    const seen = new Set();
    const check = (raw, c) => {
      if (!c.names.length && !c.quoted) return;
      found++;
      const hit = refs.filter(r => matches(c, r.key));
      if (hit.length) hit.forEach(r => r.cited++);
      else if (!seen.has(raw)) { seen.add(raw); missing.push(raw); }
    };
    // Parenthetical: (Smith, 2020; Lee & Park, 2019, p. 4) or MLA (Smith 23)
    for (const m of text.matchAll(/\(([^()]{2,240})\)/g)) {
      for (const part of m[1].split(';')) {
        const c = parseCitationPart(part);
        if (!c.year && !(c.hasPage && c.names.length) && !c.quoted) continue;
        check(`(${part.trim()})`, c);
      }
    }
    // Narrative: Smith (2020), Smith and Lee (2019), Smith et al. (2018)
    for (const m of text.matchAll(/(\p{Lu}[\p{L}'’-]+(?:\s+(?:and|&)\s+\p{Lu}[\p{L}'’-]+|\s+et al\.)?)\s+\((\d{4})[a-z]?(?:,[^)]*)?\)/gu)) {
      check(`${m[1]} (${m[2]})`, { year: m[2], names: m[1].split(/\s+(?:and|&)\s+|\s+et al\./).map(s => s.trim()).filter(Boolean), quoted: null });
    }
  }
  return { numeric, found, missing, uncited: refs.filter(r => !r.cited).map(r => r.item), cited: refs.filter(r => r.cited).length };
}

export function openPaperCheck(getFmt) {
  const p = active();
  const m = openModal({
    title: 'Check my paper',
    wide: true,
    body: `
      <p style="margin:0 0 12px;color:var(--text-2)">Paste your essay. We’ll make sure every in-text citation has a matching entry in <b>${esc(p.name)}</b>, and flag sources you never cited. Nothing you paste leaves your browser.</p>
      <textarea class="input" id="paper-text" rows="10" placeholder="Paste your paper here…" autofocus></textarea>
      <div id="paper-out" style="margin-top:16px"></div>`,
    foot: '<span class="spacer"></span><button class="btn" data-close-btn>Close</button><button class="btn btn-primary" data-run>' + icon('check') + ' Check citations</button>',
  });
  const out = $('#paper-out', m.el);
  const run = () => {
    const text = $('#paper-text', m.el).value;
    if (!text.trim()) return $('#paper-text', m.el).focus();
    const r = analyzePaper(text, active().items, getFmt());
    const fmtText = it => getFmt()?.byId?.get(it.id)?.html || esc(it.title || 'Untitled');
    const ok = !r.missing.length && !r.uncited.length;
    out.innerHTML = `
      <div class="notice ${ok ? 'ok' : 'warn'}">${icon(ok ? 'check' : 'alert')}<div>
        Found <b>${r.found}</b> in-text citation${r.found === 1 ? '' : 's'}${r.numeric ? ' (numbered style)' : ''}. ${r.cited} of ${active().items.length} sources are cited.
        ${ok ? ' Everything matches — nice work.' : ''}</div></div>
      ${r.found === 0 ? `<div class="notice info">${icon('info')}<div>No citations detected. Make sure they look like <b>(Smith, 2020)</b>, <b>Smith (2020)</b>, <b>(Smith 23)</b> or <b>[1]</b>.</div></div>` : ''}
      ${r.missing.length ? `<div class="form-section"><h3>Cited in your paper, but not in your bibliography (${r.missing.length})</h3>
        ${r.missing.map(x => `<div class="intext-row"><span class="val">${esc(x)}</span></div>`).join('')}</div>` : ''}
      ${r.uncited.length ? `<div class="form-section"><h3>In your bibliography, but never cited (${r.uncited.length})</h3>
        ${r.uncited.map(it => `<div class="intext-row"><span class="val csl" style="font-size:14px">${fmtText(it)}</span></div>`).join('')}</div>` : ''}`;
  };
  $('[data-run]', m.el).onclick = run;
  $('[data-close-btn]', m.el).onclick = () => m.close();
  $('#paper-text', m.el).onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); };
}
