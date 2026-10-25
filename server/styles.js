import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const CSL = require('citeproc');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'data', 'styles');
const localesDir = path.join(root, 'data', 'locales');

const indexPath = path.join(root, 'data', 'styles-index.json');
export const styleIndex = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
const indexByName = new Map(styleIndex.map(s => [s.n, s]));

// Curated list shown at the top of the picker, MyBib-style.
export const POPULAR = [
  ['apa', 'APA 7th edition'],
  ['modern-language-association', 'MLA 9th edition'],
  ['chicago-author-date', 'Chicago 18th (author-date)'],
  ['chicago-notes-bibliography', 'Chicago 18th (notes & bibliography)'],
  ['harvard-cite-them-right', 'Harvard (Cite Them Right)'],
  ['ieee', 'IEEE'],
  ['nlm-citation-sequence', 'Vancouver (NLM)'],
  ['american-medical-association', 'AMA 11th edition'],
  ['american-sociological-association', 'ASA'],
  ['american-chemical-society', 'ACS'],
  ['american-political-science-association', 'APSA'],
  ['oscola', 'OSCOLA'],
  ['apa-6th-edition', 'APA 6th edition'],
  ['turabian-notes-bibliography', 'Turabian 9th (notes & bibliography)'],
  ['turabian-author-date', 'Turabian 9th (author-date)'],
];

const styleCache = new Map(); // name -> { xml, title, isNote, defaultLocale }
const localeCache = new Map();

function safeName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Invalid style name');
  return name;
}

async function fetchStyleXml(name) {
  const file = path.join(stylesDir, `${name}.csl`);
  try { return await fsp.readFile(file, 'utf8'); } catch {}
  const res = await fetch(`https://www.zotero.org/styles/${name}`, { headers: { 'User-Agent': 'citemyshi' } });
  if (!res.ok) throw new Error(`Style "${name}" not found`);
  const xml = await res.text();
  await fsp.mkdir(stylesDir, { recursive: true });
  await fsp.writeFile(file, xml);
  return xml;
}

export async function loadStyle(name) {
  name = safeName(name);
  if (styleCache.has(name)) return styleCache.get(name);
  let xml = await fetchStyleXml(name);
  const title = (xml.match(/<title>([^<]*)<\/title>/) || [])[1] || indexByName.get(name)?.t || name;
  let defaultLocale = (xml.match(/<style[^>]*default-locale="([^"]+)"/) || [])[1];
  // Dependent styles just point at a parent style.
  const parent = xml.match(/<link[^>]*href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"[^>]*rel="independent-parent"/)
    || xml.match(/<link[^>]*rel="independent-parent"[^>]*href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"/);
  if (parent) {
    const p = await loadStyle(parent[1]);
    xml = p.xml;
    defaultLocale = defaultLocale || p.defaultLocale;
  }
  const isNote = /<style[^>]*class="note"/.test(xml);
  const style = { name, xml, title: decodeEntities(title), isNote, defaultLocale };
  styleCache.set(name, style);
  return style;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function retrieveLocale(lang) {
  if (localeCache.has(lang)) return localeCache.get(lang);
  const candidates = [lang, { en: 'en-US', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-BR', nl: 'nl-NL' }[lang.split('-')[0]], 'en-US'];
  for (const c of candidates) {
    if (!c) continue;
    const f = path.join(localesDir, `locales-${c}.xml`);
    if (fs.existsSync(f)) {
      const xml = fs.readFileSync(f, 'utf8');
      localeCache.set(lang, xml);
      return xml;
    }
  }
  return false;
}

export function searchStyles(q, limit = 40) {
  q = (q || '').toLowerCase().trim();
  if (!q) return POPULAR.map(([n, t]) => ({ name: n, title: t, popular: true }));
  const words = q.split(/\s+/);
  const scored = [];
  for (const s of styleIndex) {
    const hay = `${s.t} ${s.s || ''} ${s.n}`.toLowerCase();
    if (!words.every(w => hay.includes(w))) continue;
    let score = 0;
    if (s.n === q || (s.s || '').toLowerCase() === q) score += 100;
    if (s.t.toLowerCase().startsWith(q)) score += 50;
    if (!s.d) score += 10;
    const pop = POPULAR.findIndex(([n]) => n === s.n);
    if (pop >= 0) score += 200 - pop;
    score -= s.t.length / 20;
    scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ s }) => {
    const pop = POPULAR.find(([n]) => n === s.n);
    return { name: s.n, title: pop ? pop[1] : s.t, full: s.t, format: s.f };
  });
}

// citeproc doesn't like stray fields; keep it clean.
function sanitizeItem(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === '' || v == null) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (k.startsWith('_')) continue;
    out[k] = v;
  }
  for (const role of ['author', 'editor', 'translator', 'director', 'performer', 'composer', 'interviewer', 'recipient', 'illustrator', 'container-author', 'collection-editor', 'editorial-director', 'producer', 'host', 'guest', 'narrator', 'compiler', 'contributor', 'executive-producer', 'chair', 'organizer', 'curator']) {
    if (!out[role]) continue;
    out[role] = out[role]
      .map(n => n.literal ? { literal: n.literal } : { given: n.given || undefined, family: n.family || undefined, suffix: n.suffix || undefined, 'non-dropping-particle': n['non-dropping-particle'] || undefined, 'dropping-particle': n['dropping-particle'] || undefined })
      .filter(n => n.literal || n.family || n.given);
    if (!out[role].length) delete out[role];
  }
  for (const d of ['issued', 'accessed', 'original-date', 'event-date', 'submitted']) {
    const v = out[d];
    if (!v) continue;
    if (v.raw && !v['date-parts']) continue;
    const parts = (v['date-parts']?.[0] || []).map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (!parts.length) { if (v.literal) out[d] = { literal: v.literal }; else delete out[d]; continue; }
    out[d] = { 'date-parts': [parts] };
    if (v.season) out[d].season = v.season;
    if (v.circa) out[d].circa = true;
  }
  out.type = out.type || 'webpage';
  return out;
}

// Building an engine parses the whole style (slow for big ones like Chicago),
// so engines are cached per style+locale and fed fresh items each call.
const engineCache = new Map();
function makeEngine(style, items, lang) {
  const key = `${style.name}|${lang || ''}`;
  let cached = engineCache.get(key);
  if (!cached) {
    const sys = { retrieveLocale, retrieveItem: id => cached.map.get(String(id)) };
    cached = { map: new Map(), engine: null };
    cached.engine = new CSL.Engine(sys, style.xml, lang || style.defaultLocale || 'en-US', true);
    engineCache.set(key, cached);
    if (engineCache.size > 30) engineCache.delete(engineCache.keys().next().value);
  }
  cached.map = new Map(items.map(i => [String(i.id), i]));
  cached.engine.updateItems([]);
  cached.engine.updateItems([...cached.map.keys()]);
  return cached.engine;
}

export async function formatBibliography({ items, style: styleName = 'apa', lang }) {
  const style = await loadStyle(styleName);
  // Notes double as annotations in annotated-bibliography styles
  const annotated = /annotated/.test(style.name);
  const clean = items.map(i => sanitizeItem({ ...i, id: String(i.id), note: annotated && i._note ? i._note : i.note }));
  if (!clean.length) return { style: { name: style.name, title: style.title, isNote: style.isNote }, entries: [], params: {} };

  const engine = makeEngine(style, clean, lang);
  engine.setOutputFormat('html');
  let params = {}, htmlEntries = [];
  const hasBib = !!engine.bibliography;
  if (hasBib) {
    const bib = engine.makeBibliography();
    if (bib) { params = bib[0]; htmlEntries = bib[1]; }
  }

  const ids = hasBib && params.entry_ids ? params.entry_ids.map(x => String(x[0] ?? x)) : clean.map(i => i.id);

  // In-text citations (parenthetical + narrative)
  const intext = {};
  for (const id of ids) {
    try {
      const paren = engine.makeCitationCluster([{ id }]);
      let narrative = '';
      if (!style.isNote) {
        const authorOnly = engine.makeCitationCluster([{ id, 'author-only': true }]);
        const rest = engine.makeCitationCluster([{ id, 'suppress-author': true }]);
        const np = /\[?NO_PRINTED_FORM\]?/g;
        const a = authorOnly.replace(np, '').trim();
        const restClean = rest.replace(np, '').replace(/^\(\s*\)$|^\[\s*\]$/, '').trim();
        if (a && authorOnly !== paren) narrative = restClean ? `${a} ${restClean}` : a;
      }
      intext[id] = { paren, narrative };
    } catch { intext[id] = { paren: '', narrative: '' }; }
  }

  // Plain text versions
  let textEntries = [];
  if (hasBib) {
    engine.setOutputFormat('text');
    const tb = engine.makeBibliography();
    if (tb) textEntries = tb[1];
  } else {
    // Styles without bibliography (some note styles): use full citation as entry
    for (const id of ids) {
      htmlEntries.push(`<div class="csl-entry">${intext[id].paren}</div>`);
      textEntries.push(intext[id].paren.replace(/<[^>]+>/g, ''));
    }
  }

  const entries = ids.map((id, i) => ({
    id,
    html: (htmlEntries[i] || '').trim(),
    text: decodeEntities((textEntries[i] || '').trim()),
    intext: intext[id],
  }));

  return {
    style: { name: style.name, title: style.title, isNote: style.isNote },
    params: {
      hangingIndent: !!params.hangingindent,
      secondFieldAlign: params['second-field-align'] || false,
      lineSpacing: params.linespacing || 1,
      entrySpacing: params.entryspacing || 1,
      maxOffset: params.maxoffset || 0,
    },
    entries,
  };
}

export function bibliographyHeading(styleName) {
  if (/^modern-language-association/.test(styleName)) return 'Works Cited';
  if (/^(apa|american-psychological)/.test(styleName)) return 'References';
  if (/^(chicago|turabian)/.test(styleName)) return 'Bibliography';
  if (/harvard/.test(styleName)) return 'Reference List';
  return 'References';
}

// Single in-text citation with an optional locator ("p. 12", "chap. 3", …)
export async function formatInText({ item, style: styleName = 'apa', lang, locator, label = 'page' }) {
  const style = await loadStyle(styleName);
  const clean = sanitizeItem({ ...item, id: String(item.id) });
  const engine = makeEngine(style, [clean], lang);
  engine.setOutputFormat('html');
  const cite = { id: clean.id };
  if (locator) { cite.locator = String(locator); cite.label = label; }
  const paren = engine.makeCitationCluster([cite]);
  let narrative = '';
  if (!style.isNote) {
    const np = /\[?NO_PRINTED_FORM\]?/g;
    const a = engine.makeCitationCluster([{ ...cite, 'author-only': true }]).replace(np, '').trim();
    const rest = engine.makeCitationCluster([{ ...cite, 'suppress-author': true }]).replace(np, '').replace(/^\(\s*\)$|^\[\s*\]$/, '').trim();
    if (a && a !== paren) narrative = rest ? `${a} ${rest}` : a;
  }
  return { paren, narrative, isNote: style.isNote };
}
