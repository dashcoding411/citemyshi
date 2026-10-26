import { $, $$, esc, api, debounce, openModal, toast, confirmDialog, tagColor } from './ui.js';
import { icon } from './icons.js';
import { SOURCE_TYPES, FIELD_DEFS, ROLES, ROLE_KEYS, sourceTypeFor, missingInfo } from './types.js';
import { state, active, project, addItems, replaceItem, removeItems, findDuplicate, allTags } from './store.js';
import { formatBibliography } from './formatter.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function flattenContributors(item) {
  const out = [];
  for (const role of ROLE_KEYS) for (const n of item[role] || []) {
    out.push({ role, org: !!n.literal, literal: n.literal || '', given: n.given || '', family: [n['non-dropping-particle'], n.family].filter(Boolean).join(' '), suffix: n.suffix || '' });
  }
  return out;
}

function groupContributors(list) {
  const out = {};
  for (const c of list) {
    let n;
    if (c.org) { if (!c.literal.trim()) continue; n = { literal: c.literal.trim() }; }
    else {
      if (!c.given.trim() && !c.family.trim()) continue;
      n = { given: c.given.trim(), family: c.family.trim() };
      const part = n.family.match(/^((?:van|von|de|der|den|di|da|du|la|le|del|della|dos|das|ten|ter)(?:\s+(?:van|von|de|der|den|di|da|du|la|le))*)\s+(.+)$/);
      if (part) { n['non-dropping-particle'] = part[1]; n.family = part[2]; }
      if (c.suffix) n.suffix = c.suffix;
      if (!n.given) delete n.given;
    }
    (out[c.role] ||= []).push(n);
  }
  return out;
}

const todayParts = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };

export function openEditor({ item = {}, isNew = false, source, warnings = [], projectId = state.activeId, onSaved } = {}) {
  const w = JSON.parse(JSON.stringify(item));
  if (!w.type) w.type = 'webpage';
  if (isNew && !w._source) w._source = source || 'Manual';
  if (isNew && !w.accessed && (w.URL || ['webpage', 'post-weblog', 'post'].includes(w.type))) w.accessed = { 'date-parts': [todayParts()] };
  let contributors = flattenContributors(w);
  if (!contributors.length) contributors.push({ role: 'author', org: false, given: '', family: '', literal: '', suffix: '' });
  let showMore = false;
  let dirty = false;
  const p = project(projectId) || active();

  const m = openModal({ title: isNew ? 'Add citation' : 'Edit citation', wide: true, body: '<div></div>', foot: '<div></div>' });
  m.beforeClose = () => {
    if (!dirty) return true;
    confirmDialog({ title: 'Discard changes?', message: 'You have unsaved changes to this citation.', confirm: 'Discard', danger: true }).then(ok => { if (ok) m.close('force'); });
    return false;
  };

  function render() {
    const t = sourceTypeFor(w);
    const missing = new Set(missingInfo({ ...w, ...groupContributors(contributors) }));
    const label = f => t.labels?.[f] || (f === 'container-title' && t.container) || FIELD_DEFS[f]?.label || f;
    const isMissing = f => missing.has(label(f));
    const shownFields = [...t.fields];
    const extraWithValues = Object.keys(FIELD_DEFS).filter(f => !shownFields.includes(f) && !t.extra.includes(f) && w[f] != null && w[f] !== '');
    const extras = [...t.extra, ...extraWithValues];

    m.body.innerHTML = `
      ${source ? `<div class="notice ${warnings.length ? 'warn' : 'ok'}">${icon(warnings.length ? 'alert' : 'sparkles')}<div>${warnings.length ? warnings.map(esc).join('<br>') : `We found this ${source === 'URL' ? 'from the link' : `using <b>${esc(source)}</b>`}. Give it a quick check below.`}</div></div>` : ''}
      <div class="preview-box">
        <div class="lbl"><span>Preview · ${esc(p.styleTitle || p.style)}</span><span class="pv-status"></span></div>
        <div class="csl pv-html ${state.serif ? 'serif' : ''}"><span style="color:var(--muted)">Generating…</span></div>
        <div class="intext pv-intext"></div>
      </div>
      ${missing.size ? `<div class="notice warn">${icon('alert')}<div>This citation might be missing: <b>${[...missing].map(esc).join(', ')}</b>. Add it if you can find it.</div></div>` : ''}
      <div class="type-select-row">
        <label for="ed-type" style="font-weight:600;font-size:13px;white-space:nowrap">Source type</label>
        <select class="select" id="ed-type">${SOURCE_TYPES.map(s => `<option value="${s.id}" ${s.id === t.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      </div>

      <div class="form-section">
        <h3><span>Contributors ${missing.has('Author') ? '<span class="req" style="color:var(--warn);text-transform:none;letter-spacing:0">· missing</span>' : ''}</span></h3>
        <div class="contribs">${contributors.map((c, i) => contribRow(c, i)).join('')}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" data-add-person>${icon('user')} Add person</button>
          <button class="btn btn-sm" data-add-org>${icon('building')} Add organization</button>
        </div>
      </div>

      <div class="form-section">
        <h3>Details</h3>
        <div class="grid">${shownFields.map(f => fieldHtml(f, label(f), isMissing(f))).join('')}</div>
      </div>

      <div class="form-section">
        <button class="more-toggle" data-more>${icon(showMore ? 'chevronDown' : 'chevronRight')} ${showMore ? 'Fewer fields' : `More fields (${extras.length})`}</button>
        ${showMore ? `<div class="grid" style="margin-top:12px">${extras.map(f => fieldHtml(f, label(f), false)).join('')}</div>` : ''}
      </div>

      <div class="form-section">
        <h3>Notes &amp; tags</h3>
        <div class="field wide" style="margin-bottom:12px"><label for="ed-note">${icon('note')} Note <span style="font-weight:400;color:var(--muted)">— private, or shown as the annotation in annotated-bibliography styles</span></label>
          <textarea class="input" id="ed-note" rows="3" placeholder="Why this source matters, key quotes, page numbers…">${esc(w._note || '')}</textarea></div>
        <div class="field wide"><label>${icon('tag')} Tags</label>
          <div class="tag-input" id="ed-tags">${(w._tags || []).map(tg => `<span class="chip" style="${tagColor(tg)}">${esc(tg)}<span class="x" data-rm-tag="${esc(tg)}" role="button" aria-label="Remove tag">${icon('x')}</span></span>`).join('')}<input placeholder="Add a tag and press Enter" list="ed-tag-list"></div>
          <datalist id="ed-tag-list">${allTags(p).map(([tg]) => `<option value="${esc(tg)}">`).join('')}</datalist>
        </div>
      </div>`;

    m.foot.innerHTML = `
      ${!isNew ? `<button class="btn btn-danger" data-delete>${icon('trash')} Delete</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" data-cancel>Cancel</button>
      <button class="btn btn-primary" data-save>${icon('check')} ${isNew ? `Save to ${esc(truncate(p.name, 26))}` : 'Save changes'}</button>`;
    bind();
    preview();
  }

  function contribRow(c, i) {
    const roleSel = `<select class="select" data-c="${i}" data-k="role" aria-label="Role">${ROLES.map(([k, l]) => `<option value="${k}" ${k === c.role ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const tools = `<div class="tools">
      <button class="icon-btn" data-c-up="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
      <button class="icon-btn" data-c-toggle="${i}" title="${c.org ? 'Switch to person' : 'Switch to organization'}">${icon(c.org ? 'user' : 'building')}</button>
      <button class="icon-btn" data-c-rm="${i}" title="Remove">${icon('x')}</button></div>`;
    if (c.org) return `<div class="contrib org">${roleSel}<input class="input" data-c="${i}" data-k="literal" placeholder="Organization name" value="${esc(c.literal)}">${tools}</div>`;
    return `<div class="contrib">${roleSel}<input class="input" data-c="${i}" data-k="given" placeholder="First & middle names" value="${esc(c.given)}"><input class="input" data-c="${i}" data-k="family" placeholder="Last name" value="${esc(c.family)}">${tools}</div>`;
  }

  function fieldHtml(f, label, missing) {
    const def = FIELD_DEFS[f] || { label: f };
    const cls = `field ${def.wide ? 'wide' : ''} ${missing ? 'missing' : ''}`;
    if (def.kind === 'date') {
      const parts = w[f]?.['date-parts']?.[0] || [];
      const [y, mo, d] = parts;
      return `<div class="${cls}" data-field="${f}"><label>${esc(label)}${missing ? ' <span class="req">missing</span>' : ''}</label>
        <div class="date-row">
          <input class="input" data-date="${f}" data-part="2" placeholder="Day" inputmode="numeric" maxlength="2" value="${d ?? ''}" aria-label="${esc(label)} day">
          <select class="select" data-date="${f}" data-part="1" aria-label="${esc(label)} month"><option value="">Month</option>${MONTHS.map((mn, i) => `<option value="${i + 1}" ${mo === i + 1 ? 'selected' : ''}>${mn}</option>`).join('')}</select>
          <input class="input" data-date="${f}" data-part="0" placeholder="Year" inputmode="numeric" maxlength="4" value="${y ?? ''}" aria-label="${esc(label)} year">
          ${def.today ? `<button class="btn btn-sm" data-today="${f}" type="button">Today</button>` : '<span></span>'}
        </div></div>`;
    }
    const v = w[f] == null ? '' : String(w[f]);
    if (def.kind === 'textarea') return `<div class="${cls}" data-field="${f}"><label for="f-${f}">${esc(label)}</label><textarea class="input" id="f-${f}" data-f="${f}" rows="3">${esc(v)}</textarea></div>`;
    const caseTools = f === 'title' ? `<span class="case-tools">
        <button type="button" class="case-btn" data-case="sentence" title="APA, Harvard, Vancouver: only the first word and names capitalised">Sentence case</button>
        <button type="button" class="case-btn" data-case="title" title="Capitalise Major Words">Title Case</button>
        ${w._titleAsPublished && w._titleAsPublished !== w.title ? '<button type="button" class="case-btn" data-case="original" title="Exactly as the source wrote it">As published</button>' : ''}
      </span>` : '';
    return `<div class="${cls}" data-field="${f}"><label for="f-${f}">${esc(label)}${missing ? ' <span class="req">missing</span>' : ''}${caseTools}</label><input class="input" id="f-${f}" data-f="${f}" value="${esc(v)}" placeholder="${esc(def.placeholder || '')}"></div>`;
  }

  // Title Case for the "Title Case" button (CSL styles like MLA do this themselves)
  const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'v', 'with', 'from', 'into', 'over']);
  const toTitleCase = t => t.replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (word, idx) => {
    const before = t.slice(0, idx).trimEnd();
    const first = !before || /[:?!.—–-]$/.test(before);
    if (/\p{Lu}.*\p{Lu}/u.test(word) || /\p{Ll}\p{Lu}/u.test(word)) return word; // NASA, iPhone
    if (!first && MINOR.has(word.toLowerCase())) return word.toLowerCase();
    return word[0].toUpperCase() + word.slice(1);
  });

  async function applyCase(mode) {
    const input = $('#f-title', m.body);
    const current = input.value;
    if (!current.trim()) return;
    if (mode === 'original') input.value = w._titleAsPublished;
    else if (mode === 'title') input.value = toTitleCase(current);
    else {
      try {
        // Sentence case needs the dictionary on the server (to keep names capitalised)
        const lowered = current === current.toLowerCase() ? toTitleCase(current) : current;
        input.value = (await api('/api/sentence-case', { body: { text: lowered } })).text;
      } catch (e) { toast(e.message, { error: true }); return; }
    }
    if (!w._titleAsPublished) w._titleAsPublished = current;
    w.title = input.value;
    changed();
  }

  function bind() {
    const b = m.body;
    $$('[data-case]', b).forEach(el => el.onclick = e => { e.preventDefault(); applyCase(el.dataset.case); });
    $('#ed-type', b).onchange = e => {
      const nt = SOURCE_TYPES.find(s => s.id === e.target.value);
      const old = sourceTypeFor(w);
      w.type = nt.csl;
      if (nt.genre) w.genre = nt.genre; else if (old.genre && w.genre === old.genre) delete w.genre;
      changed(); render();
    };
    $$('[data-f]', b).forEach(el => el.oninput = () => { const v = el.value; if (v.trim()) w[el.dataset.f] = v; else delete w[el.dataset.f]; changed(); });
    $$('[data-date]', b).forEach(el => el.oninput = el.onchange = () => {
      const f = el.dataset.date;
      const vals = [0, 1, 2].map(i => $(`[data-date="${f}"][data-part="${i}"]`, b).value.trim());
      const [y, mo, d] = vals.map(v => parseInt(v, 10));
      if (!y) { delete w[f]; } else {
        const parts = [y];
        if (mo) { parts.push(mo); if (d) parts.push(d); }
        w[f] = { 'date-parts': [parts] };
      }
      changed();
    });
    $$('[data-today]', b).forEach(el => el.onclick = () => { w[el.dataset.today] = { 'date-parts': [todayParts()] }; changed(); render(); });
    $$('[data-c]', b).forEach(el => el.oninput = el.onchange = () => { contributors[+el.dataset.c][el.dataset.k] = el.value; changed(); });
    // Pasting "Jane Doe" into the first-name box splits it for you
    $$('[data-k="given"]', b).forEach(el => el.addEventListener('paste', e => {
      const txt = e.clipboardData.getData('text').trim();
      const i = +el.dataset.c;
      if (/\s/.test(txt) && !contributors[i].family) {
        e.preventDefault();
        const parts = txt.includes(',') ? txt.split(',').map(s => s.trim()).reverse() : [txt.split(/\s+/).slice(0, -1).join(' '), txt.split(/\s+/).pop()];
        contributors[i].given = parts[0]; contributors[i].family = parts[1];
        changed(); render();
      }
    }));
    $$('[data-c-rm]', b).forEach(el => el.onclick = () => { contributors.splice(+el.dataset.cRm, 1); changed(); render(); });
    $$('[data-c-up]', b).forEach(el => el.onclick = () => { const i = +el.dataset.cUp; [contributors[i - 1], contributors[i]] = [contributors[i], contributors[i - 1]]; changed(); render(); });
    $$('[data-c-toggle]', b).forEach(el => el.onclick = () => {
      const c = contributors[+el.dataset.cToggle];
      if (c.org) { const parts = c.literal.trim().split(/\s+/); c.family = parts.pop() || ''; c.given = parts.join(' '); }
      else c.literal = [c.given, c.family].filter(Boolean).join(' ');
      c.org = !c.org; changed(); render();
    });
    $('[data-add-person]', b).onclick = () => { contributors.push({ role: 'author', org: false, given: '', family: '', literal: '' }); render(); $$('[data-k="given"]', m.body).pop()?.focus(); };
    $('[data-add-org]', b).onclick = () => { contributors.push({ role: 'author', org: true, given: '', family: '', literal: '' }); render(); $$('[data-k="literal"]', m.body).pop()?.focus(); };
    $('[data-more]', b).onclick = () => { showMore = !showMore; render(); };
    $('#ed-note', b).oninput = e => { w._note = e.target.value; dirty = true; };
    const tagIn = $('#ed-tags input', b);
    tagIn.onkeydown = e => {
      if ((e.key === 'Enter' || e.key === ',') && tagIn.value.trim()) {
        e.preventDefault();
        const tg = tagIn.value.trim().replace(/,$/, '');
        w._tags = [...new Set([...(w._tags || []), tg])];
        dirty = true; render(); $('#ed-tags input', m.body).focus();
      } else if (e.key === 'Backspace' && !tagIn.value && w._tags?.length) { w._tags.pop(); dirty = true; render(); $('#ed-tags input', m.body).focus(); }
    };
    $$('[data-rm-tag]', b).forEach(el => el.onclick = () => { w._tags = w._tags.filter(x => x !== el.dataset.rmTag); dirty = true; render(); });

    $('[data-cancel]', m.foot).onclick = () => m.close();
    $('[data-save]', m.foot).onclick = saveIt;
    const del = $('[data-delete]', m.foot);
    if (del) del.onclick = () => {
      const undo = removeItems([item.id], p.id);
      m.close('force');
      toast('Citation deleted', { action: { label: 'Undo', fn: undo } });
    };
    m.el.onkeydown = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveIt(); } };
  }

  function changed() {
    dirty = true;
    // live-update missing highlights without a full re-render
    const t = sourceTypeFor(w);
    const missing = new Set(missingInfo({ ...w, ...groupContributors(contributors) }));
    $$('[data-field]', m.body).forEach(el => {
      const f = el.dataset.field;
      const lbl = t.labels?.[f] || (f === 'container-title' && t.container) || FIELD_DEFS[f]?.label || f;
      el.classList.toggle('missing', missing.has(lbl));
    });
    preview();
  }

  function finalItem() {
    const out = { ...w };
    for (const r of ROLE_KEYS) delete out[r];
    Object.assign(out, groupContributors(contributors));
    for (const k of Object.keys(out)) {
      if (typeof out[k] === 'string') { out[k] = out[k].trim(); if (!out[k]) delete out[k]; }
    }
    if (!out._note) delete out._note;
    if (!out._tags?.length) delete out._tags;
    if (out.DOI) out.DOI = out.DOI.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    return out;
  }

  const preview = debounce(async () => {
    const it = { ...finalItem(), id: 'preview' };
    const status = $('.pv-status', m.body);
    try {
      if (status) status.innerHTML = '<span class="spinner" style="width:11px;height:11px;border-width:1.5px"></span>';
      const r = await formatBibliography({ items: [it], style: p.style, lang: p.lang });
      const e = r.entries[0];
      const box = $('.pv-html', m.body);
      if (!box) return;
      box.className = `csl pv-html ${state.serif ? 'serif' : ''} ${r.params.hangingIndent ? 'hanging' : ''}`;
      box.innerHTML = e?.html || '<span style="color:var(--muted)">Fill in some details to see a preview</span>';
      $('.pv-intext', m.body).innerHTML = e?.intext?.paren ? `${r.style.isNote ? 'Footnote' : 'In-text'}: ${e.intext.paren}${e.intext.narrative ? ` &nbsp;·&nbsp; Narrative: ${e.intext.narrative}` : ''}` : '';
      if (status) status.textContent = '';
    } catch (err) { if (status) status.textContent = 'Preview unavailable'; }
  }, 220);

  function saveIt() {
    const out = finalItem();
    if (!out.title && !ROLE_KEYS.some(r => out[r]?.length)) { toast('Add at least a title or an author', { error: true }); return; }
    dirty = false;
    if (isNew) {
      const dupe = findDuplicate(out, p);
      const [added] = addItems([out], p.id);
      m.close('force');
      if (dupe) toast('Heads up: this looks like a citation you already have', { action: { label: 'Undo', fn: () => removeItems([added.id], p.id) } });
      else toast(`Added to ${p.name}`);
      onSaved?.(added);
    } else {
      if (['Webpage', 'PDF', 'URL'].includes(out._source)) out._checked = true;
      replaceItem(item.id, out, p.id);
      m.close('force');
      toast('Citation updated');
      onSaved?.({ ...out, id: item.id });
    }
  }

  render();
  setTimeout(() => {
    const first = $$('.field.missing input, .field.missing select', m.body)[0];
    if (first && !isNew) first.focus();
  }, 60);
  return m;
}

function truncate(s, n) { return s.length > n ? `${s.slice(0, n - 1)}…` : s; }
