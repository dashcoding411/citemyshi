// Footnote planner: list your citations in essay order and get every footnote
// right — "Ibid", "(n 3)", short forms — or, for numbered styles, the numbers
// in order of first citation. Works with any editor: copy and paste.
import { $, $$, esc, uid, debounce, openModal, toast, copyRich } from './ui.js';
import { icon } from './icons.js';
import * as S from './store.js';
import { active } from './store.js';
import { formatDocument } from './formatter.js';

const short = it => {
  const who = it.author?.[0] ? (it.author[0].family || it.author[0].literal) : '';
  const year = it.issued?.['date-parts']?.[0]?.[0] || '';
  return [who, year && `(${year})`, it.title].filter(Boolean).join(' ').slice(0, 90) || 'Untitled';
};

// Turn what the student types into a CSL locator: "s 9", "[42]", "para 4", "12–14"
export function parsePin(text, item) {
  let t = String(text || '').trim().replace(/-/g, '–');
  if (!t) return {};
  if (['legislation', 'bill'].includes(item?.type)) return { locator: /^\d/.test(t) ? `${/[–,]/.test(t) ? 'ss' : 's'} ${t}` : t, label: 'page' };
  if (item?.type === 'legal_case') { const pm = t.match(/^para(?:graph)?s?\.?\s*(.+)$/i); return { locator: pm ? `[${pm[1]}]` : t, label: 'page' }; }
  let m;
  if ((m = t.match(/^para(?:graph)?s?\.?\s*(.+)$/i))) return { locator: m[1], label: 'paragraph' };
  if ((m = t.match(/^(?:ch|chap|chapter)\.?\s*(.+)$/i))) return { locator: m[1], label: 'chapter' };
  if ((m = t.match(/^(?:s|sec|section)\.?\s+(.+)$/i))) return { locator: m[1], label: 'section' };
  if ((m = t.match(/^(?:pp?\.?\s*)(.+)$/i))) return { locator: m[1], label: 'page' };
  return { locator: t, label: 'page' };
}

export function openPlanner() {
  const p = active();
  if (!p.items.length) return toast('Add some sources to this project first');
  p.document ||= { citations: [] };
  const doc = p.document;
  const isNoteGuess = /^(australian-guide-to-legal|chicago-notes|chicago-shortened|chicago-fullnote|oscola|turabian-notes|mhra-notes|new-harts-rules-notes|bluebook|mcgill|society-of-biblical-literature-fullnote)/.test(p.style);
  const m = openModal({
    title: isNoteGuess ? 'Footnote planner' : 'Citations in your essay',
    wide: true,
    body: `<p class="planner-intro">${isNoteGuess
      ? 'Add a row for each footnote, in the order they appear in your essay. We’ll write every footnote correctly — the first in full, then <b>Ibid</b> and short forms like <b>(n 3)</b> — so you can copy them straight into Word or Google Docs.'
      : 'Add each citation in the order it appears in your essay. Numbered styles (IEEE, Vancouver…) number sources by first mention, so this gives you the right numbers and the reference list in order.'}</p>
      <div class="planner">
        <div class="planner-rows" id="pl-rows"></div>
        <button class="btn btn-sm" data-pl-add>${icon('plus')} Add ${isNoteGuess ? 'footnote' : 'citation'}</button>
        <div class="planner-out" id="pl-out"></div>
      </div>`,
    foot: `<span style="font-size:12.5px;color:var(--muted)">Saved with the project.</span><span class="spacer"></span><button class="btn" data-pl-clear>Clear all</button><button class="btn btn-primary" data-pl-copy>${icon('copy')} Copy all</button>`,
  });
  let last = null;

  const options = sel => p.items.map(it => `<option value="${it.id}" ${it.id === sel ? 'selected' : ''}>${esc(short(it))}</option>`).join('');
  const placeholder = it => ['legislation', 'bill'].includes(it?.type) ? 'e.g. 9 or ss 18–20' : it?.type === 'legal_case' ? 'e.g. 42 or [42]' : 'page, e.g. 12 · para 4 · ch 3';

  function drawRows() {
    $('#pl-rows', m.el).innerHTML = doc.citations.length ? doc.citations.map((c, i) => {
      const it = p.items.find(x => x.id === c.items[0]?.id);
      return `<div class="pl-row" data-i="${i}">
        <span class="pl-n">${i + 1}</span>
        <select class="select" data-pl-src="${i}">${it ? '' : '<option value="">Choose a source…</option>'}${options(c.items[0]?.id)}</select>
        <input class="input" data-pl-pin="${i}" value="${esc(c.items[0]?.pin || '')}" placeholder="${placeholder(it)}" aria-label="Pinpoint">
        <span class="pl-tools">
          <button class="icon-btn" data-pl-up="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
          <button class="icon-btn" data-pl-down="${i}" title="Move down" ${i === doc.citations.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
          <button class="icon-btn" data-pl-del="${i}" title="Remove">${icon('x')}</button>
        </span>
      </div>`;
    }).join('') : `<div class="results-empty" style="padding:14px">No ${isNoteGuess ? 'footnotes' : 'citations'} yet — click “Add”.</div>`;
  }

  const run = debounce(async () => {
    const out = $('#pl-out', m.el);
    const citations = doc.citations.filter(c => c.items[0]?.id).map(c => {
      const it = p.items.find(x => x.id === c.items[0].id);
      return { id: c.id, items: [{ id: c.items[0].id, ...parsePin(c.items[0].pin, it) }] };
    });
    if (!citations.length) { out.innerHTML = ''; last = null; return; }
    try {
      last = await formatDocument({ items: p.items, style: p.style, lang: p.lang, citations });
      const isNote = last.style.isNote;
      out.innerHTML = `<div class="menu-label" style="padding:14px 0 6px">${isNote ? 'Your footnotes' : 'In-text citations'} · ${esc(last.style.title)}</div>
        ${last.citations.map((c, i) => `<div class="pl-result"><span class="pl-n">${isNote ? c.note : i + 1}</span><span class="csl" style="font-size:14.5px">${c.html}</span><button class="icon-btn" data-pl-copy1="${i}" title="Copy">${icon('copy')}</button></div>`).join('')}
        ${!isNote && last.entries.length && /^\[|^\d/.test(last.entries[0].text) ? `<div class="menu-label" style="padding:14px 0 6px">Reference list in citation order</div>${last.entries.map(e => `<div class="pl-result"><span class="csl" style="font-size:14px">${e.html}</span></div>`).join('')}` : ''}`;
      $$('[data-pl-copy1]', out).forEach(b => b.onclick = async () => {
        const c = last.citations[+b.dataset.plCopy1];
        await copyRich(c.html, c.text);
        toast(isNote ? `Copied footnote ${c.note}` : 'Copied');
      });
    } catch (e) { out.innerHTML = `<div class="notice warn">${esc(e.message)}</div>`; }
  }, 250);

  const save = () => { p.updatedAt = Date.now(); S.emit({}); };
  const changed = () => { save(); run(); };

  m.el.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if ('plAdd' in d) {
      const lastId = doc.citations.at(-1)?.items[0]?.id;
      doc.citations.push({ id: uid(), items: [{ id: lastId || p.items[0].id, pin: '' }] });
      drawRows(); changed();
      $$('[data-pl-pin]', m.el).at(-1)?.focus();
    }
    if (d.plUp) { const i = +d.plUp; [doc.citations[i - 1], doc.citations[i]] = [doc.citations[i], doc.citations[i - 1]]; drawRows(); changed(); }
    if (d.plDown) { const i = +d.plDown; [doc.citations[i + 1], doc.citations[i]] = [doc.citations[i], doc.citations[i + 1]]; drawRows(); changed(); }
    if (d.plDel) { doc.citations.splice(+d.plDel, 1); drawRows(); changed(); }
    if ('plClear' in d && doc.citations.length && confirm('Remove all rows?')) { doc.citations = []; drawRows(); changed(); }
    if ('plCopy' in d && last) {
      const isNote = last.style.isNote;
      const html = last.citations.map(c => `<p>${isNote ? `${c.note}. ` : ''}${c.html}</p>`).join('');
      const text = last.citations.map(c => `${isNote ? `${c.note}. ` : ''}${c.text}`).join('\n');
      copyRich(html, text).then(() => toast(`Copied ${last.citations.length} ${isNote ? 'footnotes' : 'citations'}`));
    }
  });
  m.el.addEventListener('change', e => {
    if (e.target.dataset.plSrc) { doc.citations[+e.target.dataset.plSrc].items[0].id = e.target.value; drawRows(); changed(); }
  });
  m.el.addEventListener('input', e => {
    if (e.target.dataset.plPin) { doc.citations[+e.target.dataset.plPin].items[0].pin = e.target.value; changed(); }
  });
  m.el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.plPin) { e.preventDefault(); $('[data-pl-add]', m.el).click(); }
  });

  drawRows();
  run();
}
