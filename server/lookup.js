// Lookups for DOI, ISBN, PMID, arXiv and free-text search (books + articles).
import * as cheerio from 'cheerio';
import { parseName, parseDate, cleanText, today } from './names.js';
import { parseLegalCitation } from './legal.js';

const UA = 'citemyshi/1.0 (citation generator; mailto:citemyshi@example.com)';
// Google Books works without a key but shares a small anonymous quota; set GOOGLE_BOOKS_API_KEY for heavy use.
const gbKey = () => process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';

export async function getJSON(url, { headers = {}, timeout = 12000 } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function getText(url, { headers = {}, timeout = 12000 } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.text();
}

// ---------- Identifier detection ----------
export function detectInput(q) {
  const s = q.trim();
  let m;
  if ((m = s.match(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\/(10\.\d{4,9}\/\S+)$/i)) || (m = s.match(/^(?:doi:\s*)?(10\.\d{4,9}\/\S+)$/i))) return { kind: 'doi', value: decodeURIComponent(m[1]).replace(/[.,;]$/, '') };
  if ((m = s.match(/^(?:pmid:?\s*)(\d{1,9})$/i))) return { kind: 'pmid', value: m[1] };
  if ((m = s.match(/^(?:arxiv:\s*)?(\d{4}\.\d{4,5}(?:v\d+)?)$/i)) || (m = s.match(/^arxiv:\s*([a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/i))) return { kind: 'arxiv', value: m[1] };
  const digits = s.replace(/^isbn(?:-1[03])?:?\s*/i, '').replace(/[\s-]/g, '');
  if (/^(97[89]\d{10}|\d{9}[\dX])$/i.test(digits) && validIsbn(digits)) return { kind: 'isbn', value: digits.toUpperCase() };
  if (/^https?:\/\//i.test(s) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s)) return { kind: 'url', value: /^https?:/i.test(s) ? s : `https://${s}` };
  if (parseLegalCitation(s)) return { kind: 'legal', value: s };
  return { kind: 'search', value: s };
}

export function validIsbn(s) {
  s = s.replace(/[\s-]/g, '').toUpperCase();
  if (s.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i++) { const c = s[i] === 'X' ? 10 : +s[i]; if (Number.isNaN(c)) return false; sum += c * (10 - i); }
    return sum % 11 === 0;
  }
  if (s.length === 13) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += +s[i] * (i % 2 ? 3 : 1);
    return sum % 10 === 0;
  }
  return false;
}

// ---------- Crossref / DOI ----------
const CROSSREF_TYPES = {
  'journal-article': 'article-journal', 'book-chapter': 'chapter', 'book-section': 'chapter', 'book-part': 'chapter',
  'proceedings-article': 'paper-conference', 'posted-content': 'article', 'monograph': 'book', 'edited-book': 'book',
  'reference-book': 'book', 'book': 'book', 'book-set': 'book', 'book-series': 'book', 'report': 'report', 'report-series': 'report',
  'dissertation': 'thesis', 'dataset': 'dataset', 'reference-entry': 'entry-encyclopedia', 'standard': 'standard',
  'peer-review': 'review', 'journal-issue': 'periodical', 'journal': 'periodical', 'component': 'article',
};

function crossrefName(a) {
  if (a.name && !a.family) return { literal: cleanText(a.name) };
  const n = { family: cleanText(a.family || ''), given: cleanText(a.given || '') };
  // Publishers sometimes file initials as the surname ("M.V." / given "Varkey") — swap them back
  if (/^(\p{Lu}\.?\s?){1,3}$/u.test(n.family) && /^\p{Lu}\p{Ll}{2,}$/u.test(n.given)) [n.family, n.given] = [n.given, n.family.replace(/\.?$/, '.').replace(/\.(?=\p{Lu})/gu, '. ')];
  if (a.suffix) n.suffix = a.suffix;
  return n;
}

function first(v) { return Array.isArray(v) ? v[0] : v; }

function crossrefDate(d) {
  const parts = d?.['date-parts']?.[0];
  if (!parts || parts[0] == null) return undefined;
  return { 'date-parts': [parts.filter(x => x != null)] };
}

export function crossrefToCsl(w) {
  const type = CROSSREF_TYPES[w.type] || (w.type?.includes('book') ? 'book' : 'article-journal');
  const item = {
    type,
    title: cleanText(first(w.title) || ''),
    DOI: w.DOI,
    URL: w.URL || (w.DOI ? `https://doi.org/${w.DOI}` : undefined),
    publisher: cleanText(w.publisher || ''),
    'publisher-place': w['publisher-location'],
    volume: w.volume,
    issue: w.issue || w['journal-issue']?.issue,
    page: w.page,
    ISSN: first(w.ISSN),
    ISBN: first(w.ISBN),
    issued: crossrefDate(w['published-print']) || crossrefDate(w.issued) || crossrefDate(w['published-online']) || crossrefDate(w.created),
    language: w.language,
    abstract: w.abstract ? cleanText(w.abstract.replace(/<jats:title>.*?<\/jats:title>/g, '')) : undefined,
  };
  const subtitle = first(w.subtitle);
  if (subtitle && item.title && !item.title.includes(subtitle)) item.title = `${item.title}: ${cleanText(subtitle)}`;
  const container = first(w['container-title']);
  if (container) item['container-title'] = cleanText(container);
  const short = first(w['short-container-title']);
  if (short) item['container-title-short'] = short;
  if (w.edition) item.edition = w.edition;
  if (w['article-number'] && !item.page) item.number = w['article-number'];
  for (const role of ['author', 'editor', 'translator']) if (w[role]?.length) item[role] = w[role].map(crossrefName);
  if (w.type === 'posted-content') { item.genre = w.subtype === 'preprint' ? 'Preprint' : undefined; if (!item['container-title'] && w.institution?.[0]?.name) item.publisher = w.institution[0].name; }
  if (type === 'paper-conference' && w.event?.name) item['event-title'] = w.event.name;
  if (type === 'chapter' && !item['container-title'] && w['container-title']?.length) item['container-title'] = w['container-title'][0];
  // Book-ish things: DOI URL is fine, but drop ISSN noise
  if (type === 'book') delete item.ISSN;
  return prune(item);
}

export function prune(o) {
  for (const k of Object.keys(o)) if (o[k] == null || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k];
  return o;
}

export async function lookupDoi(doi) {
  doi = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  try {
    const { message } = await getJSON(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    const item = crossrefToCsl(message);
    if (item.DOI?.toLowerCase() === doi.toLowerCase()) { item.DOI = doi; item.URL = `https://doi.org/${doi}`; }
    return { ...item, accessed: today() };
  } catch (e) {
    // Non-Crossref DOIs (DataCite, mEDRA, …): content negotiation
    const csl = await getJSON(`https://doi.org/${encodeURI(doi)}`, { headers: { Accept: 'application/vnd.citationstyles.csl+json' } });
    const item = {};
    const keep = ['type', 'title', 'author', 'editor', 'translator', 'container-title', 'publisher', 'publisher-place', 'volume', 'issue', 'page', 'DOI', 'URL', 'ISSN', 'ISBN', 'issued', 'genre', 'edition', 'number', 'language', 'abstract', 'version'];
    for (const k of keep) if (csl[k] != null) item[k] = csl[k];
    if (item.type === 'article-journal' && !item['container-title']) item.type = 'article';
    if (item.title) item.title = cleanText(item.title);
    if (Array.isArray(item.ISSN)) item.ISSN = item.ISSN[0];
    if (Array.isArray(item.ISBN)) item.ISBN = item.ISBN[0];
    if (item.type === 'dataset' && !item.publisher && csl.publisher) item.publisher = csl.publisher;
    return prune({ ...item, accessed: today() });
  }
}

// Elsevier article IDs (PII), e.g. S221242091630440X -> DOI via Crossref
export async function lookupPii(pii) {
  const clean = pii.replace(/[^0-9A-Z]/gi, '').toUpperCase();
  const r = await getJSON(`https://api.crossref.org/works?filter=alternative-id:${clean}&rows=1&select=DOI`);
  const doi = r.message?.items?.[0]?.DOI;
  if (!doi) throw new Error('Article not found');
  return lookupDoi(doi);
}

// Find a published work by its title — only accepts a near-exact match, so a
// guessed title never turns into the wrong paper.
const titleWords = t => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(w => w.length > 1);
export async function findByTitle(title) {
  const want = titleWords(title);
  if (want.length < 4) return null;
  const r = await getJSON(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=5&select=DOI,title,subtitle`);
  for (const w of r.message?.items || []) {
    const got = titleWords([first(w.title), first(w.subtitle)].filter(Boolean).join(' '));
    const a = new Set(want), b = new Set(got);
    const overlap = [...a].filter(x => b.has(x)).length;
    if (overlap / a.size >= 0.9 && overlap / b.size >= 0.8) return lookupDoi(w.DOI);
  }
  return null;
}

// ---------- ISBN ----------
function olAuthors(authors) {
  return (authors || []).map(a => parseName(a.name, { forcePerson: true })).filter(Boolean);
}

export async function lookupIsbn(isbn) {
  isbn = isbn.replace(/[\s-]/g, '').toUpperCase();
  const [ol, gb] = await Promise.allSettled([
    getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
    getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${gbKey()}`),
  ]);
  const olData = ol.status === 'fulfilled' ? ol.value[`ISBN:${isbn}`] : null;
  const gbData = gb.status === 'fulfilled' ? gb.value.items?.[0]?.volumeInfo : null;
  if (!olData && !gbData) throw new Error('No book found for that ISBN');

  const item = { type: 'book', ISBN: isbn, accessed: today() };
  const g = gbData ? googleBookToCsl({ volumeInfo: gbData }) : {};
  if (olData) {
    item.title = olData.title + (olData.subtitle ? `: ${olData.subtitle}` : '');
    item.author = olAuthors(olData.authors);
    item.publisher = olData.publishers?.[0]?.name;
    item['publisher-place'] = olData.publish_places?.[0]?.name;
    item.issued = parseDate(olData.publish_date);
    item['number-of-pages'] = olData.number_of_pages;
    if (olData.by_statement && !item.author.length) item.author = [parseName(olData.by_statement)].filter(Boolean);
    const ed = (olData.edition_name || '').match(/(\d+)/);
    if (ed && +ed[1] > 1) item.edition = ed[1];
    item.URL = olData.url;
  }
  // Fill gaps from Google Books (it's usually better on authors & subtitles)
  for (const [k, v] of Object.entries(g)) {
    if (k === 'URL' || k === 'ISBN') continue;
    if (item[k] == null || item[k] === '' || (Array.isArray(item[k]) && !item[k].length)) item[k] = v;
  }
  if (g.author?.length > (item.author?.length || 0)) item.author = g.author;
  if (g.title && item.title && g.title.length > item.title.length && g.title.toLowerCase().startsWith(item.title.toLowerCase())) item.title = g.title;
  delete item.URL; // Books are cited without the catalog URL
  return prune(item);
}

export function googleBookToCsl(v) {
  const info = v.volumeInfo || {};
  const isbn = (info.industryIdentifiers || []).find(i => i.type === 'ISBN_13') || (info.industryIdentifiers || []).find(i => i.type === 'ISBN_10');
  return prune({
    type: 'book',
    title: cleanText((info.title || '') + (info.subtitle ? `: ${info.subtitle}` : '')),
    author: (info.authors || []).map(a => parseName(a, { forcePerson: true })).filter(Boolean),
    publisher: info.publisher,
    issued: parseDate(info.publishedDate),
    ISBN: isbn?.identifier,
    'number-of-pages': info.pageCount,
    language: info.language,
    _thumb: info.imageLinks?.smallThumbnail?.replace('http:', 'https:'),
  });
}

// ---------- PubMed ----------
export async function lookupPmid(pmid) {
  const csl = await getJSON(`https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=${pmid}`, { headers: { Accept: '*/*' } });
  if (csl.DOI) {
    try { return { ...(await lookupDoi(csl.DOI)), PMID: pmid }; } catch {}
  }
  const item = {
    type: 'article-journal', title: cleanText(csl.title), author: csl.author, 'container-title': csl['container-title'],
    'container-title-short': csl['container-title-short'], volume: csl.volume, issue: csl.issue, page: csl.page,
    issued: csl.issued, DOI: csl.DOI, PMID: pmid, URL: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, accessed: today(),
  };
  return prune(item);
}

export async function lookupPmc(pmcid) {
  const csl = await getJSON(`https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pmc/?format=csl&id=${pmcid}`, { headers: { Accept: '*/*' } });
  if (csl.DOI) { try { return { ...(await lookupDoi(csl.DOI)), PMCID: `PMC${pmcid}` }; } catch {} }
  return prune({
    type: 'article-journal', title: cleanText(csl.title), author: csl.author, 'container-title': csl['container-title'],
    volume: csl.volume, issue: csl.issue, page: csl.page, issued: csl.issued, DOI: csl.DOI, PMCID: `PMC${pmcid}`,
    URL: `https://pmc.ncbi.nlm.nih.gov/articles/PMC${pmcid}/`, accessed: today(),
  });
}

// ---------- arXiv ----------
export async function lookupArxiv(id) {
  id = id.replace(/^arxiv:\s*/i, '').replace(/v\d+$/, '');
  // DataCite registers every arXiv paper under 10.48550
  try {
    const item = await lookupDoi(`10.48550/arXiv.${id}`);
    item.type = 'article'; item.publisher = 'arXiv'; item.number = `arXiv:${id}`; item.URL = `https://arxiv.org/abs/${id}`;
    item.DOI = `10.48550/arXiv.${id}`;
    delete item.genre; delete item.version; delete item['container-title'];
    return item;
  } catch {}
  const xml = await getText(`https://export.arxiv.org/api/query?id_list=${id}`);
  const $ = cheerio.load(xml, { xmlMode: true });
  const e = $('entry').first();
  if (!e.length || !e.find('title').text()) throw new Error('arXiv paper not found');
  return prune({
    type: 'article', publisher: 'arXiv', number: `arXiv:${id}`,
    title: cleanText(e.find('title').text()),
    author: e.find('author name').map((i, n) => parseName($(n).text(), { forcePerson: true })).get(),
    issued: parseDate(e.find('published').text()),
    DOI: e.find('arxiv\\:doi').text() || `10.48550/arXiv.${id}`,
    URL: `https://arxiv.org/abs/${id}`, accessed: today(),
  });
}

// ---------- Search ----------
export async function search(q, kind = 'all') {
  const tasks = [];
  if (kind === 'all' || kind === 'book') {
    tasks.push(getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${kind === 'book' ? 12 : 6}&printType=books${gbKey()}`)
      .then(r => (r.items || []).map(v => ({ kind: 'book', item: googleBookToCsl(v) }))));
    tasks.push(getJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${kind === 'book' ? 8 : 4}&fields=key,title,subtitle,author_name,first_publish_year,cover_i,editions,editions.title,editions.subtitle,editions.isbn,editions.publisher,editions.publish_date,editions.publish_place,editions.cover_i,editions.number_of_pages_median`)
      .then(r => (r.docs || []).map(d => {
        // Use one real edition so publisher, date and ISBN all belong together
        const ed = d.editions?.docs?.[0] || {};
        const issued = parseDate(ed.publish_date?.[0]) || (d.first_publish_year ? { 'date-parts': [[d.first_publish_year]] } : undefined);
        const title = ed.title || d.title;
        const subtitle = ed.title ? ed.subtitle : d.subtitle;
        const cover = ed.cover_i || d.cover_i;
        return {
          kind: 'book',
          item: prune({
            type: 'book', title: title + (subtitle ? `: ${subtitle}` : ''),
            author: (d.author_name || []).slice(0, 10).map(a => parseName(a, { forcePerson: true })).filter(Boolean),
            publisher: ed.publisher?.[0], 'publisher-place': ed.publish_place?.[0], issued,
            ISBN: (ed.isbn || []).find(i => i.length === 13) || ed.isbn?.[0],
            _thumb: cover ? `https://covers.openlibrary.org/b/id/${cover}-S.jpg` : undefined,
          }),
        };
      })));
  }
  if (kind === 'all' || kind === 'journal') {
    tasks.push(getJSON(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${kind === 'journal' ? 15 : 8}&select=DOI,title,subtitle,author,editor,container-title,short-container-title,published-print,published-online,issued,created,volume,issue,page,publisher,publisher-location,type,ISSN,ISBN,URL,article-number,event,is-referenced-by-count`)
      .then(r => (r.message?.items || []).filter(w => first(w.title)).map(w => ({ kind: 'journal', item: crossrefToCsl(w) }))));
  }
  const settled = await Promise.allSettled(tasks);
  const results = settled.flatMap(s => s.status === 'fulfilled' ? s.value : []);
  // De-duplicate on title+first author
  const seen = new Set();
  const out = [];
  for (const r of interleave(results)) {
    const key = `${(r.item.title || '').toLowerCase().replace(/\W/g, '').slice(0, 60)}|${(r.item.author?.[0]?.family || r.item.author?.[0]?.literal || '').toLowerCase()}`;
    if (!r.item.title || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  // Rank by how well the title matches what was typed
  const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const qt = norm(q);
  const rel = r => {
    const tt = norm(r.item.title);
    const hits = qt.filter(w => tt.includes(w)).length / (qt.length || 1);
    const joinedT = tt.join(' '), joinedQ = qt.join(' ');
    return hits + (joinedT === joinedQ ? 1.5 : joinedT.startsWith(joinedQ) ? 0.8 : joinedT.includes(joinedQ) ? 0.4 : 0) - Math.max(0, tt.length - qt.length) * 0.02
      + (r.item.author?.length ? 0.1 : 0) + (r.item.issued ? 0.05 : 0);
  };
  return out.map((r, i) => ({ r, i, s: rel(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.r).slice(0, 20);
}

function interleave(results) {
  const by = {};
  for (const r of results) (by[r.kind] ||= []).push(r);
  const lists = Object.values(by);
  const out = [];
  for (let i = 0; lists.some(l => l[i]); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}
