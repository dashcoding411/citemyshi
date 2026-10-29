import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { citeUrl } from './extract.js';
import { detectInput, lookupDoi, lookupIsbn, lookupPmid, lookupArxiv, search, findByTitle } from './lookup.js';
import { searchStyles, loadStyle, bibliographyHeading, LANGUAGES } from './styles.js';
import { toDocx, toFormat, parseImport } from './export.js';
import { toSentenceCase } from './casing.js';
import { tidyItem } from './tidy.js';
import { parseLegalCitation } from './legal.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.disable('x-powered-by');
app.use(compression());

// The website lives on Firebase Hosting and calls this server from there.
const ALLOWED_ORIGINS = [
  /^https:\/\/citemyshi\.(web\.app|firebaseapp\.com)$/,
  /^https:\/\/citemyshi--[\w-]+\.web\.app$/, // Firebase preview channels
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.some(o => (o instanceof RegExp ? o.test(origin) : o === origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Visitors who land on the server's own address get sent to the real site,
// so everyone's projects live in one place.
if (process.env.FRONTEND_URL) {
  app.get(['/', '/index.html'], (req, res) => res.redirect(302, process.env.FRONTEND_URL));
}

// Simple per-visitor rate limit for the endpoints that hit other websites
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}|${req.path}`;
    const now = Date.now();
    const h = hits.get(key)?.filter(t => now - t < windowMs) || [];
    if (h.length >= max) return res.status(429).json({ error: 'Slow down a little — too many requests. Try again in a minute.' });
    h.push(now); hits.set(key, h);
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.every(t => now - t > 60_000)) hits.delete(k); }, 60_000).unref();
app.use('/api/cite', rateLimit(90, 60_000)); // includes search-as-you-type
app.use('/api/export', rateLimit(60, 60_000));
app.use('/api/import', rateLimit(20, 60_000));
app.use('/api/match-title', rateLimit(30, 60_000));
app.use('/api/cite-page', rateLimit(30, 60_000));
app.get('/healthz', (req, res) => res.send('ok'));
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ limit: '5mb', type: 'text/*' }));
app.use(express.static(path.join(root, 'public'), { maxAge: '1h' }));

const wrap = fn => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { console.error(`[${req.path}]`, e.message); res.status(e.status && e.status < 500 ? 400 : 500).json({ error: e.message || 'Something went wrong' }); }
};

// One endpoint for the search box: figures out what you pasted.
// Recently cited things come back instantly (6h for items, 1h for searches)
const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = fn().catch(e => { cache.delete(key); throw e; });
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 1000) cache.delete(cache.keys().next().value);
  return v;
}

app.get('/api/cite', wrap(async req => {
  const q = String(req.query.q || '').trim();
  const kind = String(req.query.kind || 'all');
  if (!q) throw Object.assign(new Error('Type something to cite'), { status: 400 });
  const d = detectInput(q);
  const key = `${d.kind}|${d.value}|${d.kind === 'search' ? kind : ''}`;
  const r = await cached(key, d.kind === 'search' ? 3600_000 : 6 * 3600_000, async () => {
    const out = await resolve(d, kind);
    // Store titles in sentence case (the CSL convention): APA etc. print them as-is,
    // MLA/Chicago capitalise them automatically. Then fix what databases get wrong.
    if (out.item) out.item = tidyItem(out.item);
    if (out.results) out.results = out.results.map(x => ({ ...x, item: tidyItem(x.item) }));
    return out;
  });
  const { trace, ...out } = r;
  if (req.query.debug && trace?.length) out.debug = trace;
  // Fresh "accessed" date even when served from cache
  if (out.item) return { ...out, item: { ...out.item, ...(out.item.accessed ? { accessed: todayParts() } : {}) } };
  return out;
}));

const todayParts = () => { const t = new Date(); return { 'date-parts': [[t.getFullYear(), t.getMonth() + 1, t.getDate()]] }; };

async function resolve(d, kind) {
  switch (d.kind) {
    case 'url': { const r = await citeUrl(d.value); return { mode: 'item', ...r }; }
    case 'doi': return { mode: 'item', item: await lookupDoi(d.value), source: 'DOI' };
    case 'isbn': return { mode: 'item', item: await lookupIsbn(d.value), source: 'ISBN' };
    case 'pmid': return { mode: 'item', item: await lookupPmid(d.value), source: 'PubMed' };
    case 'arxiv': return { mode: 'item', item: await lookupArxiv(d.value), source: 'arXiv' };
    case 'legal': { const { item, pinpoint } = parseLegalCitation(d.value); return { mode: 'item', item: { ...item, ...(pinpoint ? { _pinpoint: pinpoint } : {}) }, source: 'legal citation' }; }
    default: return { mode: 'results', results: await search(d.value, kind === 'website' || kind === 'video' ? 'all' : kind) };
  }
}

// Full style file (dependent journal styles resolved to their parent) for the
// browser's formatter. Styles rarely change, so let browsers/CDNs cache them.
app.get('/api/csl/:name', wrap(async (req, res) => {
  const s = await loadStyle(req.params.name);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return { name: s.name, title: s.title, isNote: s.isNote, defaultLocale: s.defaultLocale, xml: s.xml };
}));

// Find the published version of a document from its title (used for dropped PDFs)
app.get('/api/match-title', wrap(async req => {
  const title = String(req.query.title || '').trim().slice(0, 400);
  if (title.length < 10) return { item: null };
  const item = await cached(`title|${title.toLowerCase()}`, 6 * 3600_000, () => findByTitle(title).catch(() => null));
  return { item: item ? tidyItem(item) : null, source: item ? 'DOI' : null };
}));

// The "Cite this page" button: the page's HTML as the student's browser shows it
app.post('/api/cite-page', wrap(async req => {
  const url = String(req.body?.url || '').trim();
  const html = String(req.body?.html || '');
  if (!/^https?:\/\//i.test(url) || url.length > 2000) throw Object.assign(new Error('That page’s address wasn’t sent'), { status: 400 });
  if (!html || html.length > 1_000_000) throw Object.assign(new Error('That page was too large to read'), { status: 400 });
  // Pressed while the site was still showing a "checking your browser" screen
  const hasDetails = /property="og:title"|name="citation_title"|application\/ld\+json|<h1[\s>]/i.test(html);
  const pageTitle = (html.match(/<title>([^<]*)/i) || [])[1]?.trim().toLowerCase() || '';
  if (!hasDetails && (!pageTitle || pageTitle === new URL(url).hostname.replace(/^www\./, '') || /captcha|datadome|px-captcha|cf-chl|challenge-platform|Just a moment|Verifying you are human/i.test(html))) {
    throw Object.assign(new Error('That page was still showing a security check. Let it finish loading, then press the Cite button again.'), { status: 422 });
  }
  const { trace, ...r } = await citeUrl(url, { html });
  return { mode: 'item', ...r, item: tidyItem(r.item) };
}));

app.post('/api/sentence-case', wrap(async req => ({ text: toSentenceCase(String(req.body?.text || '').slice(0, 2000)) })));

app.get('/api/styles', wrap(async req => {
  const opts = { degree: req.query.degree ? String(req.query.degree) : undefined, uni: req.query.uni === '1', limit: Math.min(300, Number(req.query.limit) || 40) };
  const r = searchStyles(String(req.query.q || ''), opts);
  return Array.isArray(r) ? r : (opts.degree || opts.uni || req.query.full ? r : r.results);
}));
app.get('/api/languages', wrap(async () => LANGUAGES));
app.get('/api/style/:name', wrap(async req => {
  const s = await loadStyle(req.params.name);
  return { name: s.name, title: s.title, isNote: s.isNote, heading: bibliographyHeading(s.name) };
}));

app.post('/api/export/docx', async (req, res) => {
  try {
    const buf = await toDocx(req.body);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(req.body.filename || 'bibliography').replace(/[^\w .-]/g, '')}.docx"`);
    res.send(buf);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.post('/api/export/:format', wrap(async req => ({ text: toFormat(req.body.items || [], req.params.format) })));
app.post('/api/import', wrap(async req => ({ items: await parseImport(typeof req.body === 'string' ? req.body : req.body.text || '') })));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n  citemyshi is running → http://localhost:${PORT}\n`));
