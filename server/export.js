import * as cheerio from 'cheerio';
import { Document, Packer, Paragraph, TextRun, AlignmentType, LineRuleType } from 'docx';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-ris';
import { bibliographyHeading } from './styles.js';

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

// The browser formats the bibliography (see format-worker.js) and sends the
// entries' HTML; this just lays them out as a Word document.
export async function toDocx({ entries, params = {}, style = '', title }) {
  if (!Array.isArray(entries) || !entries.length) throw Object.assign(new Error('Nothing to export'), { status: 400 });
  if (entries.length > 5000 || entries.some(e => typeof e?.html !== 'string' || e.html.length > 50_000)) throw Object.assign(new Error('That bibliography is too large to export'), { status: 400 });
  const font = 'Times New Roman';
  const base = { font, size: 24 };
  const double = params.lineSpacing >= 2;
  const spacing = { line: double ? 480 : 276, lineRule: LineRuleType.AUTO, after: double ? 0 : 160 };
  const numeric = params.secondFieldAlign;
  const paragraphs = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing, children: [new TextRun({ text: title || bibliographyHeading(style), bold: !/^modern-language/.test(style), ...base })] }),
    ...entries.map(e => new Paragraph({
      spacing,
      indent: numeric || params.hangingIndent ? { left: 720, hanging: 720 } : undefined,
      tabStops: numeric ? [{ type: 'left', position: 720 }] : undefined,
      // Keep entities as-is: the parser decodes them (decoding first would turn AGLC's &lt;URL&gt; into a tag)
      children: htmlToRuns(e.html.replace(/^<div class="csl-entry">|<\/div>\s*$/g, '').replace(/<div class="csl-right-inline">|<\/div>/g, '').replace(/<div class="csl-left-margin">([\s\S]*?)<\/div>/g, '<span class="csl-left-margin">$1</span>'), base),
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
