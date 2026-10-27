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
  // Chapters in a book series list the series first: ["Lecture Notes in Computer Science", "Computer Vision – ECCV 2020"]
  const containers = [].concat(w['container-title'] || []);
  const container = ['book-chapter', 'book-section', 'book-part', 'proceedings-article'].includes(w.type) && containers.length > 1 ? containers[containers.length - 1] : containers[0];
  if (container) item['container-title'] = cleanText(container);
  if (containers.length > 1 && container !== containers[0]) item['collection-title'] = cleanText(containers[0]);
  const short = first(w['short-container-title']);
  if (short) item['container-title-short'] = short;
  if (w.edition) item.edition = w.edition;
  // Article numbers: APA writes "Article 1729"; publishers often also put the number in "page"
  // MDPI, Frontiers, PLOS, eLife, BMC, Scientific Reports, Nature Communications number articles instead of paging them
  const numbered = /^10\.(3390|3389|1371|7554|1186|1038\/s4(1598|1467))/.test(w.DOI || '') && item.page && !/[-–]/.test(item.page);
  const elocator = /^e\d{3,}$/i.test(String(item.page || '')) || numbered ? item.page : null;
  if (w['article-number'] || elocator) {
    item.number = w['article-number'] || elocator;
    if (!item.page || !/[-–]/.test(item.page) || item.page === item.number) delete item.page;
  }
  for (const role of ['author', 'editor', 'translator']) if (w[role]?.length) item[role] = w[role].map(crossrefName);
  // A journal's handling editor is never part of the reference
  if (type === 'article-journal') delete item.editor;
  // Cochrane reviews: issue = month of publication, article number = review ID (CD001871)
  const cochrane = String(w.DOI || '').match(/^10\.1002\/14651858\.(CD\d{6}|MR\d{6})/i);
  if (cochrane) { item.number = cochrane[1].toUpperCase(); const mo = item.issued?.['date-parts']?.[0]?.[1]; if (mo && !item.issue) item.issue = String(mo); }
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
    if (item.DOI?.toLowerCase() === doi.toLowerCase()) item.DOI = doi; // keep the case it was written in (DataCite upper-cases)
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

// Open Library's edition record is the most reliable free source for the
// edition, publisher, place and date of a particular ISBN; Crossref knows
// academic books exactly as their publisher registered them; Google Books has
// the cleanest titles and author lists when it answers.
const EDITION_IN_TITLE = /[,:(\s-]+\(?((?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|revised|global|international|australian(?: and new zealand)?|updated|expanded)\s+(?:edition|ed\.?)(?:,?\s+global edition)?)\)?\s*$/i;
function splitEdition(title) {
  const m = String(title || '').match(EDITION_IN_TITLE);
  return m ? [title.slice(0, m.index).trim(), m[1]] : [title, undefined];
}
const olName = a => parseName(a, { forcePerson: true });
const plausibleName = n => n && !/[;=]|\d/.test(`${n.given || ''} ${n.family || ''} ${n.literal || ''}`);

export async function lookupIsbn(isbn) {
  isbn = isbn.replace(/[\s-]/g, '').toUpperCase();
  const [edR, dataR, gbR, crR] = await Promise.allSettled([
    getJSON(`https://openlibrary.org/isbn/${isbn}.json`),
    getJSON(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
    getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${gbKey()}`),
    getJSON(`https://api.crossref.org/works?filter=isbn:${isbn}&rows=5`),
  ]);
  const ed = edR.status === 'fulfilled' && edR.value?.title ? edR.value : null;
  const data = dataR.status === 'fulfilled' ? dataR.value[`ISBN:${isbn}`] : null;
  const gb = gbR.status === 'fulfilled' ? gbR.value.items?.[0]?.volumeInfo : null;
  const cr = crR.status === 'fulfilled' ? (crR.value.message?.items || []).find(w => /^(book|monograph|edited-book|reference-book)$/.test(w.type) && first(w.title)) : null;
  if (!ed && !data && !gb && !cr) throw new Error('No book found for that ISBN');

  // Authors of the exact edition (the "data" API sometimes answers for a different edition)
  let edAuthors = [];
  if (data?.authors?.length && (!ed || data.key === ed.key)) edAuthors = data.authors.map(a => olName(a.name));
  else if (ed?.authors?.length) {
    const names = await Promise.all(ed.authors.slice(0, 8).map(a => getJSON(`https://openlibrary.org${a.key}.json`, { timeout: 5000 }).then(x => x.name).catch(() => null)));
    edAuthors = names.filter(Boolean).map(olName);
  }
  edAuthors = edAuthors.filter(plausibleName);

  const item = { type: 'book', ISBN: isbn, accessed: today() };
  if (cr) {
    Object.assign(item, crossrefToCsl(cr));
    item.type = 'book';
    item.ISBN = isbn;
    if (cr['edition-number']) item.edition = cr['edition-number'];
  } else {
    const g = gb ? googleBookToCsl({ volumeInfo: gb }) : {};
    const edTitle = ed && ed.title + (ed.subtitle ? `: ${ed.subtitle}` : '');
    const dataTitle = data && data.title + (data.subtitle ? `: ${data.subtitle}` : '');
    const [title, titleEdition] = splitEdition(g.title || edTitle || dataTitle);
    item.title = cleanText(title);
    item.author = g.author?.length ? g.author : edAuthors.length ? edAuthors : (data?.authors || []).map(a => olName(a.name)).filter(plausibleName);
    if (!item.author.length && (ed?.by_statement || data?.by_statement)) {
      const by = ed?.by_statement || data.by_statement;
      if (/^edited by\s/i.test(by)) item.editor = by.replace(/^edited by\s+/i, '').split(/\s*(?:,|\band\b|&)\s*/).map(olName).filter(plausibleName);
      else item.author = [olName(by.split(/[,;]/)[0])].filter(plausibleName);
    }
    item.publisher = ed?.publishers?.[0] || data?.publishers?.[0]?.name || g.publisher;
    item['publisher-place'] = ed?.publish_places?.[0] || data?.publish_places?.[0]?.name;
    item.issued = parseDate(ed?.publish_date) || parseDate(data?.publish_date) || g.issued;
    item.edition = ed?.edition_name || titleEdition;
    item['number-of-pages'] = ed?.number_of_pages || data?.number_of_pages || g['number-of-pages'];
    item.language = g.language;
  }
  delete item.URL; // Books are cited without the catalog URL
  if (item.DOI) item.URL = `https://doi.org/${item.DOI}`;
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
export async function search(q, kind = 'all', lang = 'en') {
  const tasks = [];
  if (kind === 'all' || kind === 'book') {
    tasks.push(getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${kind === 'book' ? 12 : 6}&printType=books${gbKey()}`)
      .then(r => (r.items || []).map(v => ({ kind: 'book', item: googleBookToCsl(v) }))));
    tasks.push(getJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(String(lang).slice(0, 2))}&limit=${kind === 'book' ? 8 : 4}&fields=key,title,subtitle,author_name,first_publish_year,cover_i,editions,editions.title,editions.subtitle,editions.isbn,editions.publisher,editions.publish_date,editions.publish_place,editions.cover_i,editions.language,editions.number_of_pages_median`)
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
            language: ed.language?.length === 1 ? ({ eng: 'en', fre: 'fr', ger: 'de', spa: 'es', ita: 'it', por: 'pt', ind: 'id', chi: 'zh', jpn: 'ja', heb: 'he' }[ed.language[0]] || ed.language[0]) : undefined,
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
  // Rank by how well the title (and author) match what was typed:
  // "the selfish gene dawkins" is Dawkins' The Selfish Gene, not "Dawkins and the Selfish Gene"
  const norm = t => String(t || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const qt = norm(q);
  const rel = r => {
    const tt = norm(r.item.title);
    const names = new Set((r.item.author || r.item.editor || []).flatMap(a => norm(a.family || a.literal)));
    const byAuthor = qt.filter(w => names.has(w) && !tt.includes(w));
    const qTitle = qt.filter(w => !byAuthor.includes(w));
    const hits = (qt.filter(w => tt.includes(w)).length + byAuthor.length) / (qt.length || 1);
    const joinedT = tt.join(' '), joinedQ = qTitle.join(' ');
    const mainT = norm(String(r.item.title || '').split(/[:?]/)[0]).join(' ');
    return hits + (joinedT === joinedQ || mainT === joinedQ ? 1.5 : joinedT.startsWith(joinedQ) ? 0.8 : joinedT.includes(joinedQ) ? 0.4 : 0)
      - Math.max(0, tt.length - qTitle.length) * 0.02 + (byAuthor.length ? 0.4 : 0)
      + (r.item.author?.length || r.item.editor?.length ? 0.1 : -0.3) + (r.item.issued ? 0.05 : 0)
      - (/:\s*(indonesia|spanish|french|german|polish|chinese|arabic|edición|édition)\b/i.test(r.item.title || '') ? 0.6 : 0)
      + (r.kind === 'book' && (joinedT === joinedQ || mainT === joinedQ) ? 0.15 : 0) // the book, not a review of it
      - (r.item.language && !/^en\b/i.test(r.item.language) && !/^en\b/i.test(lang) ? 0.6 : 0); // a translation is rarely what's wanted
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
