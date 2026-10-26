// Sentence case for titles, the way APA, Harvard, Vancouver and AMA want them:
// "How Much Do Disasters Cost? A Comparison of Estimates in Australia"
//   -> "How much do disasters cost? A comparison of estimates in Australia"
// CSL expects titles stored like this; title-case styles (MLA, Chicago)
// capitalise them again automatically. A word is only lowercased when the
// dictionary says it's an ordinary word — names, places, acronyms and
// anything unknown keep their capitals.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let LOWER = new Set();
let PROPER = new Map();
try {
  const w = JSON.parse(fs.readFileSync(path.join(root, 'data', 'words.json'), 'utf8'));
  LOWER = new Set(w.lower);
  PROPER = new Map(Object.entries(w.proper));
} catch { /* without the word list, titles are left exactly as found */ }

// Ordinary words that are also names somewhere ("China"/"china") stay
// capitalised only if they're on this list of real names.
const KEEP_PROPER = new Set(['january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'china', 'turkey', 'jordan', 'chad', 'georgia', 'guinea', 'japan',
  'polish', 'god', 'bible', 'christian', 'christianity', 'catholic', 'protestant', 'jesus', 'christ', 'islam', 'islamic', 'muslim', 'jewish',
  'buddhist', 'hindu', 'aboriginal', 'indigenous', 'latin', 'greek', 'roman', 'olympic', 'olympics', 'easter', 'christmas', 'ramadan', 'i']);

// Words that start or end multi-word names: "New South Wales", "United Kingdom",
// "Great Barrier Reef", "Middle Ages", "Monash University", "Sydney Harbour"
const NAME_START = new Set(['national', 'state', 'new', 'north', 'south', 'east', 'west', 'northern', 'southern', 'eastern', 'western', 'central', 'united', 'great', 'greater',
  'saint', 'st', 'middle', 'upper', 'lower', 'king', 'queen', 'prince', 'princess', 'lake', 'mount', 'mt', 'cape', 'port', 'fort', 'sir', 'lord', 'lady',
  'royal', 'red', 'black', 'dead', 'holy', 'cold', 'world', 'first', 'second', 'supreme', 'high', 'federal', 'golden', 'silicon', 'wall', 'white', 'stolen']);
const NAME_END = new Set(['school', 'isle', 'kingdom', 'states', 'nations', 'union', 'republic', 'ages', 'war', 'wars', 'island', 'islands', 'ocean', 'sea', 'river', 'reef',
  'bay', 'gulf', 'mountains', 'valley', 'desert', 'street', 'house', 'court', 'generations', 'coast', 'territory', 'province', 'peninsula', 'empire',
  'dynasty', 'revolution', 'organization', 'organisation', 'bank', 'council', 'assembly', 'parliament', 'senate', 'congress', 'department', 'ministry',
  'university', 'college', 'institute', 'hospital', 'foundation', 'museum', 'library', 'forest', 'canal', 'strait', 'falls', 'harbour', 'harbor',
  'centre', 'center', 'games', 'cup', 'times', 'post', 'territories', 'zealand', 'africa', 'america', 'wales', 'europe', 'asia']);

const stems = w => {
  const c = [w];
  if (w.endsWith('ies')) c.push(`${w.slice(0, -3)}y`);
  if (w.endsWith('es')) c.push(w.slice(0, -2));
  if (w.endsWith('s')) c.push(w.slice(0, -1));
  if (w.endsWith('ied')) c.push(`${w.slice(0, -3)}y`);
  if (w.endsWith('ed')) c.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -3));
  if (w.endsWith('ing')) c.push(w.slice(0, -3), `${w.slice(0, -3)}e`, w.slice(0, -4));
  if (w.endsWith('ly')) c.push(w.slice(0, -2), `${w.slice(0, -3)}y`);
  if (/(er|or)s?$/.test(w)) c.push(w.replace(/(er|or)s?$/, ''), w.replace(/rs?$/, ''));
  if (w.endsWith('est')) c.push(w.slice(0, -3), w.slice(0, -2));
  if (w.endsWith('ness')) c.push(w.slice(0, -4));
  if (/ments?$/.test(w)) c.push(w.replace(/ments?$/, ''));
  if (/(ity|ities)$/.test(w)) c.push(w.replace(/(ity|ities)$/, ''), w.replace(/(ity|ities)$/, 'e'));
  // Prefixed forms the dictionaries build from affix rules
  const pre = w.match(/^(dis|un|re|in|im|ir|il|non|mis|pre|post|over|under|sub|super|inter|intra|anti|counter|co|de|multi|self|semi|micro|macro|cyber|neuro|bio|eco|geo|tele|trans|hyper)(.{3,})$/);
  if (pre) c.push(pre[2]);
  return c;
};
const known = w => stems(w).some(c => LOWER.has(c));
// A real name: never written in lowercase ("Australia", "Wales"), or a known ambiguous name
const isName = w => { w = w.toLowerCase().replace(/[’']s$/, ''); return KEEP_PROPER.has(w) || (!known(w) && PROPER.has(w)); };
const isOrdinary = w => { w = w.toLowerCase().replace(/[’']s$/, ''); return !KEEP_PROPER.has(w) && known(w); };

const isAcronymOrOdd = word => {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (!letters) return true;
  if (letters.length > 1 && letters === letters.toUpperCase()) return true; // NASA, COVID, UK
  if (/\d/.test(word)) return true; // COVID-19, 3D, H1N1
  if (/\p{Ll}\p{Lu}/u.test(word)) return true; // iPhone, McDonald, LaTeX
  return false;
};

// Is this title written in Title Case (most longer words capitalised)?
export function looksTitleCased(title) {
  const words = title.split(/\s+/).map(w => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')).filter(w => w.length > 3);
  if (words.length < 2) return false;
  const caps = words.filter(w => /^\p{Lu}/u.test(w)).length;
  return caps / words.length >= 0.7;
}

export function toSentenceCase(title) {
  if (!title || !LOWER.size) return title;
  const letters = title.replace(/[^\p{L}]/gu, '');
  const allCaps = letters.length > 3 && letters === letters.toUpperCase();
  if (!allCaps && !looksTitleCased(title)) return title; // already sentence case, or deliberate

  // Tokens: words keep their surrounding punctuation so we can rebuild exactly
  const parts = title.split(/(\s+)/);
  const words = [];
  let sentenceStart = true;
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];
    if (!token || /^\s+$/.test(token)) continue;
    const [, lead, core, trail] = token.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    if (core) {
      words.push({ i, lead, core, trail, start: sentenceStart, cap: /^\p{Lu}/u.test(core) });
      sentenceStart = false;
    }
    // A new "sentence" starts after : ? ! . and dashes (APA capitalises subtitles)
    if (/[:?!.]$/.test(trail) || /^[–—-]+$/.test(token)) sentenceStart = true;
  }

  // Pass 1: decide each word on its own
  for (const w of words) {
    const subparts = w.core.split('-');
    w.out = subparts.map((part, k) => {
      if (!part) return part;
      const lowerPart = part.toLowerCase();
      if (w.start && k === 0) return allCaps ? lowerPart[0].toUpperCase() + lowerPart.slice(1) : part;
      if (allCaps) {
        if (/\d/.test(part)) return part;
        if (isName(lowerPart)) return PROPER.get(lowerPart.replace(/[’']s$/, '')) ? part[0] + lowerPart.slice(1) : part;
        if (part.length <= 3 && !known(lowerPart)) return part; // UK, USA, EU
        return isOrdinary(lowerPart) ? lowerPart : part[0] + lowerPart.slice(1);
      }
      if (isAcronymOrOdd(part) || !/^\p{Lu}/u.test(part)) return part;
      if (part.length === 1 && part !== 'A') return part; // Gen Z, Plan B, Vitamin D
      return isOrdinary(part) ? lowerPart : part;
    }).join('-');
    w.kept = w.out !== w.out.toLowerCase();
  }

  // Pass 2: keep multi-word names together ("New South Wales", "Great Barrier Reef")
  for (let a = 0; a < words.length; a++) {
    const head = words[a].core.toLowerCase();
    if (!words[a].cap || !(NAME_START.has(head) || isName(head))) continue;
    let end = -1;
    for (let b = a + 1; b < Math.min(words.length, a + 5); b++) {
      if (!words[b].cap || words[b].start || /[,:;?!.]$/.test(words[b - 1].trail)) break;
      const tail = words[b].core.toLowerCase();
      if (NAME_END.has(tail) || isName(tail)) end = b;
    }
    if (end > a && (NAME_START.has(head) || NAME_END.has(words[end].core.toLowerCase()))) {
      for (let k = a; k <= end; k++) {
        const w = words[k];
        if (!w.kept) { w.out = allCaps ? w.core[0] + w.core.slice(1).toLowerCase() : w.core; w.kept = true; }
      }
    }
  }

  // "University of Sydney", "Bank of England", "Gulf of Mexico": keep the institution word
  for (let a = 0; a + 2 < words.length; a++) {
    if (!words[a].cap || !NAME_END.has(words[a].core.toLowerCase()) || words[a + 1].core !== 'of') continue;
    const target = words[a + 2].core.toLowerCase() === 'the' ? words[a + 3] : words[a + 2];
    if (target && (isName(target.core.toLowerCase()) || target.kept && target.cap && !target.start)) {
      words[a].out = allCaps ? words[a].core[0] + words[a].core.slice(1).toLowerCase() : words[a].core;
      if (a > 0 && words[a - 1].cap && NAME_START.has(words[a - 1].core.toLowerCase())) words[a - 1].out = words[a - 1].core;
    }
  }

  for (const w of words) parts[w.i] = w.lead + w.out + w.trail;
  return parts.join('');
}

// CSL stores titles in sentence case. Apply to the work's own title for
// English items; journal/website names and legal titles keep their casing.
const SKIP_TYPES = new Set(['legal_case', 'legislation', 'bill', 'treaty', 'regulation', 'hearing', 'patent', 'standard']);
export function normalizeTitleCase(item) {
  if (!item?.title || SKIP_TYPES.has(item.type)) return item;
  if (item.language && !/^en\b/i.test(item.language)) return item;
  const sentence = toSentenceCase(item.title);
  if (sentence !== item.title) return { ...item, title: sentence, _titleAsPublished: item.title };
  return item;
}
