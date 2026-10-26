// Citation formatting runs here, in a background worker in the student's own
// browser: instant results, no server round trip, and the server stays light
// enough for free hosting no matter how many people use it.
import CSL from '../vendor/citeproc.js';
import { API_BASE } from './config.js';

const styles = new Map();  // name -> Promise<{ name, title, isNote, defaultLocale, xml }>
const locales = new Map(); // code -> xml
let localesMeta = null;
const engines = new Map(); // `${style}|${lang}` -> { engine, map }; big styles use ~100MB each, so keep 2

const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#38;/g, '&').replace(/&#60;/g, '<').replace(/&#62;/g, '>');

async function getText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseStyle(xml) {
  const parent = xml.match(/<link[^>]*href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"[^>]*rel="independent-parent"/)
    || xml.match(/<link[^>]*rel="independent-parent"[^>]*href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"/);
  return {
    title: decode((xml.match(/<title>([^<]*)<\/title>/) || [])[1]),
    defaultLocale: (xml.match(/<style[^>]*default-locale="([^"]+)"/) || [])[1],
    isNote: /<style[^>]*class="note"/.test(xml),
    parent: parent?.[1],
  };
}

// The most-used styles ship with the website; anything else comes from the server.
function loadStyle(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return Promise.reject(new Error('Invalid style name'));
  if (styles.has(name)) return styles.get(name);
  const p = (async () => {
    let xml = null;
    try { xml = await getText(`/styles/${name}.csl`); if (!/<style[\s>]/.test(xml)) xml = null; } catch {}
    if (!xml) {
      let res;
      try { res = await fetch(`${API_BASE}/api/csl/${name}`); } catch { throw new Error('Can’t reach the citation server to load this style. Check your connection.'); }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn’t load the “${name}” style`);
      return res.json();
    }
    const info = parseStyle(xml);
    if (info.parent) {
      const parent = await loadStyle(info.parent);
      return { name, title: info.title || parent.title, isNote: parent.isNote, defaultLocale: info.defaultLocale || parent.defaultLocale, xml: parent.xml };
    }
    return { name, title: info.title || name, isNote: info.isNote, defaultLocale: info.defaultLocale, xml };
  })();
  styles.set(name, p);
  p.catch(() => styles.delete(name));
  return p;
}

async function ensureLocale(lang) {
  localesMeta ||= await fetch('/locales/locales.json').then(r => r.json()).catch(() => ({ 'primary-dialects': {} }));
  const base = String(lang).split('-')[0];
  for (const code of [lang, localesMeta['primary-dialects']?.[base], 'en-US']) {
    if (!code) continue;
    if (locales.has(code)) return code;
    try { locales.set(code, await getText(`/locales/locales-${code}.xml`)); return code; } catch {}
  }
  return 'en-US';
}

function retrieveLocale(code) {
  if (locales.has(code)) return locales.get(code);
  const base = String(code).split('-')[0];
  const dialect = localesMeta?.['primary-dialects']?.[base];
  if (dialect && locales.has(dialect)) return locales.get(dialect);
  for (const [k, v] of locales) if (k.startsWith(`${base}-`)) return v;
  return locales.get('en-US') || false;
}

const ROLES = ['author', 'editor', 'translator', 'director', 'performer', 'composer', 'interviewer', 'recipient', 'illustrator', 'container-author', 'collection-editor', 'editorial-director', 'producer', 'host', 'guest', 'narrator', 'compiler', 'contributor', 'executive-producer', 'chair', 'organizer', 'curator'];

// citeproc is picky about stray or empty fields
function sanitizeItem(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === '' || v == null || (Array.isArray(v) && !v.length) || k.startsWith('_')) continue;
    out[k] = v;
  }
  for (const role of ROLES) {
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

async function prepare(styleName, lang) {
  const style = await loadStyle(styleName);
  const want = lang || style.defaultLocale || 'en-US';
  const code = await ensureLocale(want);
  if (code !== 'en-US') await ensureLocale('en-US');
  return { style, lang: code };
}

// Engines are expensive to build, so reuse them and just swap the items in.
function engineFor(style, lang, items, { throwaway } = {}) {
  const key = `${style.name}|${lang}`;
  let entry = engines.get(key);
  if (!entry) {
    const holder = { map: new Map() };
    holder.engine = new CSL.Engine({ retrieveLocale, retrieveItem: id => holder.map.get(String(id)) }, style.xml, lang, true);
    entry = holder;
    if (!throwaway) {
      engines.set(key, entry);
      while (engines.size > 2) engines.delete(engines.keys().next().value);
    }
  } else { engines.delete(key); engines.set(key, entry); } // mark recently used
  entry.map = new Map(items.map(i => [String(i.id), i]));
  entry.engine.updateItems([]);
  entry.engine.updateItems([...entry.map.keys()]);
  return entry.engine;
}

const NP = /\[?NO_PRINTED_FORM\]?/g;
function inText(engine, style, cite) {
  const paren = engine.makeCitationCluster([cite]);
  let narrative = '';
  if (!style.isNote) {
    const a = engine.makeCitationCluster([{ ...cite, 'author-only': true }]).replace(NP, '').trim();
    const rest = engine.makeCitationCluster([{ ...cite, 'suppress-author': true }]).replace(NP, '').replace(/^\(\s*\)$|^\[\s*\]$/, '').trim();
    if (a && a !== paren) narrative = rest ? `${a} ${rest}` : a;
  }
  return { paren, narrative };
}

async function format({ items, style: styleName = 'apa', lang }, opts = {}) {
  const { style, lang: code } = await prepare(styleName, lang);
  // Notes double as annotations in annotated-bibliography styles
  const annotated = /annotated/.test(style.name);
  const clean = items.map(i => sanitizeItem({ ...i, id: String(i.id), note: annotated && i._note ? i._note : i.note }));
  const meta = { name: style.name, title: style.title, isNote: style.isNote };
  if (!clean.length) return { style: meta, entries: [], params: {} };

  const engine = engineFor(style, code, clean, opts);
  engine.setOutputFormat('html');
  let params = {}, html = [];
  const hasBib = !!engine.bibliography;
  if (hasBib) { const bib = engine.makeBibliography(); if (bib) [params, html] = bib; }
  const ids = hasBib && params.entry_ids ? params.entry_ids.map(x => String(x[0] ?? x)) : clean.map(i => i.id);

  const intext = {};
  for (const id of ids) {
    try { intext[id] = inText(engine, style, { id }); } catch { intext[id] = { paren: '', narrative: '' }; }
  }

  let text = [];
  if (hasBib) {
    engine.setOutputFormat('text');
    const tb = engine.makeBibliography();
    if (tb) text = tb[1];
  } else {
    // Note styles without a bibliography: the full note is the entry
    for (const id of ids) { html.push(`<div class="csl-entry">${intext[id].paren}</div>`); text.push(intext[id].paren.replace(/<[^>]+>/g, '')); }
  }

  return {
    style: meta,
    params: {
      hangingIndent: !!params.hangingindent,
      secondFieldAlign: params['second-field-align'] || false,
      lineSpacing: params.linespacing || 1,
      entrySpacing: params.entryspacing || 1,
      maxOffset: params.maxoffset || 0,
    },
    entries: ids.map((id, i) => ({ id, html: (html[i] || '').trim(), text: decode((text[i] || '').trim()), intext: intext[id] })),
  };
}

async function intextOne({ item, style: styleName = 'apa', lang, locator, label = 'page' }) {
  const { style, lang: code } = await prepare(styleName, lang);
  const clean = sanitizeItem({ ...item, id: String(item.id) });
  const engine = engineFor(style, code, [clean]);
  engine.setOutputFormat('html');
  const cite = { id: clean.id };
  if (locator) { cite.locator = String(locator); cite.label = label; }
  return { ...inText(engine, style, cite), isNote: style.isNote };
}

async function styleInfo({ style: name }) {
  const s = await loadStyle(name);
  return { name: s.name, title: s.title, isNote: s.isNote, defaultLocale: s.defaultLocale };
}

const OPS = {
  format: args => format(args),
  // Style-picker previews: don't let them push the project's engine out of the cache
  sample: args => format(args, { throwaway: true }),
  intext: intextOne,
  styleInfo,
};

self.onmessage = async e => {
  const { id, op, args } = e.data;
  try { self.postMessage({ id, ok: true, result: await OPS[op](args) }); }
  catch (err) { self.postMessage({ id, ok: false, error: err?.message || 'Formatting failed' }); }
};
