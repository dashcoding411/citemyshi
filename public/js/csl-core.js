// The citation formatter shared by the browser worker (format-worker.js) and
// the test suite. `getText(path)` reads files shipped with the site
// (/styles/*.csl, /locales/*); `getServerStyle(name)` fetches any other style.
import { tidyEdition } from './edition.js';

export function createFormatter({ CSL, getText, getServerStyle }) {
  const styles = new Map();  // name -> Promise<{ name, title, isNote, defaultLocale, xml }>
  const locales = new Map(); // code -> xml
  let localesMeta = null;
  const engines = new Map(); // `${style}|${lang}` -> { engine, map }; big styles use ~100MB each, so keep 2

  const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#38;/g, '&').replace(/&#60;/g, '<').replace(/&#62;/g, '>');

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
        return getServerStyle(name);
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
    localesMeta ||= await getText('/locales/locales.json').then(JSON.parse).catch(() => ({ 'primary-dialects': {} }));
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
    if (out['event-title'] && !out.event) out.event = out['event-title'];
    return out;
  }

  async function prepare(styleName, lang) {
    const style = await loadStyle(styleName);
    // UK styles without a declared language (Cite Them Right Harvard, MHRA…) use British dates
    const british = /harvard|mhra|oscola|new-harts|cite-them-right/.test(style.name);
    const want = lang || style.defaultLocale || (british ? 'en-GB' : 'en-US');
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
  // "p. s 9" / "p. [42]" -> "s 9" / "[42]" (legal pinpoints carry their own label)
  const cleanPin = h => String(h).replace(/\b(?:pp?\.)\s*(?=(?:ss?|pts?|schs?|regs?|rr?|cll?|arts?|divs?)\s|\[)/g, '');
  function inText(engine, style, cite, item) {
    let paren = engine.makeCitationCluster([cite]);
    if (/CSL STYLE ERROR/.test(paren)) paren = item?.title ? `(${esc(item.title)})` : '';
    let narrative = '';
    if (!style.isNote) {
      let a = engine.makeCitationCluster([{ ...cite, 'author-only': true }]).replace(NP, '').trim();
      const rest = engine.makeCitationCluster([{ ...cite, 'suppress-author': true }]).replace(NP, '').replace(/^\(\s*\)$|^\[\s*\]$/, '').trim();
      // Take the name from the parenthetical so a title standing in for the
      // author keeps its quotes or italics: “Photosynthesis” (2024)
      const inner = paren.replace(/^\(|\)$/g, ''), restInner = rest.replace(/^\(|\)$/g, '');
      if (a && !restInner && inner !== paren && !/\d/.test(inner)) a = inner; // MLA: (“Title”) -> “Title”
      else if (a && restInner && inner !== paren && inner.endsWith(restInner)) {
        const lead = inner.slice(0, -restInner.length).trim().replace(/,(?=(<\/i>)?$)/, '').replace(/,(”|’)(?=(<\/i>)?$)/, '$1').trim();
        if (lead) a = lead;
      }
      // Prose uses "and": "Ladds and Keating (2017)", never "Ladds & Keating (2017)"
      if (!(item?.author || []).some(n => /&/.test(n.literal || ''))) a = a.replace(/\s(?:&#38;|&amp;|&)\s/g, ' and ');
      if (a && a !== paren && !/CSL STYLE ERROR/.test(a)) narrative = rest ? `${a} ${rest}` : a;
    }
    return { paren, narrative };
  }

  // Styles whose official CSL file doesn't apply a capitalisation rule its
  // manual requires. Titles are stored in sentence case (the CSL convention).
  const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || [, 'st', 'nd', 'rd'][n % 100] || 'th'}`;

  // APA, MLA, Chicago, Harvard, IEEE… only describe US legal materials and say to
  // follow the local legal style for others — so Australian, UK and NZ Acts and
  // cases are written the AGLC way, as Australian university guides teach.
  const LEGAL_STYLE = /^(australian-guide-to-legal|oscola|bluebook|mcgill|new-zealand-law|cambridge-university-press-law)/;
  const isUS = item => /^(US|USA|U\.S\.|United States)$/i.test(String(item['container-title'] || '')) || /United States Reports|Federal Reporter|Supreme Court Reporter|^U\.?S\.?$|^F\s?\d?d$|^S\s?Ct$/i.test(String(item['container-title-short'] || item['container-title'] || ''));
  const esc = t => String(t).replace(/&/g, '&#38;').replace(/</g, '&#60;').replace(/>/g, '&#62;');
  function localLegal(item) {
    if (!['legislation', 'bill', 'legal_case'].includes(item.type) || isUS(item) || !item.title) return null;
    const year = item.issued?.['date-parts']?.[0]?.[0];
    if (item.type === 'legal_case') {
      const report = item['container-title-short'] || item['container-title'];
      let rest = '';
      if (item.volume && report) rest = `(${year}) ${item.volume} ${report}${item.page ? ` ${item.page}` : ''}`;
      else if (report) rest = `[${year}] ${report}${item.page ? ` ${item.page}` : ''}`;
      else if (item.authority && item.number) rest = `[${year}] ${item.authority} ${item.number}`;
      else if (year) rest = `(${year})`;
      return { html: `<i>${esc(item.title)}</i>${rest ? ` ${esc(rest)}` : ''}`, text: `${item.title}${rest ? ` ${rest}` : ''}` };
    }
    const jur = item['container-title'] ? ` (${item['container-title']})` : '';
    const name = `${item.title}${year ? ` ${year}` : ''}`;
    return item.type === 'bill'
      ? { html: `${esc(name)}${esc(jur)}`, text: `${name}${jur}` }
      : { html: `<i>${esc(name)}</i>${esc(jur)}`, text: `${name}${jur}` };
  }

  const MINOR = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'v', 'with', 'from', 'into', 'over']);
  const titleCase = t => String(t).replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (word, idx, all) => {
    const before = all.slice(0, idx).trimEnd();
    if (/\p{Lu}.*\p{Lu}/u.test(word) || /\p{Ll}\p{Lu}/u.test(word)) return word;
    if (before && !/[:?!.—–-]$/.test(before) && MINOR.has(word.toLowerCase())) return word.toLowerCase();
    return word[0].toUpperCase() + word.slice(1);
  });
  // "World Health Organization" vs "World Health Organization" / "AIHW" / "who.int"
  const normOrg = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '')
    .replace(/\.(com|org|net|gov|edu|int)(\.[a-z]{2})?$/, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  const acronym = s => String(s).split(/[\s-]+/).filter(w => w && !/^(of|and|the|for|on|in|&)$/i.test(w)).map(w => w[0]).join('').toLowerCase();
  const isAcronym = s => /^[A-Z]{2,8}$/.test(String(s || '').trim());
  function sameOrg(a, b) {
    if (!a || !b) return false;
    const x = normOrg(a), y = normOrg(b);
    if (!x || !y) return false;
    if (x === y) return true;
    // AIHW = Australian Institute of Health and Welfare; CDC = Centers for Disease Control (and Prevention)
    const [short, long] = isAcronym(a) ? [a, b] : isAcronym(b) ? [b, a] : [];
    return !!short && !isAcronym(long) && acronym(long).startsWith(short.trim().toLowerCase()) && short.trim().length >= 3;
  }

  // Descriptions MLA 9 doesn't put in Works Cited ("Video.", "Film.", "Song.")
  const MEDIA_LABEL = /^(film|movie|video|online video|song|album|track|music|audio|tv series episode|tv episode|television episode|tv series|television series|audio podcast episode|podcast episode|podcast|video podcast episode|radio broadcast)$/i;
  const SOCIAL_LABELS = { x: 'Post', twitter: 'Post', threads: 'Post', bluesky: 'Post', linkedin: 'Post', mastodon: 'Post', facebook: 'Status update', instagram: 'Photograph', tiktok: 'Video', reddit: 'Online forum post', youtube: 'Video' };
  const mlaPress = p => String(p).replace(/\bUniversity of ([\p{L} .'’-]+?) Press\b/u, 'U of $1 P').replace(/\bUniversity Press\b/, 'UP');

  function styleFixes(style, item) {
    const apa = /^apa/.test(style.name), mla = /^modern-language/.test(style.name), aglc = /^australian-guide-to-legal/.test(style.name);
    item = { ...item };
    // Journal articles are never cited with the journal's handling editor (Crossref lists them)
    if (item.type === 'article-journal') delete item.editor;
    // eLocators ("e0209899") are article numbers, not pages
    if (item.type === 'article-journal' && !item.number && /^e\d{3,}$/i.test(String(item.page || '').trim()) && (apa || mla)) { item.number = item.page; delete item.page; }

    // The same organisation as author and as publisher/website: APA, Harvard,
    // Chicago… print it once, as the author; MLA 9 skips the author instead
    const org = item.author?.length === 1 && item.author[0].literal;
    if (org) {
      const periodical = ['article-journal', 'article-magazine', 'article-newspaper'].includes(item.type);
      const dupContainer = sameOrg(org, item['container-title']), dupPublisher = sameOrg(org, item.publisher);
      if (mla || periodical) { if ((mla && (dupContainer || dupPublisher)) || (periodical && dupContainer)) delete item.author; }
      else {
        if (dupContainer && !/^(entry|chapter|paper-conference)/.test(item.type)) delete item['container-title'];
        if (dupPublisher) delete item.publisher;
      }
    }

    if (apa) {
      // APA 7: [Post] on X, [Status update] on Facebook, [Video] on TikTok…
      const platform = String(item['container-title'] || '').toLowerCase().replace(/\s*\(.*\)$/, '');
      if (item.type === 'post' && !item.genre && SOCIAL_LABELS[platform]) item.genre = SOCIAL_LABELS[platform];
      // Podcasts are credited to the host: "Glass, I. (Host)."
      if (/podcast/i.test(`${item.medium || ''} ${item.genre || ''}`) && item.author?.length && !item.host) { item.host = item.author; delete item.author; }
      // APA 7 (10.6): a thesis not from a database or archive is "Unpublished"
      if (item.type === 'thesis' && item.genre && !item.URL && !item.DOI && !item.archive && !/unpublished/i.test(item.genre)) item.genre = `Unpublished ${item.genre[0].toLowerCase()}${item.genre.slice(1)}`;
      // Wikipedia: the permanent link to the version you read (APA 7, 10.3)
      if (item._permalink) item.URL = item._permalink;
    }
    if (mla) {
      if (['motion_picture', 'broadcast', 'song', 'webpage', 'post'].includes(item.type)) {
        if (MEDIA_LABEL.test(String(item.genre || '').trim())) delete item.genre;
        if (MEDIA_LABEL.test(String(item.medium || '').trim())) delete item.medium;
      }
      if (/^season \d+, episode \d+$/i.test(String(item.number || ''))) item.number = String(item.number).toLowerCase();
      if (item.type === 'graphic' && /^(painting|photograph|sculpture|drawing|artwork|print|image)$/i.test(String(item.genre || ''))) delete item.genre;
      // MLA 9 gives a city only for newspapers that need one
      if (item.type !== 'article-newspaper') delete item['publisher-place'];
      if (item.publisher) item.publisher = mlaPress(item.publisher);
      // Article numbers aren't part of an MLA entry
      if (item.type === 'article-journal') { if (item.number && (!item.page || String(item.page) === String(item.number))) delete item.page; delete item.number; }
      if (/^wikipedia$/i.test(String(item['container-title'] || '')) && !item.publisher) item.publisher = 'Wikimedia Foundation';
    }
    if (aglc) {
      // AGLC 4 r 7.15–7.16: the document type goes in brackets — (Web Page, 1 May 2024), (Blog Post, …), (X, …)
      if (item.type === 'webpage' && !item.genre) item.genre = 'Web Page';
      if (item.type === 'post-weblog' && !item.genre) item.genre = 'Blog Post';
      if (item.type === 'post') {
        item.genre = item['container-title'] || item.genre || 'Social Media Post';
        delete item['container-title'];
        item.type = 'webpage';
        // A post is quoted as written, never title-cased
        if (item.title) item.title = `<span class="nocase">${item.title}</span>`;
      }
    }

    // Acts: the style prints the year itself, so "Corporations Act 2001" + 2001 would double it
    const year = item.issued?.['date-parts']?.[0]?.[0];
    if (['legislation', 'bill'].includes(item.type) && year && item.title && new RegExp(`\\s${year}$`).test(item.title.trim())) item = { ...item, title: item.title.trim().replace(new RegExp(`\\s${year}$`), '') };
    // "3rd edition" typed by hand -> "3" (the style adds "3rd ed." / "3rd edn" itself)
    if (item.edition != null && item.edition !== '') { const e = tidyEdition(item.edition); if (e) item = { ...item, edition: e }; else { item = { ...item }; delete item.edition; } }
    // Worded editions are stored as "Rev. ed." / "Global ed."; Cite Them Right writes "edn", AGLC "rev ed"
    if (/ ed\.$/.test(String(item.edition || ''))) {
      if (/cite-them-right|harvard/.test(style.name)) item = { ...item, edition: item.edition.replace(/ ed\.$/, ' edn') };
      if (aglc) item = { ...item, edition: item.edition.replace(/^Rev\. ed\.$/, 'rev ed').replace(/\.$/, '') };
    }
    // AGLC 4 r 6.3: "2nd ed" (the style would print "2ⁿᵈ edn")
    if (/^australian-guide-to-legal/.test(style.name) && /^\d+$/.test(String(item.edition || ''))) item = { ...item, edition: `${ordinal(+item.edition)} ed` };
    // IEEE adds "arXiv:" itself
    if (/^ieee/.test(style.name) && /^arxiv:/i.test(String(item.number || ''))) item = { ...item, number: String(item.number).replace(/^arxiv:\s*/i, '') };
    // MLA dates speeches and performances by the event
    if (/^modern-language/.test(style.name) && item.type === 'speech' && item.issued && !item['event-date']) item = { ...item, 'event-date': item.issued };
    // IEEE: book, report and thesis titles are in Title Case (IEEE Reference Guide)
    if (/^ieee/.test(style.name) && ['book', 'report', 'thesis', 'manuscript'].includes(item.type) && item.title) return { ...item, title: titleCase(item.title) };
    return item;
  }

  async function format({ items, style: styleName = 'apa', lang }, opts = {}) {
    const { style, lang: code } = await prepare(styleName, lang);
    // Notes double as annotations in annotated-bibliography styles
    const annotated = /annotated/.test(style.name);
    const clean = items.map(i => sanitizeItem(styleFixes(style, { ...i, id: String(i.id), note: annotated && i._note ? i._note : i.note })));
    const meta = { name: style.name, title: style.title, isNote: style.isNote };
    if (!clean.length) return { style: meta, entries: [], params: {} };

    const engine = engineFor(style, code, clean, opts);
    engine.setOutputFormat('html');
    let params = {}, html = [];
    const hasBib = !!engine.bibliography;
    let bibFailed = false;
    if (hasBib) { const bib = engine.makeBibliography(); if (bib) [params, html] = bib; else bibFailed = true; }
    // citeproc lists every item in entry_ids but only outputs the ones the style
    // includes; the skipped ones come back as "bibliography_errors". Drop them so
    // each entry lines up with its own text.
    const skipped = new Set((params.bibliography_errors || []).map(e => String(e.itemID)));
    const ids = !hasBib ? clean.map(i => i.id)
      : bibFailed ? []
      : (params.entry_ids || []).map(x => String(x[0] ?? x)).filter(id => !skipped.has(id));
    if (hasBib && ids.length !== html.length) console.warn('citemyshi: bibliography alignment mismatch', ids.length, html.length);

    // Some sources are cited in-text only (APA personal communications, Chicago
    // notes-only sources) — still give them their in-text citation
    const outside = clean.map(i => i.id).filter(id => !ids.includes(id));
    const byId = new Map(clean.map(i => [i.id, i]));
    const intext = {};
    for (const id of [...ids, ...outside]) {
      try { intext[id] = inText(engine, style, { id }, byId.get(id)); } catch { intext[id] = { paren: '', narrative: '' }; }
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
      entries: [
        ...ids.map((id, i) => fixLegal(style, clean, polish(style, byId.get(id), { id, html: (html[i] || '').trim(), text: decode((text[i] || '').trim()), intext: intext[id] }))),
        ...outside.map(id => fixLegal(style, clean, { id, html: '', text: '', intext: intext[id], inBibliography: false })),
      ],
    };
  }

  function fixLegal(style, clean, entry, locator) {
    if (LEGAL_STYLE.test(style.name)) return entry;
    const item = clean.find(i => i.id === entry.id);
    const legal = item && localLegal(item);
    if (!legal) return entry;
    const out = { ...entry };
    if (entry.html) {
      const margin = entry.html.match(/<div class="csl-left-margin">([\s\S]*?)<\/div>/);
      out.html = margin ? `<div class="csl-entry"><div class="csl-left-margin">${margin[1]}</div><div class="csl-right-inline">${legal.html}.</div></div>` : `<div class="csl-entry">${legal.html}.</div>`;
      out.text = `${margin ? `${decode(margin[1].replace(/<[^>]+>/g, ''))} ` : ''}${legal.text}.`;
    }
    // Numbered styles keep their [1]; author-date and note styles cite the Act/case itself
    const numbered = /^\s*(<[^>]+>)*[[(]?\d+[\])]?(<\/[^>]+>)*\s*$/.test(entry.intext?.paren || '');
    if (!numbered) {
      // Cases: ", 20" or ", [42]"; Acts: " s 9"
      const pin = !locator ? '' : item.type === 'legal_case' ? `, ${locator}` : ` ${locator}`;
      out.intext = style.isNote
        ? { paren: `${legal.html}${esc(pin)}.`, narrative: '' }
        : { paren: `(${legal.html}${esc(pin)})`, narrative: `${legal.html}${esc(pin)}` };
    }
    return out;
  }

  // Finishing touches citeproc can't do from the style file alone
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function polish(style, item, entry) {
    if (!item) return entry;
    let { html, text } = entry;
    // Never show the user a processor error: fall back to the bare essentials
    if (/CSL STYLE ERROR/.test(html) || /CSL STYLE ERROR/.test(text)) {
      const t = item.title || 'Untitled source';
      text = `${t}.${item.URL ? ` ${item.URL}` : ''}`;
      html = `<div class="csl-entry"><i>${esc(t)}</i>.${item.URL ? ` ${esc(item.URL)}` : ''}</div>`;
    }
    // MLA 9 (5.96): URLs without http:// or https:// (DOIs keep https://doi.org/)
    if (/^modern-language/.test(style.name)) {
      const strip = s => s.replace(/\bhttps?:\/\/(?!(?:dx\.)?doi\.org\/)/g, '');
      html = strip(html); text = strip(text);
    }
    // Cite Them Right: an article number goes where the pages would ("PLoS ONE, 14(1), e0209899"),
    // and an article with one is not a preprint
    if (/cite-them-right/.test(style.name) && item.type === 'article-journal' && item.number && !item.page) {
      const loc = item.volume ? `${item.volume}${item.issue ? `(${item.issue})` : ''}` : item.issue ? `(${item.issue})` : '';
      const fix = s => { s = s.replace(' [Preprint]', ''); return loc && s.includes(`${loc}.`) ? s.replace(`${loc}.`, `${loc}, ${item.number}.`) : s; };
      html = fix(html); text = fix(text);
    }
    // APA 7 dates a Wikipedia entry by the version cited: (2019, December 4)
    if (/^apa/.test(style.name) && /^wikipedia$/i.test(item['container-title'] || '') && item.type === 'entry-encyclopedia') {
      const [y, m, d] = item.issued?.['date-parts']?.[0] || [];
      if (y && m && d) { const full = `(${y}, ${MONTH_NAMES[m - 1]} ${d})`; html = html.replace(`(${y})`, full); text = text.replace(`(${y})`, full); }
    }
    return { ...entry, html, text };
  }

  async function intextOne({ item, items, style: styleName = 'apa', lang, locator, label = 'page' }) {
    const { style, lang: code } = await prepare(styleName, lang);
    const clean = sanitizeItem(styleFixes(style, { ...item, id: String(item.id) }));
    // Cite it among the rest of the project so "2020a", initials and [7] match the reference list
    const others = (items || []).filter(i => String(i.id) !== clean.id).map(i => sanitizeItem(styleFixes(style, { ...i, id: String(i.id) })));
    const all = items?.length ? (items.some(i => String(i.id) === clean.id) ? (items.map(i => String(i.id) === clean.id ? clean : others.find(o => o.id === String(i.id)))) : [...others, clean]) : [clean];
    const engine = engineFor(style, code, all);
    engine.setOutputFormat('html');
    const cite = { id: clean.id };
    if (locator) { cite.locator = String(locator); cite.label = label; }
    const r = fixLegal(style, [clean], { id: clean.id, intext: inText(engine, style, cite, clean) }, locator);
    return { paren: cleanPin(r.intext.paren), narrative: cleanPin(r.intext.narrative), isNote: style.isNote };
  }

  // A whole document's citations in order — this is what makes "Ibid", "(n 3)"
  // and short-form subsequent notes work, and numbers IEEE/Vancouver
  // references by first citation. citations: [{ id, items: [{ id, locator, label }] }]
  async function formatDocument({ items, style: styleName = 'apa', lang, citations = [], uncited = false }) {
    const { style, lang: code } = await prepare(styleName, lang);
    const clean = items.map(i => sanitizeItem(styleFixes(style, { ...i, id: String(i.id) })));
    const known = new Set(clean.map(i => i.id));
    const cits = citations
      .map((c, i) => ({ id: String(c.id || `c${i}`), items: (c.items || []).filter(x => known.has(String(x.id))) }))
      .filter(c => c.items.length)
      .map((c, i) => ({
        citationID: c.id,
        citationItems: c.items.map(x => {
          const ci = { id: String(x.id) };
          if (x.locator) { ci.locator = String(x.locator); ci.label = x.label || 'page'; }
          return ci;
        }),
        properties: { noteIndex: style.isNote ? i + 1 : 0 },
      }));
    const holder = { map: new Map(clean.map(i => [i.id, i])) };
    const engine = new CSL.Engine({ retrieveLocale, retrieveItem: id => holder.map.get(String(id)) }, style.xml, code, true);
    engine.setOutputFormat('html');
    const citedIds = new Set(cits.flatMap(c => c.citationItems.map(x => x.id)));
    const uncitedIds = uncited ? clean.map(i => i.id).filter(id => !citedIds.has(id)) : [];
    const out = cits.length ? engine.rebuildProcessorState(cits, 'html', uncitedIds) : (engine.updateItems(uncitedIds), []);
    const byId = new Map(out.map(([cid, , str]) => [cid, str]));
    const firstNote = new Map(); // item -> note number of its first full citation
    const chicago = /^(chicago|turabian)/.test(style.name);
    const formatted = cits.map((c, i) => {
      let html = byId.get(c.citationID) || '';
      // Australian/UK/NZ law in non-legal styles, the AGLC way: in full the first
      // time, then "Ibid" or a short form pointing back to the first note
      if (!LEGAL_STYLE.test(style.name) && c.citationItems.length === 1) {
        const ci = c.citationItems[0];
        const item = holder.map.get(ci.id);
        const legal = item && localLegal(item);
        if (legal && !/^\s*(<[^>]+>)*[[(]?\d+/.test(html)) {
          const prev = i > 0 && cits[i - 1].citationItems.length === 1 && cits[i - 1].citationItems[0].id === ci.id;
          const pin = !ci.locator ? '' : item.type === 'legal_case' ? `, ${ci.locator}` : ` ${ci.locator}`;
          // Chicago 18 prefers short notes to "Ibid."
          if (style.isNote && prev && !chicago) html = `Ibid${pin ? ` ${pin.replace(/^,\s*/, '')}` : ''}.`;
          else if (style.isNote && firstNote.has(ci.id)) {
            const short = `<i>${esc(item.title.replace(/\s+(Act|Regulations?|Bill)$/, ' $1'))}</i>`;
            html = chicago ? `${short}${pin.replace(/^\s(?=s)/, ', ')}.` : `${short} (n ${firstNote.get(ci.id)})${pin.replace(/^,\s*/, ' ')}.`;
          } else {
            const fixed = fixLegal(style, [item], { id: item.id, intext: { paren: html, narrative: '' } }, ci.locator);
            html = fixed.intext.paren;
          }
        }
      }
      if (style.isNote) for (const ci of c.citationItems) if (!firstNote.has(ci.id)) firstNote.set(ci.id, i + 1);
      html = cleanPin(html);
      return { id: c.citationID, note: style.isNote ? i + 1 : null, html, text: decode(html.replace(/<[^>]+>/g, '')) };
    });
    let entries = [];
    if (engine.bibliography && (cits.length || uncitedIds.length)) {
      const bib = engine.makeBibliography();
      if (bib) {
        const [params, html] = bib;
        const skipped = new Set((params.bibliography_errors || []).map(e => String(e.itemID)));
        const ids = (params.entry_ids || []).map(x => String(x[0] ?? x)).filter(id => !skipped.has(id));
        engine.setOutputFormat('text');
        const text = engine.makeBibliography()?.[1] || [];
        entries = ids.map((id, k) => fixLegal(style, clean, polish(style, holder.map.get(id), { id, html: (html[k] || '').trim(), text: decode((text[k] || '').trim()), intext: { paren: '', narrative: '' } })));
      }
    }
    return { style: { name: style.name, title: style.title, isNote: style.isNote }, citations: formatted, entries };
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
    document: formatDocument,
    styleInfo,
  };

  return OPS;
}
