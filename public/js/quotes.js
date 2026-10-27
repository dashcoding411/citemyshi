// Quotes saved against a source, each with its page (or paragraph/time), ready
// to paste into an essay already cited in the project's style.
import { $, $$, esc, uid, openModal, toast, copyRich } from './ui.js';
import { icon } from './icons.js';
import * as S from './store.js';
import { active } from './store.js';
import { formatInText } from './formatter.js';

export const LOCATORS = [['page', 'Page'], ['paragraph', 'Paragraph (no page numbers)'], ['section', 'Section'], ['timestamp', 'Time (video/audio)']];
const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; };
const words = t => t.trim().split(/\s+/).filter(Boolean).length;

export function quotesHtml(item, open) {
  const qs = item._quotes || [];
  if (!qs.length) return '';
  return `<div class="quotes ${open ? 'open' : ''}">
    <button class="quotes-toggle" data-quotes-toggle>${icon(open ? 'chevronDown' : 'chevronRight')} ${qs.length} saved quote${qs.length === 1 ? '' : 's'}</button>
    ${open ? qs.map(q => `<div class="quote" data-quote="${q.id}">
      <blockquote>${esc(q.text)}</blockquote>
      <div class="quote-meta">
        ${q.locator ? `<span class="chip">${esc(locatorLabel(q))}</span>` : '<span class="chip" style="--chip-fg:var(--warn)">no page</span>'}
        ${q.comment ? `<span class="quote-comment">${esc(q.comment)}</span>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-sm" data-quote-copy="${q.id}">${icon('copy')} Copy with citation</button>
        <button class="icon-btn" data-quote-edit="${q.id}" title="Edit quote" aria-label="Edit quote">${icon('pencil')}</button>
        <button class="icon-btn" data-quote-delete="${q.id}" title="Delete quote" aria-label="Delete quote">${icon('trash')}</button>
      </div>
    </div>`).join('') + `<button class="btn btn-sm btn-ghost" data-quote-add>${icon('plus')} Add another quote</button>` : ''}
  </div>`;
}

const locatorLabel = q => ({ page: /[-–,]/.test(q.locator) ? `pp. ${q.locator}` : `p. ${q.locator}`, paragraph: `para. ${q.locator}`, section: `s ${q.locator}`, timestamp: q.locator })[q.label || 'page'] || q.locator;

export function openQuoteForm(item, quoteId) {
  const p = active();
  const existing = (item._quotes || []).find(q => q.id === quoteId);
  const m = openModal({
    title: existing ? 'Edit quote' : 'Save a quote',
    body: `
      <div class="field wide" style="margin-bottom:12px"><label for="q-text">Quote — exactly as written in the source</label>
        <textarea class="input" id="q-text" rows="5" placeholder="Paste or type the passage…" autofocus>${esc(existing?.text || '')}</textarea>
        <span id="q-words" style="font-size:12px;color:var(--muted)"></span></div>
      <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:12px">
        <div class="field"><label for="q-label">Where in the source</label><select class="select" id="q-label">${LOCATORS.map(([k, l]) => `<option value="${k}" ${(existing?.label || 'page') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="q-loc">Number</label><input class="input" id="q-loc" placeholder="e.g. 42 or 42–43" value="${esc(existing?.locator || '')}"></div>
      </div>
      <div class="field wide"><label for="q-comment">Your note (optional)</label><input class="input" id="q-comment" placeholder="Why it matters, which paragraph of your essay…" value="${esc(existing?.comment || '')}"></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${icon('check')} Save quote</button>`,
  });
  const count = () => {
    const n = words($('#q-text', m.el).value);
    $('#q-words', m.el).textContent = n ? `${n} words${n >= 40 ? ' — long quote: it will be copied as a block quote (APA: 40+ words)' : ''}` : '';
  };
  $('#q-text', m.el).oninput = count; count();
  $('[data-cancel]', m.el).onclick = () => m.close();
  $('[data-save]', m.el).onclick = () => {
    const text = $('#q-text', m.el).value.trim().replace(/^["“”]+|["“”]+$/g, '');
    if (!text) return $('#q-text', m.el).focus();
    const q = { id: existing?.id || uid(), text, label: $('#q-label', m.el).value, locator: $('#q-loc', m.el).value.trim().replace(/-/g, '–'), comment: $('#q-comment', m.el).value.trim(), added: existing?.added || Date.now() };
    const quotes = existing ? item._quotes.map(x => x.id === q.id ? q : x) : [...(item._quotes || []), q];
    S.updateItem(item.id, { _quotes: quotes }, p.id);
    m.close();
    toast(existing ? 'Quote updated' : `Quote saved${q.locator ? '' : ' — add the page number before you hand in'}`);
  };
}

export function deleteQuote(item, quoteId) {
  const before = item._quotes || [];
  S.updateItem(item.id, { _quotes: before.filter(q => q.id !== quoteId) });
  toast('Quote deleted', { action: { label: 'Undo', fn: () => S.updateItem(item.id, { _quotes: before }) } });
}

// The quote with its citation, following the project's style
export async function quoteWithCitation(item, q, fmt) {
  const p = active();
  const loc = q.locator && q.label === 'timestamp' ? q.locator : q.locator;
  const label = q.label === 'timestamp' ? 'page' : q.label || 'page';
  const r = await formatInText({ item, items: p.items, style: p.style, lang: p.lang, locator: loc, label });
  if (q.label === 'timestamp' && loc) { r.paren = r.paren.replace(/\bpp?\.\s*/, ''); }
  let cite = r.paren;
  // Numbered styles: use the reference's number from the bibliography
  const entry = fmt?.byId?.get(item.id);
  const numbered = entry && /^\s*(<[^>]+>)*[[(]?\d+[\])]?(<\/[^>]+>)*\s*$/.test(entry.intext.paren || '');
  if (numbered) {
    const n = plain(entry.intext.paren).replace(/[^\d]/g, '');
    const open = /^\s*\[/.test(plain(entry.intext.paren)) ? '[' : '(';
    cite = `${open}${n}${loc ? `, ${locatorLabel({ ...q, locator: loc })}` : ''}${open === '[' ? ']' : ')'}`;
  }
  const long = words(q.text) >= 40;
  const text = q.text.replace(/[.,;:]+$/, '');
  if (r.isNote) {
    // Note styles: the quote goes in the text, the citation in a footnote
    const html = long ? `<blockquote>${esc(q.text)}</blockquote>` : `“${esc(text)}”`;
    return { html, text: long ? q.text : `“${text}”`, footnote: plain(cite), footnoteHtml: cite };
  }
  if (long) return { html: `<blockquote style="margin-left:0.5in">${esc(q.text)} ${cite}</blockquote>`, text: `${q.text} ${plain(cite)}` };
  return { html: `“${esc(text)}” ${cite}.`, text: `“${text}” ${plain(cite)}.` };
}

export async function copyQuote(item, quoteId, fmt) {
  const q = (item._quotes || []).find(x => x.id === quoteId);
  if (!q) return;
  try {
    const r = await quoteWithCitation(item, q, fmt);
    if (r.footnote) {
      await copyRich(`${r.html}<br><br>Footnote: ${r.footnoteHtml}`, `${r.text}\n\nFootnote: ${r.footnote}`);
      toast('Copied the quote and its footnote — paste the footnote into a Word/Docs footnote');
    } else {
      await copyRich(r.html, r.text);
      toast(q.locator ? 'Copied with citation' : 'Copied — this quote has no page number yet');
    }
  } catch (e) { toast(e.message, { error: true }); }
}

// Every quote in the project, grouped by source — handy for revision and planning
export async function quotesExport(items, fmt) {
  const lines = [];
  for (const it of items) {
    if (!it._quotes?.length) continue;
    lines.push(fmt?.byId?.get(it.id)?.text || it.title || 'Untitled', '');
    for (const q of it._quotes) {
      const r = await quoteWithCitation(it, q, fmt);
      lines.push(`  ${r.text}${r.footnote ? `  [footnote: ${r.footnote}]` : ''}`);
      if (q.comment) lines.push(`    — ${q.comment}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
