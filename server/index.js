import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { citeUrl } from './extract.js';
import { detectInput, lookupDoi, lookupIsbn, lookupPmid, lookupArxiv, search } from './lookup.js';
import { formatBibliography, formatInText, searchStyles, loadStyle, bibliographyHeading } from './styles.js';
import { toDocx, toFormat, parseImport } from './export.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.disable('x-powered-by');
app.use(compression());

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
app.use('/api/cite', rateLimit(40, 60_000));
app.use('/api/export', rateLimit(60, 60_000));
app.use('/api/import', rateLimit(20, 60_000));
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
  const r = await cached(key, d.kind === 'search' ? 3600_000 : 6 * 3600_000, () => resolve(d, kind));
  // Fresh "accessed" date even when served from cache
  if (r.item) return { ...r, item: { ...r.item, ...(r.item.accessed ? { accessed: todayParts() } : {}) } };
  return r;
}));

const todayParts = () => { const t = new Date(); return { 'date-parts': [[t.getFullYear(), t.getMonth() + 1, t.getDate()]] }; };

async function resolve(d, kind) {
  switch (d.kind) {
    case 'url': { const r = await citeUrl(d.value); return { mode: 'item', ...r }; }
    case 'doi': return { mode: 'item', item: await lookupDoi(d.value), source: 'DOI' };
    case 'isbn': return { mode: 'item', item: await lookupIsbn(d.value), source: 'ISBN' };
    case 'pmid': return { mode: 'item', item: await lookupPmid(d.value), source: 'PubMed' };
    case 'arxiv': return { mode: 'item', item: await lookupArxiv(d.value), source: 'arXiv' };
    default: return { mode: 'results', results: await search(d.value, kind === 'website' || kind === 'video' ? 'all' : kind) };
  }
}

app.post('/api/format', wrap(async req => {
  const { items = [], style = 'apa', lang } = req.body;
  return formatBibliography({ items, style, lang });
}));

app.post('/api/intext', wrap(async req => formatInText(req.body)));

app.get('/api/styles', wrap(async req => searchStyles(String(req.query.q || ''))));
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
app.listen(PORT, () => {
  console.log(`\n  citemyshi is running → http://localhost:${PORT}\n`);
  // Warm up the popular styles so the first bibliography isn't slow
  const sample = [{ id: 'w', type: 'webpage', title: 'Warm up', issued: { 'date-parts': [[2020]] } }];
  (async () => { for (const st of ['apa', 'modern-language-association', 'harvard-cite-them-right', 'chicago-author-date', 'australian-guide-to-legal-citation']) await formatBibliography({ items: sample, style: st }).catch(() => {}); })();
});
