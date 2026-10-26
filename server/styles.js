// Style catalog search and style files. Formatting itself happens in the
// browser (public/js/format-worker.js), which keeps this server tiny.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEGREES } from '../public/js/degrees.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundledDir = path.join(root, 'public', 'styles'); // ships with the site
const cacheDir = path.join(root, 'data', 'style-cache'); // downloaded on demand

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
  ['australian-guide-to-legal-citation', 'AGLC 4th edition (Australian legal)'],
  ['oscola', 'OSCOLA'],
  ['apa-6th-edition', 'APA 6th edition'],
  ['turabian-notes-bibliography', 'Turabian 9th (notes & bibliography)'],
  ['turabian-author-date', 'Turabian 9th (author-date)'],
];

const styleCache = new Map(); // name -> { xml, title, isNote, defaultLocale }

function safeName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Invalid style name');
  return name;
}

async function fetchStyleXml(name) {
  for (const dir of [bundledDir, cacheDir]) {
    try { return await fsp.readFile(path.join(dir, `${name}.csl`), 'utf8'); } catch {}
  }
  if (!indexByName.has(name)) throw Object.assign(new Error(`There’s no citation style called “${name}”`), { status: 404 });
  const res = await fetch(`https://www.zotero.org/styles/${name}`, { headers: { 'User-Agent': 'citemyshi' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Couldn’t download the “${name}” style — try again`);
  const xml = await res.text();
  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.writeFile(path.join(cacheDir, `${name}.csl`), xml);
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

// The language list comes from the CSL locales bundled with the site
const localesMetaPath = path.join(root, 'public', 'locales', 'locales.json');
const localesMeta = fs.existsSync(localesMetaPath) ? JSON.parse(fs.readFileSync(localesMetaPath, 'utf8')) : { 'language-names': {} };
export const LANGUAGES = Object.entries(localesMeta['language-names']).map(([code, [native, english]]) => ({ code, native, english }))
  .sort((a, b) => a.english.localeCompare(b.english));

// Common abbreviations people search by
const ALIASES = {
  aglc: 'australian-guide-to-legal-citation', aglc4: 'australian-guide-to-legal-citation', 'aglc 4': 'australian-guide-to-legal-citation',
  aglc3: 'australian-guide-to-legal-citation-3rd-edition', mla: 'modern-language-association', apa: 'apa', apa7: 'apa', apa6: 'apa-6th-edition',
  harvard: 'harvard-cite-them-right', chicago: 'chicago-author-date', cmos: 'chicago-author-date', turabian: 'turabian-author-date',
  vancouver: 'nlm-citation-sequence', nlm: 'nlm-citation-sequence', ama: 'american-medical-association', asa: 'american-sociological-association',
  acs: 'american-chemical-society', apsa: 'american-political-science-association', bluebook: 'bluebook-law-review', mcgill: 'mcgill-en',
};
const acronym = t => t.replace(/\([^)]*\)/g, ' ').split(/[\s-]+/).filter(w => /^\p{Lu}/u.test(w)).map(w => w[0]).join('').toLowerCase();

const UNI = /\b(universit|college|school|institut|hochschule|polytechnic|école|ecole|academy of art)/i;
const NOT_UNI = /\b(journal|acta|annals|annales|bulletin|review|proceedings|abhandlungen|transactions|quarterly|revista|rivista|zeitschrift|studies|studia|magazine|letters|series|archives|research|reports|cahiers|anuario|anais|boletim|forum|science|mathematica)\b/i;

// q: free text. degree: one of DEGREES (limits to its subject fields/keywords).
// uni: only university/college house styles.
export function searchStyles(q, { limit = 40, degree, uni } = {}) {
  q = (q || '').toLowerCase().trim();
  const deg = degree ? DEGREES.find(d => d.id === degree) : null;
  if (!q && !deg && !uni) return POPULAR.map(([n, t]) => ({ name: n, title: t, popular: true }));
  const words = q ? q.split(/\s+/) : [];
  const curated = deg ? new Set(deg.styles.map(x => x[0])) : null;
  const scored = [];
  for (const s of styleIndex) {
    if (deg) {
      const inField = deg.fields.some(f => s.c?.includes(f));
      const inKeywords = deg.keywords?.some(k => s.t.toLowerCase().includes(k));
      if (!inField && !inKeywords && !curated.has(s.n)) continue;
    }
    if (uni && (!UNI.test(s.t) || NOT_UNI.test(s.t))) continue;
    let score = 0;
    if (q) {
      const acr = acronym(s.t);
      const hay = `${s.t} ${s.s || ''} ${s.n} ${acr}`.toLowerCase();
      const aliasHit = ALIASES[q] === s.n || ALIASES[q.replace(/\s+/g, '')] === s.n;
      const acrHit = q.replace(/\s|\d+(st|nd|rd|th)?$/g, '').length >= 3 && acr.startsWith(q.replace(/\s|\d+(st|nd|rd|th)?$/g, ''));
      if (!aliasHit && !acrHit && !words.every(w => hay.includes(w))) continue;
      if (aliasHit) score += 500;
      if (acrHit) score += 60;
      if (s.n === q || (s.s || '').toLowerCase() === q) score += 100;
      if (s.t.toLowerCase().startsWith(q)) score += 50;
      score -= s.t.length / 20;
    } else {
      score -= s.t.toLowerCase().charCodeAt(0) / 1000; // alphabetical when browsing
    }
    if (!s.d) score += 10;
    const pop = POPULAR.findIndex(([n]) => n === s.n);
    if (pop >= 0) score += 200 - pop;
    scored.push({ s, score });
  }
  if (!q) scored.sort((a, b) => a.s.t.localeCompare(b.s.t)); // browsing a subject: plain A–Z
  else scored.sort((a, b) => b.score - a.score);
  return {
    total: scored.length,
    results: scored.slice(0, limit).map(({ s }) => {
      const pop = POPULAR.find(([n]) => n === s.n);
      return { name: s.n, title: pop ? pop[1] : s.t, full: s.t, format: s.f };
    }),
  };
}

export function bibliographyHeading(styleName) {
  if (/^modern-language-association/.test(styleName)) return 'Works Cited';
  if (/^(apa|american-psychological)/.test(styleName)) return 'References';
  if (/^(chicago|turabian|australian-guide-to-legal|oscola|mhra|modern-humanities)/.test(styleName)) return 'Bibliography';
  if (/harvard/.test(styleName)) return 'Reference List';
  return 'References';
}
