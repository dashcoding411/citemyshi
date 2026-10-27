// The last step for every source we look up (DOI, ISBN, web page, PubMed…):
// fix the small things databases get wrong that cost marks — a lowercase
// subtitle, "Pearson Education, Inc.", a street address as the place of
// publication, "Eleventh edition", authors in ALL CAPS.
import { normalizeTitleCase } from './casing.js';
import { tidyEdition } from '../public/js/edition.js';

export { tidyEdition };

// ---------- titles ----------
// APA, Harvard, Vancouver…: capitalise the first word of a subtitle
// ("Context and contact: A comparison…"), but not words like "mRNA" or "eBay"
export function capitaliseSubtitle(title) {
  return String(title).replace(/([:?!]|\s[—–])(\s+)([‘“"'(]?)(\p{Ll}+)(?=[\s,;:.!?’”"')]|$)/gu, (m, p, sp, q, w) => `${p}${sp}${q}${w[0].toUpperCase()}${w.slice(1)}`);
}

export function tidyTitle(t) {
  if (!t) return t;
  let s = String(t).replace(/[‐‑]/g, '-').replace(/\s+/g, ' ').trim();
  s = s.replace(/(?<!\.\.)(?<!\b[A-Z])\.$/, ''); // "…in the United States." (keeps "U.S." and "…")
  if (/^\p{Ll}/u.test(s) && !/^\p{Ll}+\p{Lu}/u.test(s) && !/^(e|i)[A-Z-]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

// ---------- names ----------
const PARTICLE = /^(van|von|der|den|de|del|della|di|da|du|la|le|dos|das|ten|ter|bin|ibn|al|el)$/i;
function properCase(s) {
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())
    .replace(/\b(Mc)(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase())
    .split(' ').map((w, i) => (i > 0 && PARTICLE.test(w) ? w.toLowerCase() : w)).join(' ');
}
const shouting = s => /\p{L}{2}/u.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();
const whispering = s => /^\p{Ll}{2,}([\s-]\p{Ll}+)*$/u.test(s) && !PARTICLE.test(s);

export function tidyName(n) {
  if (!n || typeof n !== 'object') return n;
  if (n.literal) return { ...n, literal: n.literal.replace(/\s+/g, ' ').trim() };
  const out = { ...n };
  for (const k of ['family', 'given']) {
    const v = String(out[k] || '').replace(/\s+/g, ' ').trim();
    if (!v) continue;
    // "COULARDEAU" -> "Coulardeau", "MCDONALD" -> "McDonald"; leave initials ("J. S.", "JS") alone
    if (shouting(v) && !(k === 'given' && /^(\p{Lu}\.?\s?){1,3}$/u.test(v))) out[k] = properCase(v);
    else if (whispering(v)) out[k] = properCase(v);
    else out[k] = v;
  }
  return out;
}

const junkName = n => {
  const s = n.literal || `${n.given || ''} ${n.family || ''}`;
  return !s.trim() || /[;=<>{}|]|https?:|www\.|\d{3,}/.test(s) || /^(and|by|et al\.?|others|view all|more)$/i.test(s.trim());
};

export function tidyNames(list) {
  if (!Array.isArray(list)) return list;
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const n = tidyName(raw);
    if (!n || junkName(n)) continue;
    const key = (n.literal || `${n.family}|${n.given}`).toLowerCase().normalize('NFKD').replace(/[^\p{L}|]/gu, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

// ---------- publishers and places ----------
// APA 7 (9.29), MLA 9 and Chicago all drop business designations
export function tidyPublisher(p) {
  if (!p) return p;
  let s = String(p).replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*\((?=[^)]*\p{Lu}[^)]*\p{Lu})[\p{L}&.]{2,8}\)$/u, ''); // "Cambridge University Press (CUP)"
  for (let i = 0; i < 3; i++) s = s.replace(/,?\s+(Inc\.?|Incorporated|Ltd\.?|Limited|LLC|L\.L\.C\.|Pty\.?(\s+Ltd\.?)?|PLC|plc|GmbH(\s+&\s+Co\.?\s+KG)?|AG|BV|B\.V\.|N\.V\.|NV|S\.A\.|SA|S\.p\.A\.|Corp\.?|Corporation|Co\.)$/u, '').trim();
  return s.replace(/[,;:]$/, '').trim();
}

// Cities publishers are based in, for picking the city out of a postal address
const CITIES = ['New York', 'London', 'Oxford', 'Cambridge', 'Thousand Oaks', 'Los Angeles', 'Boston', 'Chicago', 'Philadelphia', 'San Francisco', 'Washington',
  'Berlin', 'Heidelberg', 'Cham', 'Dordrecht', 'Amsterdam', 'Singapore', 'New Delhi', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra',
  'Hobart', 'Darwin', 'Auckland', 'Wellington', 'Toronto', 'Montreal', 'Vancouver', 'Hoboken', 'Abingdon', 'Milton Park', 'Basingstoke', 'Edinburgh',
  'Manchester', 'Princeton', 'New Haven', 'Baltimore', 'Bristol', 'Bingley', 'Leeds', 'Oakland', 'Berkeley', 'Ithaca', 'Paris', 'Geneva', 'Tokyo',
  'Beijing', 'Shanghai', 'Hong Kong', 'Dublin', 'Glasgow', 'Cardiff', 'Burlington', 'Waltham', 'St. Louis', 'Atlanta', 'Austin', 'Seattle', 'Mahwah',
  'Hillsdale', 'Upper Saddle River', 'Champaign', 'Malden', 'Newbury Park', 'Basel', 'Zurich', 'Vienna', 'Munich', 'Stuttgart', 'Leiden', 'Rotterdam'];
export function tidyPlace(place) {
  if (!place) return place;
  let s = String(place).replace(/\s+/g, ' ').trim().replace(/[,;:\s]+$/, '');
  if (/\d/.test(s)) {
    // "1 Oliver's Yard, 55 City Road, London EC1Y 1SP United Kingdom" -> "London"
    const city = CITIES.find(c => new RegExp(`\\b${c.replace('.', '\\.')}\\b`).test(s));
    return city || undefined;
  }
  return s.replace(/\s*\[etc\.?\]$/i, '').replace(/^\[|\]$/g, '');
}

// ---------- journal names ----------
const MINOR = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'on', 'to', 'at', 'by', 'with', 'from', 'de', 'la', 'et']);
function titleCaseName(s) {
  return s.toLowerCase().split(' ').map((w, i) => (i > 0 && MINOR.has(w) ? w : w.replace(/^(\p{L})/u, c => c.toUpperCase()))).join(' ');
}

// ---------- the whole item ----------
export function tidyItem(item) {
  if (!item || typeof item !== 'object') return item;
  let out = { ...item };
  for (const k of ['title', 'container-title', 'collection-title']) if (out[k]) out[k] = tidyTitle(out[k]);
  out = normalizeTitleCase(out);
  // Sentence-case titles still need the subtitle capitalised (Crossref often has "…: a systematic review")
  if (out.title && (!out.language || /^en\b/i.test(out.language)) && !['legal_case', 'legislation', 'bill', 'post'].includes(out.type)) out.title = capitaliseSubtitle(out.title);
  // "JOURNAL OF ADVANCED NURSING" -> "Journal of Advanced Nursing"
  if (out['container-title'] && shouting(out['container-title']) && out['container-title'].length > 12) out['container-title'] = titleCaseName(out['container-title']);
  for (const role of ['author', 'editor', 'translator', 'director', 'interviewer', 'host', 'composer', 'performer', 'container-author', 'collection-editor']) {
    if (Array.isArray(out[role])) { out[role] = tidyNames(out[role]); if (!out[role].length) delete out[role]; }
  }
  if (out.publisher) out.publisher = tidyPublisher(out.publisher);
  if (out['publisher-place']) { out['publisher-place'] = tidyPlace(out['publisher-place']); if (!out['publisher-place']) delete out['publisher-place']; }
  if (out.edition != null) { out.edition = tidyEdition(out.edition); if (!out.edition) delete out.edition; }
  if (out.type === 'article-journal') delete out.editor;
  return out;
}
