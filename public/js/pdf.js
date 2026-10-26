// Cite a PDF by dropping it in. It's read here in the browser (never uploaded):
// we look for a DOI / arXiv ID / ISBN in the first pages, otherwise the title
// (document metadata, or the biggest text on page 1) and match it online.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build';
let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= import(`${PDFJS}/pdf.min.mjs`).then(m => { m.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`; return m; }));

const DOI_RE = /\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+[A-Za-z0-9])/;
const ARXIV_RE = /arXiv:\s?(\d{4}\.\d{4,5})(?:v\d+)?/i;
const ISBN_RE = /ISBN(?:-1[03])?:?\s*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dXx])/;

const junkTitle = t => !t || t.length < 8 || /^(microsoft (word|powerpoint)|untitled|document\d*|slide \d|\w+\.(docx?|pdf|tex|indd))/i.test(t) || /^[\w-]+$/.test(t);

export async function readPdf(file) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const meta = await doc.getMetadata().catch(() => ({}));
  const info = meta.info || {};
  const xmpTitle = meta.metadata?.get?.('dc:title');
  let text = '';
  let bigTitle = '';
  for (let n = 1; n <= Math.min(3, doc.numPages); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    text += `${content.items.map(i => i.str).join(' ')}\n`;
    if (n === 1) {
      // The title is usually the largest text on the first page
      const lines = content.items.filter(i => i.str.trim()).map(i => ({ str: i.str, size: Math.round(Math.hypot(i.transform[0], i.transform[1]) * 10) / 10, y: i.transform[5] }));
      const sizes = [...new Set(lines.map(l => l.size))].sort((a, b) => b - a);
      for (const size of sizes) {
        const t = lines.filter(l => l.size === size).sort((a, b) => b.y - a.y).map(l => l.str).join(' ').replace(/\s+/g, ' ').trim();
        if (t.length >= 10 && t.length <= 300 && !/^(journal|vol\.|volume|issn|doi|http|www\.|arxiv)/i.test(t)) { bigTitle = t; break; }
      }
    }
  }
  const metaTitle = [xmpTitle, info.Title].map(t => (t || '').trim()).find(t => !junkTitle(t));
  return {
    doi: (text.match(DOI_RE) || [])[1]?.replace(/[.,;]$/, ''),
    arxiv: (text.match(ARXIV_RE) || [])[1],
    isbn: (text.match(ISBN_RE) || [])[1]?.replace(/[\s-]/g, ''),
    title: metaTitle || bigTitle || file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '),
    // Only real names (PDF tools often leave usernames or codes here)
    author: /^[\p{L} .,'’-]{3,60}$/u.test((info.Author || '').trim()) && /\p{L}{2,}[\s,]+\p{L}/u.test(info.Author) ? info.Author.trim() : '',
    pages: doc.numPages,
    year: (String(info.CreationDate || '').match(/D:(\d{4})/) || [])[1],
  };
}
