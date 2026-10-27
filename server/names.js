// Name + date helpers shared by the scrapers.

const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'du', 'la', 'le', 'dos', 'das', 'ten', 'ter', 'bin', 'ibn', 'al', 'el', 'st.', 'mac']);
const SUFFIXES = /^(jr\.?|sr\.?|ii|iii|iv|v|phd|ph\.d\.|md|m\.d\.|esq\.?)$/i;
const CREDENTIALS = 'BSc|BS|BA|BEd|MS|MSc|MA|MD|PhD|DO|RN|RD|RDN|LD|LDN|CDN|CDE|CDCES|MPH|MBA|PharmD|DPT|NP|PA-C|PA|CPT|FACS|MFA|JD|LCSW|LPC|PsyD|DDS|DMD|EdD|CNS|IBCLC|CSCS|MEd|ACE|FNP|FNP-C|APRN|CPH|DVM|MPhil|DPhil|BSN|MSN|CRNA|OTR|DC|RPh|FAAP|FACP|CHES|CPA|CFA|CFP|PE|LMFT|LMHC|ATC|CNM|MHS|MSW|ScD|DrPH|MPP|LLM|LLB|FRCP|MRCP|MBBS|MBChB';
const CRED_RE = new RegExp(`(?:,?\\s+(?:${CREDENTIALS})\\.?)+$`);
export const isCredential = s => new RegExp(`^(?:${CREDENTIALS})\\.?$`).test(s.trim());

const ORG_WORDS = /\b(inc|llc|ltd|corp|corporation|company|co\.|news|press|association|associated|society|institute|university|college|school|department|dept|agency|organization|organisation|foundation|council|committee|board|ministry|office|bureau|staff|team|editors|editorial|desk|reporters?|contributors|wire|media|group|network|times|post|journal|magazine|daily|reuters|bbc|cnn|npr|afp|nasa|government|centre|center|services|commission|authority|bank|trust|club|union|museum|library|hospital|clinic|church|project|lab|labs|wikipedia|nations|national|international|federation|alliance|coalition|parliament|senate|tribunal|court|police|statistics|health|website|channel|program|programme|initiative|partnership|institution|academy|consortium|secretariat|commonwealth|shire|cancer|research|world|global)\b/i;

export function titleCaseName(s) {
  if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  if (!/\s/.test(s) && s.length <= 6) return s; // acronyms: CDC, NASA, UNICEF
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
}

export function looksLikeOrg(s) {
  if (!s) return false;
  const words = s.trim().split(/\s+/);
  if (words.length === 1) return /^[A-Z0-9&.-]{2,}$/.test(s) || /\.(com|org|net|io|co)$/i.test(s) || ORG_WORDS.test(s);
  if (words.length > 4) return true;
  return ORG_WORDS.test(s) || /[&@|:]/.test(s) || /\d/.test(s);
}

// "John A. Smith", "Smith, John A.", "Ludwig van Beethoven", "Martin Luther King Jr."
export function parseName(raw, { forcePerson = false } = {}) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim()
    .replace(/^(by|written by|words by|author:?|posted by|reviewed by)\s+/i, '')
    .replace(/^(dr|prof|professor|mr|mrs|ms|mx|sir|dame)\.?\s+/i, '')
    .replace(CRED_RE, '')
    .replace(/\s*\((?:[^)]*)\)\s*$/, '')
    .replace(/[,;|]\s*$/, '')
    .trim();
  if (!s) return null;
  s = titleCaseName(s);
  if (!forcePerson && looksLikeOrg(s)) return { literal: s };

  if (s.includes(',')) {
    const [family, given, suffix] = s.split(',').map(x => x.trim());
    if (family && given && !SUFFIXES.test(given)) {
      const n = { family, given };
      if (suffix && SUFFIXES.test(suffix)) n.suffix = suffix;
      return n;
    }
    s = s.replace(/,/g, '');
  }

  const parts = s.split(' ');
  if (parts.length === 1) return { literal: s };
  let suffix;
  if (SUFFIXES.test(parts[parts.length - 1]) && parts.length > 2) suffix = parts.pop();
  // Find start of family name: first lowercase particle after the first word
  let famStart = parts.length - 1;
  for (let i = 1; i < parts.length - 1; i++) {
    if (PARTICLES.has(parts[i].toLowerCase()) && parts[i] === parts[i].toLowerCase()) { famStart = i; break; }
  }
  const given = parts.slice(0, famStart).join(' ');
  let familyParts = parts.slice(famStart);
  const n = { given };
  const particles = [];
  while (familyParts.length > 1 && PARTICLES.has(familyParts[0].toLowerCase()) && familyParts[0] === familyParts[0].toLowerCase()) particles.push(familyParts.shift());
  n.family = familyParts.join(' ');
  if (particles.length) n['non-dropping-particle'] = particles.join(' ');
  if (suffix) n.suffix = suffix;
  return n;
}

// A plausible person's name from a visible byline: "Jane Smith", "J. R. R. Tolkien",
// "Ludwig van Beethoven" — not "Print", "View all releases" or "Population"
const UI_WORDS = /^(print|share|email|e-mail|facebook|twitter|linkedin|whatsapp|copy|link|menu|home|search|subscribe|log ?in|sign ?in|sign ?up|register|view|all|more|read|follow|contact|about|next|previous|back|top|releases?|download|listen|watch|comments?|reply|tags?|topics?|categories|news|latest|popular)$/i;
const MONTH_WORD = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)$/i;
export function looksLikePersonName(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim().replace(/^(by|written by|words by|posted by)\s+/i, '');
  if (!t || t.length > 60 || /\d|[|@#:;?!()]/.test(t)) return false;
  const words = t.split(' ');
  if (words.length < 2 || words.length > 5) return false;
  if (words.some(w => UI_WORDS.test(w) || MONTH_WORD.test(w))) return false;
  return words.every(w => /^\p{Lu}[\p{L}'’.-]*$/u.test(w) || /^(van|von|der|den|de|del|della|di|da|du|la|le|dos|das|ten|ter|bin|ibn|al|el)$/.test(w));
}

// Splits "A, B and C" / "A & B" / "A; B" lists into individual names
export function splitAuthors(raw) {
  if (!raw) return [];
  let s = String(raw).replace(/\s+/g, ' ').trim().replace(/^(by|written by|words by|posted by)\s+/i, '');
  if (!s) return [];
  // "Department of Health & Human Services", "Department of Health, Disability and Ageing":
  // one organisation, not several people
  if (!/;/.test(s) && /^(the\s+)?(australian government\s+)?(department|ministry|office|bureau|institute|centre|center|council|commission|agency|national|australian|world|united|international)\b/i.test(s)
    && !s.split(/\s*(?:,|\band\b|&)\s*/).every(p => looksLikePersonName(p))) return [s];
  if (s.includes(';')) return s.split(';').map(x => x.trim()).filter(Boolean);
  const hadConjunction = /\s(?:and|&)\s/i.test(s);
  s = s.replace(/\s*(?:,\s*)?(?:\band\b|&)\s+/gi, ', ');
  const parts = s.split(',').map(x => x.trim()).filter(Boolean);
  // "Smith, John A." is one inverted name, not two people
  if (parts.length === 2 && !hadConjunction && !parts[0].includes(' ') && !SUFFIXES.test(parts[1])) return [`${parts[0]}, ${parts[1]}`];
  return parts.filter(p => !SUFFIXES.test(p) && !isCredential(p));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// Returns CSL date object { 'date-parts': [[y, m, d]] } or null
export function parseDate(raw, { dayFirst = false } = {}) {
  if (raw == null) return null;
  if (typeof raw === 'number') raw = raw > 1e11 ? new Date(raw).toISOString() : raw > 1e9 ? new Date(raw * 1000).toISOString() : String(raw);
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d{10}(\d{3})?$/.test(s)) return parseDate(Number(s));
  s = s.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, ''); // Thu, 17/09/2026
  let m;
  // ISO / yyyy-mm-dd / yyyy/mm/dd / yyyymmdd
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?/))) {
    const [y, mo, d] = [+m[1], +m[2], m[3] ? +m[3] : undefined];
    if (mo >= 1 && mo <= 12) return mk(y, mo, d);
  }
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return mk(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})$/))) return mk(+m[1]);
  // "January 2, 2020" / "Jan 2 2020" / "2 January 2020" / "January 2020"
  const lower = s.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
  if ((m = lower.match(/\b([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MONTHS[m[1].slice(0, 3)]) return mk(+m[3], MONTHS[m[1].slice(0, 3)], +m[2]);
  if ((m = lower.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/)) && MONTHS[m[2].slice(0, 3)]) return mk(+m[3], MONTHS[m[2].slice(0, 3)], +m[1]);
  if ((m = lower.match(/\b([a-z]{3,9})\.?\s+(\d{4})\b/)) && MONTHS[m[1].slice(0, 3)]) return mk(+m[2], MONTHS[m[1].slice(0, 3)]);
  // dd/mm/yyyy or mm/dd/yyyy (also with - or .): unambiguous when one part is over 12,
  // otherwise US order unless the site is from a day-first country
  if ((m = s.match(/(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/))) {
    const a = +m[1], b = +m[2];
    return a > 12 || (dayFirst && b <= 12) ? mk(+m[3], b, a) : mk(+m[3], a, b);
  }
  if ((m = s.match(/\b(1[5-9]\d\d|20\d\d)\b/))) return mk(+m[1]);
  return null;
}

function mk(y, m, d) {
  if (!y || y < 1000 || y > 2200) return null;
  const parts = [y];
  if (m) { parts.push(m); if (d && d >= 1 && d <= 31) parts.push(d); }
  return { 'date-parts': [parts] };
}

export function today() {
  const d = new Date();
  return { 'date-parts': [[d.getFullYear(), d.getMonth() + 1, d.getDate()]] };
}

export function cleanText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}
