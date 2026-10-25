import * as cheerio from 'cheerio';
import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from 'docx';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-ris';
import '@citation-js/plugin-csl';
import { formatBibliography, bibliographyHeading } from './styles.js';

// citeproc HTML -> docx runs, keeping italics/bold/small caps/super/subscript
function htmlToRuns(html, base) {
  const $ = cheerio.load(`<root>${html}</root>`, { xmlMode: false }, false);
  const runs = [];
  const walk = (node, fmt) => {
    if (node.type === 'text') {
      const text = node.data.replace(/\s+/g, ' ');
      if (text) runs.push(new TextRun({ text, ...base, ...fmt }));
      return;
    }
    if (node.type !== 'tag') return;
    const f = { ...fmt };
    const tag = node.name;
    const style = node.attribs?.style || '';
    if (tag === 'i' || tag === 'em' || /font-style:\s*italic/.test(style)) f.italics = true;
    if (/font-style:\s*normal/.test(style)) f.italics = false;
    if (tag === 'b' || tag === 'strong' || /font-weight:\s*bold/.test(style)) f.bold = true;
    if (tag === 'sup') f.superScript = true;
    if (tag === 'sub') f.subScript = true;
    if (/small-caps/.test(style)) f.smallCaps = true;
    if (/underline/.test(style)) f.underline = {};
    if (node.attribs?.class === 'csl-left-margin') { node.children.forEach(c => walk(c, f)); runs.push(new TextRun({ text: '\t', ...base })); return; }
    node.children.forEach(c => walk(c, f));
  };
  $('root').contents().each((i, n) => walk(n, {}));
  return runs;
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#38;/g, '&').replace(/&#39;/g, "'");

export async function toDocx({ items, style, lang, title }) {
  const bib = await formatBibliography({ items, style, lang });
  const font = 'Times New Roman';
  const base = { font, size: 24 };
  const spacing = { line: bib.params.lineSpacing >= 2 ? 480 : 276, lineRule: LineRuleType.AUTO, after: bib.params.lineSpacing >= 2 ? 0 : 160 };
  const numeric = bib.params.secondFieldAlign;
  const paragraphs = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing, children: [new TextRun({ text: title || bibliographyHeading(style), bold: !/^modern-language/.test(style), ...base })] }),
    ...bib.entries.map(e => new Paragraph({
      spacing,
      indent: numeric ? { left: 720, hanging: 720 } : bib.params.hangingIndent ? { left: 720, hanging: 720 } : undefined,
      tabStops: numeric ? [{ type: 'left', position: 720 }] : undefined,
      children: htmlToRuns(decode(e.html.replace(/^<div class="csl-entry">|<\/div>\s*$/g, '').replace(/<div class="csl-right-inline">|<\/div>/g, '').replace(/<div class="csl-left-margin">([\s\S]*?)<\/div>/g, '<span class="csl-left-margin">$1</span>')), base),
    })),
  ];
  const doc = new Document({ styles: { default: { document: { run: { font, size: 24 } } } }, sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: paragraphs }] });
  return Packer.toBuffer(doc);
}

export function toFormat(items, format) {
  // Notes/tags ride along as note/keywords so they survive a trip to Zotero etc.
  const clean = items.map(({ _thumb, _added, _note, _tags, ...i }) => ({ ...i, ...(_note ? { note: _note } : {}), ...(_tags?.length ? { keyword: _tags.join(', ') } : {}) }));
  const cite = new Cite(clean);
  if (format === 'bibtex') return cite.format('bibtex');
  if (format === 'biblatex') return cite.format('biblatex');
  if (format === 'ris') return cite.format('ris');
  if (format === 'csl') return JSON.stringify(items.map(({ _thumb, ...i }) => i), null, 2);
  throw new Error('Unknown format');
}

export async function parseImport(text) {
  const data = await Cite.async(text.trim());
  return data.data.map(({ _graph, note, keyword, ...i }) => ({ ...i, ...(note ? { _note: note } : {}), ...(keyword ? { _tags: String(keyword).split(/\s*[,;]\s*/).filter(Boolean) } : {}) }));
}
