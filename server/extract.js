// Scans a web page for every bit of citation metadata it exposes:
// Highwire/Google Scholar citation_* tags, Dublin Core, PRISM, Open Graph,
// Twitter cards, JSON-LD (schema.org), microdata, bylines, <time> tags…
// and enriches it from DOI/ISBN/oEmbed/Wikipedia APIs when possible.
import * as cheerio from 'cheerio';
import { safeFetch } from './net.js';
import { parseName, splitAuthors, parseDate, cleanText, today, looksLikeOrg } from './names.js';
import { lookupDoi, lookupIsbn, lookupArxiv, lookupPmid, lookupPmc, lookupPii, validIsbn, getJSON, prune, googleBookToCsl } from './lookup.js';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1',
};
// Sites that block scrapers usually still serve metadata to link-preview bots.
const FALLBACK_UAS = [
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Twitterbot/1.0',
];

// Well-known sites whose og:site_name is missing or unhelpful
const SITE_NAMES = {
  'nytimes.com': 'The New York Times', 'washingtonpost.com': 'The Washington Post', 'wsj.com': 'The Wall Street Journal',
  'theguardian.com': 'The Guardian', 'bbc.com': 'BBC News', 'bbc.co.uk': 'BBC News', 'cnn.com': 'CNN', 'reuters.com': 'Reuters',
  'apnews.com': 'AP News', 'npr.org': 'NPR', 'theatlantic.com': 'The Atlantic', 'newyorker.com': 'The New Yorker',
  'economist.com': 'The Economist', 'forbes.com': 'Forbes', 'bloomberg.com': 'Bloomberg', 'time.com': 'Time',
  'latimes.com': 'Los Angeles Times', 'usatoday.com': 'USA Today', 'nbcnews.com': 'NBC News', 'cbsnews.com': 'CBS News',
  'abcnews.go.com': 'ABC News', 'foxnews.com': 'Fox News', 'politico.com': 'Politico', 'vox.com': 'Vox', 'wired.com': 'Wired',
  'theverge.com': 'The Verge', 'nature.com': 'Nature', 'sciencedirect.com': 'ScienceDirect', 'britannica.com': 'Encyclopedia Britannica',
  'wikipedia.org': 'Wikipedia', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo', 'medium.com': 'Medium',
  'nih.gov': 'National Institutes of Health', 'cdc.gov': 'Centers for Disease Control and Prevention', 'who.int': 'World Health Organization',
  'nasa.gov': 'NASA', 'history.com': 'History', 'nationalgeographic.com': 'National Geographic', 'smithsonianmag.com': 'Smithsonian Magazine',
  'scientificamerican.com': 'Scientific American', 'psychologytoday.com': 'Psychology Today', 'healthline.com': 'Healthline',
  'mayoclinic.org': 'Mayo Clinic', 'webmd.com': 'WebMD', 'investopedia.com': 'Investopedia', 'khanacademy.org': 'Khan Academy',
  'ted.com': 'TED', 'imdb.com': 'IMDb', 'goodreads.com': 'Goodreads', 'reddit.com': 'Reddit', 'x.com': 'X', 'twitter.com': 'X',
  'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'spotify.com': 'Spotify', 'github.com': 'GitHub', 'stackoverflow.com': 'Stack Overflow',
  'gov.uk': 'GOV.UK', 'un.org': 'United Nations', 'ft.com': 'Financial Times', 'independent.co.uk': 'The Independent',
  'telegraph.co.uk': 'The Telegraph', 'aljazeera.com': 'Al Jazeera', 'huffpost.com': 'HuffPost', 'businessinsider.com': 'Business Insider',
  'cnbc.com': 'CNBC', 'pbs.org': 'PBS', 'smh.com.au': 'The Sydney Morning Herald', 'abc.net.au': 'ABC News', 'cbc.ca': 'CBC',
  'theconversation.com': 'The Conversation', 'scribbr.com': 'Scribbr', 'plato.stanford.edu': 'Stanford Encyclopedia of Philosophy',
  'merriam-webster.com': 'Merriam-Webster', 'dictionary.com': 'Dictionary.com', 'pewresearch.org': 'Pew Research Center',
  'statista.com': 'Statista', 'jstor.org': 'JSTOR', 'researchgate.net': 'ResearchGate', 'ncbi.nlm.nih.gov': 'National Library of Medicine',
  'pubmed.ncbi.nlm.nih.gov': 'PubMed', 'arxiv.org': 'arXiv', 'ssrn.com': 'SSRN', 'loc.gov': 'Library of Congress',
  'archives.gov': 'National Archives', 'whitehouse.gov': 'The White House', 'state.gov': 'U.S. Department of State',
  'quora.com': 'Quora', 'linkedin.com': 'LinkedIn', 'facebook.com': 'Facebook', 'sparknotes.com': 'SparkNotes',
  'poetryfoundation.org': 'Poetry Foundation', 'biography.com': 'Biography', 'livescience.com': 'Live Science', 'space.com': 'Space.com',
  'sciencedaily.com': 'ScienceDaily', 'newscientist.com': 'New Scientist', 'vogue.com': 'Vogue', 'rollingstone.com': 'Rolling Stone',
  'variety.com': 'Variety', 'hollywoodreporter.com': 'The Hollywood Reporter', 'espn.com': 'ESPN', 'cnet.com': 'CNET', 'techcrunch.com': 'TechCrunch',
  'arstechnica.com': 'Ars Technica', 'engadget.com': 'Engadget', 'axios.com': 'Axios', 'thehill.com': 'The Hill', 'slate.com': 'Slate',
  'salon.com': 'Salon', 'newsweek.com': 'Newsweek', 'usnews.com': 'U.S. News & World Report', 'msn.com': 'MSN', 'yahoo.com': 'Yahoo',
  'chicagotribune.com': 'Chicago Tribune', 'bostonglobe.com': 'The Boston Globe', 'sfchronicle.com': 'San Francisco Chronicle',
  'dailymail.co.uk': 'Daily Mail', 'thesun.co.uk': 'The Sun', 'mirror.co.uk': 'Mirror', 'thetimes.co.uk': 'The Times',
  'lemonde.fr': 'Le Monde', 'spiegel.de': 'Der Spiegel', 'elpais.com': 'El País', 'scmp.com': 'South China Morning Post',
  'japantimes.co.jp': 'The Japan Times', 'hindustantimes.com': 'Hindustan Times', 'timesofindia.indiatimes.com': 'The Times of India',
  'thehindu.com': 'The Hindu', 'ndtv.com': 'NDTV', 'indianexpress.com': 'The Indian Express',
};
const NEWS_HOSTS = new Set(['nytimes.com', 'washingtonpost.com', 'wsj.com', 'theguardian.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'reuters.com', 'apnews.com', 'npr.org', 'latimes.com', 'usatoday.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'foxnews.com', 'politico.com', 'bloomberg.com', 'ft.com', 'independent.co.uk', 'telegraph.co.uk', 'aljazeera.com', 'huffpost.com', 'cnbc.com', 'axios.com', 'thehill.com', 'newsweek.com', 'chicagotribune.com', 'bostonglobe.com', 'sfchronicle.com', 'dailymail.co.uk', 'thesun.co.uk', 'mirror.co.uk', 'thetimes.co.uk', 'lemonde.fr', 'spiegel.de', 'elpais.com', 'scmp.com', 'japantimes.co.jp', 'hindustantimes.com', 'timesofindia.indiatimes.com', 'thehindu.com', 'ndtv.com', 'indianexpress.com', 'smh.com.au', 'abc.net.au', 'cbc.ca', 'economist.com', 'time.com', 'usnews.com', 'businessinsider.com']);
const MAGAZINE_HOSTS = new Set(['theatlantic.com', 'newyorker.com', 'wired.com', 'vox.com', 'theverge.com', 'smithsonianmag.com', 'scientificamerican.com', 'nationalgeographic.com', 'psychologytoday.com', 'forbes.com', 'vogue.com', 'rollingstone.com', 'variety.com', 'hollywoodreporter.com', 'slate.com', 'salon.com', 'newscientist.com', 'arstechnica.com']);

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\d?\./, '').replace(/^m\./, '').toLowerCase(); } catch { return ''; }
}
function hostKey(host, table) {
  if (table[host] || (table instanceof Set && table.has(host))) return host;
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const h = parts.slice(i).join('.');
    if (table instanceof Set ? table.has(h) : table[h]) return h;
  }
  return null;
}
export function siteNameFor(url) {
  const host = hostOf(url);
  const k = hostKey(host, SITE_NAMES);
  if (k) return SITE_NAMES[k];
  // example-site.co.uk -> Example Site
  const parts = host.split('.');
  let core = parts.length > 2 && /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] || host;
  if (!core) return host;
  if (/\.(gov|edu)$/.test(host) || core.length <= 4) return core.toUpperCase() === core ? core : (core.length <= 4 ? core.toUpperCase() : core);
  return core.split(/[-_]/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function cleanUrl(u) {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|igshid|ref_src|ref$|cmpid|ocid|smid|sh$|_ga|dclid|yclid|share|si$|feature$|casa_token|token$|via$|rfr_id|needaccess|journalcode|pdf_download)/i.test(k)) url.searchParams.delete(k);
    }
    url.hash = '';
    return url.toString().replace(/\?$/, '');
  } catch { return u; }
}

// ---------- fetching ----------
async function fetchPage(url) {
  let lastErr;
  const attempts = [BROWSER_HEADERS, ...FALLBACK_UAS.map(ua => ({ 'User-Agent': ua, Accept: '*/*' }))];
  for (const headers of attempts) {
    try {
      const res = await safeFetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const type = res.headers.get('content-type') || '';
      if (!res.ok && res.status !== 404) { lastErr = new Error(`HTTP ${res.status}`); lastErr.status = res.status; continue; }
      if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(res.url)) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { kind: 'pdf', buf, finalUrl: res.url, status: res.status };
      }
      const html = await readLimited(res, 4_000_000);
      // Cloudflare / bot-wall pages don't contain metadata; try the next UA
      const wall = /<title>\s*(Just a moment|Attention Required|Access denied|Access Denied|Are you a robot|Please verify|Robot or human|Client Challenge|Security check|Verifying|One moment|Pardon Our Interruption|Checking your browser|Request blocked)/i.test(html)
        || (hostOf(res.url) && hostOf(res.url) !== hostOf(url) && /^(idp|auth|login|signin|sso|accounts|consent)\./.test(new URL(res.url).hostname));
      if (wall) { lastErr = new Error('Blocked by bot protection'); continue; }
      return { kind: 'html', html, finalUrl: res.url, status: res.status };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Could not load page');
}

async function readLimited(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
    if (size > max) { reader.cancel().catch(() => {}); break; }
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ---------- metadata collection ----------
function collectMeta($) {
  const meta = new Map();
  const add = (k, v) => {
    if (!k || v == null) return;
    v = cleanText(v);
    if (!v) return;
    k = k.toLowerCase().trim();
    if (!meta.has(k)) meta.set(k, []);
    if (!meta.get(k).includes(v)) meta.get(k).push(v);
  };
  $('meta').each((i, el) => {
    const a = el.attribs;
    const content = a.content ?? a.value;
    for (const key of [a.name, a.property, a.itemprop, a['http-equiv']]) if (key) for (const k of key.split(/\s+/)) add(k, content);
  });
  return {
    all: k => meta.get(k.toLowerCase()) || [],
    get: (...keys) => { for (const k of keys) { const v = meta.get(k.toLowerCase()); if (v?.length) return v[0]; } return undefined; },
    getAll: (...keys) => { for (const k of keys) { const v = meta.get(k.toLowerCase()); if (v?.length) return v; } return []; },
    raw: meta,
  };
}

function collectJsonLd($) {
  const nodes = [];
  const visit = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(visit);
    if (n['@graph']) visit(n['@graph']);
    if (n['@type']) nodes.push(n);
    if (n.mainEntity && typeof n.mainEntity === 'object') visit(n.mainEntity);
  };
  $('script[type="application/ld+json"]').each((i, el) => {
    const txt = $(el).contents().text().trim().replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, '');
    try { visit(JSON.parse(txt)); } catch {
      try { visit(JSON.parse(txt.replace(/[\u0000-\u001f]+/g, ' '))); } catch {}
    }
  });
  return nodes;
}

const typeOf = n => [].concat(n['@type'] || []).map(String);
const ARTICLE_TYPES = /^(Article|NewsArticle|ReportageNewsArticle|AnalysisNewsArticle|OpinionNewsArticle|BackgroundNewsArticle|ReviewNewsArticle|BlogPosting|LiveBlogPosting|ScholarlyArticle|MedicalScholarlyArticle|TechArticle|Report|SocialMediaPosting|DiscussionForumPosting|Review|CreativeWork|Recipe|HowTo|MedicalWebPage|Book|Chapter|VideoObject|Movie|TVEpisode|PodcastEpisode|AudioObject|MusicRecording|Dataset|Thesis|Legislation|Course|Guide|FAQPage|QAPage|Product)$/;

function pickPrimary(nodes, title) {
  const candidates = nodes.filter(n => typeOf(n).some(t => ARTICLE_TYPES.test(t)));
  if (!candidates.length) return nodes.find(n => typeOf(n).some(t => /WebPage$/.test(t))) || null;
  const norm = s => String(s || '').toLowerCase().replace(/\W+/g, '');
  const t = norm(title);
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0];
  function score(n) {
    let s = 0;
    const types = typeOf(n).join(' ');
    if (/NewsArticle|ScholarlyArticle|BlogPosting|^Article|Report|VideoObject|Book/.test(types)) s += 5;
    if (n.headline || n.name) { const h = norm(n.headline || n.name); if (t && (t.includes(h) || h.includes(t))) s += 4; }
    if (n.author) s += 2;
    if (n.datePublished) s += 2;
    return s;
  }
}

function ldText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return cleanText(v);
  if (Array.isArray(v)) return ldText(v[0]);
  return cleanText(v.name || v['@value'] || v.headline || '');
}

function ldPeople(v, byId) {
  const out = [];
  for (let p of [].concat(v || [])) {
    if (p && typeof p === 'object' && p['@id'] && !p.name && byId.get(p['@id'])) p = byId.get(p['@id']);
    if (!p) continue;
    if (typeof p === 'string') { splitAuthors(p).forEach(x => out.push({ name: x, org: false })); continue; }
    let name = p.name || [p.givenName, p.familyName].filter(Boolean).join(' ');
    if (Array.isArray(name)) name = name[0];
    if (!name) continue;
    const isOrg = typeOf(p).some(t => /Organization|Corporation|NewsMediaOrganization|GovernmentOrganization|EducationalOrganization/.test(t));
    if (p.givenName && p.familyName && !isOrg) out.push({ person: { given: cleanText(p.givenName), family: cleanText(p.familyName) } });
    else out.push({ name: cleanText(name), org: isOrg });
  }
  return out;
}

// ---------- title cleanup ----------
function cleanTitle(title, siteNames) {
  if (!title) return title;
  let t = cleanText(title);
  const seps = [' | ', ' - ', ' – ', ' — ', ' :: ', ' · ', ' • ', ' » '];
  for (let pass = 0; pass < 2; pass++) {
    for (const sep of seps) {
      const idx = t.lastIndexOf(sep);
      if (idx <= 0) continue;
      const tail = t.slice(idx + sep.length).trim().toLowerCase();
      const isSite = siteNames.some(s => s && (tail === s.toLowerCase() || s.toLowerCase().includes(tail) || tail.includes(s.toLowerCase().replace(/^the /, ''))))
        || /\.(com|org|net|co\.uk|gov|edu|io)$/.test(tail) || (sep === ' | ' && tail.split(' ').length <= 4);
      if (isSite) { t = t.slice(0, idx).trim(); break; }
    }
  }
  // Leading "Site Name | Title"
  for (const sep of [' | ', ': ']) {
    const idx = t.indexOf(sep);
    if (idx > 0 && siteNames.some(s => s && t.slice(0, idx).toLowerCase() === s.toLowerCase())) t = t.slice(idx + sep.length);
  }
  return t.trim();
}

function toNames(list, siteNames) {
  const out = [];
  const seen = new Set();
  for (const entry of list) {
    let n;
    if (entry.person) n = entry.person;
    else {
      const name = entry.name;
      if (!name || /^https?:\/\//.test(name) || name.length > 80 || /@/.test(name)) continue;
      if (/^(admin|administrator|editor|staff|guest|unknown|anonymous|user|webmaster|null|undefined)$/i.test(name)) continue;
      n = entry.org ? { literal: name } : parseName(name);
    }
    if (!n) continue;
    const key = (n.literal || `${n.given} ${n.family}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function isbnsIn(text) {
  const out = [];
  const re = /ISBN(?:-1[03])?:?\s*((?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dX])/gi;
  let m;
  while ((m = re.exec(text))) { const d = m[1].replace(/[\s-]/g, ''); if (validIsbn(d)) out.push(d); }
  return out;
}

// ---------- main HTML extractor ----------
export function extractFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const m = collectMeta($);
  const ld = collectJsonLd($);
  const byId = new Map(ld.filter(n => n['@id']).map(n => [n['@id'], n]));
  const host = hostOf(pageUrl);

  const rawTitle = m.get('citation_title', 'dc.title', 'dcterms.title', 'prism.title', 'eprints.title', 'bepress_citation_title')
    || m.get('og:title', 'twitter:title', 'sailthru.title', 'parsely-title', 'title', 'headline')
    || $('title').first().text() || $('h1').first().text();
  const primary = pickPrimary(ld, rawTitle);
  const publisherNode = primary?.publisher && (byId.get(primary.publisher['@id']) || primary.publisher);
  const isPartOf = primary?.isPartOf && (byId.get(primary.isPartOf['@id']) || primary.isPartOf);
  const websiteNode = ld.find(n => typeOf(n).includes('WebSite'));

  const siteName = m.get('citation_journal_title', 'prism.publicationname', 'dc.source')
    || m.get('og:site_name', 'application-name', 'apple-mobile-web-app-title', 'twitter:app:name:iphone')
    || ldText(isPartOf?.name && !typeOf(isPartOf).some(t => /WebPage/.test(t)) ? isPartOf : null)
    || ldText(websiteNode) || ldText(publisherNode) || siteNameFor(pageUrl);
  const knownSite = hostKey(host, SITE_NAMES) ? SITE_NAMES[hostKey(host, SITE_NAMES)] : null;
  const container = knownSite && (!siteName || siteName.length < 3 || siteName.toLowerCase().replace(/\W/g, '') === host.split('.')[0]) ? knownSite : siteName;

  // ----- title -----
  const scholarlyTitle = m.get('citation_title', 'dc.title', 'dcterms.title', 'prism.title', 'bepress_citation_title');
  let title = scholarlyTitle || ldText(primary?.headline) || m.get('og:title') || ldText(primary?.name) || m.get('twitter:title', 'sailthru.title', 'parsely-title', 'title') || $('title').first().text() || $('h1').first().text();
  if (!scholarlyTitle) title = cleanTitle(title, [container, siteName, knownSite, siteNameFor(pageUrl), ldText(publisherNode), host]);

  // ----- authors -----
  const siteNames = [container, siteName, knownSite, ldText(publisherNode)].filter(Boolean).map(s => s.toLowerCase());
  let authorList = [];
  const citationAuthors = m.all('citation_author').length ? m.all('citation_author') : m.all('bepress_citation_author');
  if (citationAuthors.length) authorList = citationAuthors.map(a => ({ person: parseName(a, { forcePerson: !looksLikeOrg(a) || a.includes(',') }) }));
  if (!authorList.length && m.all('dc.creator').length) authorList = m.all('dc.creator').flatMap(a => splitAuthors(a).map(name => ({ name })));
  if (!authorList.length && m.all('dcterms.creator').length) authorList = m.all('dcterms.creator').flatMap(a => splitAuthors(a).map(name => ({ name })));
  if (!authorList.length && primary?.author) authorList = ldPeople(primary.author, byId);
  if (!authorList.length && primary?.creator) authorList = ldPeople(primary.creator, byId);
  if (!authorList.length) {
    const metaAuthors = [...m.all('author'), ...m.all('article:author').filter(a => !/^https?:/.test(a)), ...m.all('parsely-author'), ...m.all('sailthru.author'), ...m.all('byl'), ...m.all('twitter:data1').filter((v, i) => /author|written/i.test(m.get('twitter:label1') || ''))];
    authorList = metaAuthors.flatMap(a => splitAuthors(a).map(name => ({ name })));
  }
  if (!authorList.length) {
    // Visible bylines
    const sel = ['[rel="author"]', '[itemprop="author"] [itemprop="name"]', '[itemprop="author"]', '.byline a', '.byline__name', '.byline-name', '.author-name', '.author__name', '.c-byline__author', '.article-author', '.post-author', '.entry-author', 'a[href*="/author/"]', 'a[href*="/authors/"]', 'a[href*="/people/"]', 'a[href*="/profile/"]', '.byline', '[class*="byline"]', '[data-testid*="byline"]', '[class*="author"] a', '[class*="Author"] a'];
    for (const s of sel) {
      const found = $(s).slice(0, 8).map((i, el) => cleanText($(el).text())).get().filter(t => t && t.length < 80 && t.split(' ').length <= 6 && !/^(more|follow|view|see|share|by)$/i.test(t));
      if (found.length) { authorList = [...new Set(found)].flatMap(a => splitAuthors(a).map(name => ({ name }))); break; }
    }
  }
  let author = toNames(authorList, siteNames);
  // An "author" that is just the website name isn't helpful to most styles
  author = author.filter(a => !(a.literal && siteNames.some(s => s === a.literal.toLowerCase() || s.replace(/^the /, '') === a.literal.toLowerCase().replace(/^the /, ''))));
  // "CDC" on cdc.gov -> "Centers for Disease Control and Prevention"
  author = author.map(a => a.literal && /^[A-Z]{2,8}$/.test(a.literal) && host.split('.').includes(a.literal.toLowerCase()) && knownSite ? { literal: knownSite } : a);
  if (author.length > 30) author = author.slice(0, 30);

  // ----- dates -----
  const issued = parseDate(m.get('citation_publication_date', 'citation_date', 'citation_online_date', 'citation_cover_date', 'dc.date.issued', 'dc.date', 'dcterms.issued', 'dcterms.date', 'prism.publicationdate', 'prism.coverdate', 'bepress_citation_date'))
    || parseDate(primary?.datePublished) || parseDate(primary?.uploadDate)
    || parseDate(m.get('article:published_time', 'og:published_time', 'published_time', 'datepublished', 'uploaddate', 'pubdate', 'publishdate', 'publish-date', 'publication_date', 'date', 'sailthru.date', 'parsely-pub-date', 'dc.date.created', 'dcterms.created', 'article.published', 'og:article:published_time', 'release_date', 'cxenseparse:recs:publishtime', 'datecreated'))
    || parseDate($('time[datetime][itemprop="datePublished"], [itemprop="datePublished"]').first().attr('datetime') || $('[itemprop="datePublished"]').first().attr('content'))
    || parseDate($('article time[datetime], main time[datetime], header time[datetime]').first().attr('datetime'))
    || parseDate(primary?.dateCreated)
    || parseDate(m.get('article:modified_time', 'og:updated_time', 'last-modified', 'dcterms.modified')) || parseDate(primary?.dateModified)
    || parseDate($('time[datetime]').first().attr('datetime'));

  // ----- identifiers -----
  let doi = m.get('citation_doi', 'prism.doi', 'bepress_citation_doi', 'dc.identifier.doi', 'doi');
  if (!doi) for (const v of [...m.all('dc.identifier'), ...m.all('dcterms.identifier'), ...m.all('citation_identifier')]) { const mm = v.match(/10\.\d{4,9}\/\S+/); if (mm) { doi = mm[0]; break; } }
  if (!doi && primary?.identifier) { const mm = JSON.stringify(primary.identifier).match(/10\.\d{4,9}\/[^"\s]+/); if (mm) doi = mm[0]; }
  if (doi) doi = doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');

  let isbn = m.get('citation_isbn', 'books:isbn', 'book:isbn', 'isbn') || (primary?.isbn && String([].concat(primary.isbn)[0]));
  if (isbn) isbn = isbn.replace(/[\s-]/g, '');
  if (isbn && !validIsbn(isbn)) isbn = undefined;

  // ----- type detection -----
  const ogType = (m.get('og:type') || '').toLowerCase();
  const ldTypes = primary ? typeOf(primary).join(' ') : '';
  let type = 'webpage';
  let genre;
  if (m.get('citation_journal_title') || /ScholarlyArticle/.test(ldTypes)) type = 'article-journal';
  if (m.get('citation_conference_title', 'citation_conference')) type = 'paper-conference';
  if (m.get('citation_dissertation_institution')) type = 'thesis';
  if (m.get('citation_technical_report_institution', 'citation_technical_report_number')) type = 'report';
  if (m.get('citation_inbook_title') || /\bChapter\b/.test(ldTypes)) type = 'chapter';
  if (type === 'webpage') {
    if (/\bBook\b/.test(ldTypes) || ogType === 'book' || ogType === 'books.book' || (isbn && !m.get('citation_journal_title'))) type = 'book';
    else if (/VideoObject|Movie|TVEpisode/.test(ldTypes) || ogType.startsWith('video')) { type = 'webpage'; genre = 'Video'; }
    else if (/PodcastEpisode/.test(ldTypes)) { type = 'song'; genre = 'Podcast episode'; }
    else if (/NewsArticle/.test(ldTypes) || hostKey(host, NEWS_HOSTS)) type = 'article-newspaper';
    else if (hostKey(host, MAGAZINE_HOSTS)) type = 'article-magazine';
    else if (/BlogPosting/.test(ldTypes) || /(^|\.)(medium\.com|substack\.com|wordpress\.com|blogspot\.com|ghost\.io)$/.test(host) || /\bblog\b/i.test(host) || /\/blog\//.test(pageUrl)) type = 'post-weblog';
    else if (/Report/.test(ldTypes)) type = 'report';
    else if (/Dataset/.test(ldTypes)) type = 'dataset';
    else if (/SocialMediaPosting|DiscussionForumPosting/.test(ldTypes)) type = 'post';
  }

  // ----- url -----
  const canonical = $('link[rel="canonical"]').attr('href') || m.get('og:url', 'citation_public_url', 'citation_abstract_html_url');
  let url = cleanUrl(pageUrl);
  try {
    if (canonical) {
      const c = new URL(canonical, pageUrl).toString();
      if (hostOf(c) === host) url = cleanUrl(c);
    }
  } catch {}

  const item = {
    type,
    genre,
    title: cleanText(title),
    author,
    'container-title': container,
    publisher: m.get('citation_publisher', 'dc.publisher', 'dcterms.publisher', 'citation_dissertation_institution', 'citation_technical_report_institution') || (ldText(publisherNode) && ldText(publisherNode) !== container ? ldText(publisherNode) : undefined),
    issued,
    accessed: today(),
    URL: url,
    DOI: doi,
    ISBN: isbn,
    ISSN: m.get('citation_issn', 'prism.issn', 'prism.eissn'),
    volume: m.get('citation_volume', 'prism.volume', 'bepress_citation_volume'),
    issue: m.get('citation_issue', 'prism.number', 'bepress_citation_issue'),
    page: (() => {
      const fp = m.get('citation_firstpage', 'prism.startingpage', 'bepress_citation_firstpage');
      const lp = m.get('citation_lastpage', 'prism.endingpage', 'bepress_citation_lastpage');
      return fp ? (lp && lp !== fp ? `${fp}-${lp}` : fp) : undefined;
    })(),
    'number': m.get('citation_technical_report_number', 'citation_arxiv_id') || undefined,
    language: m.get('citation_language', 'dc.language', 'og:locale') ? normalizeLang(m.get('citation_language', 'dc.language', 'og:locale')) : normalizeLang($('html').attr('lang')),
    abstract: m.get('citation_abstract', 'dc.description', 'description', 'og:description', 'twitter:description'),
    keyword: m.get('citation_keywords', 'keywords', 'news_keywords'),
    'event-title': m.get('citation_conference_title', 'citation_conference'),
    PMID: m.get('citation_pmid'),
  };
  // "Healthline Media" vs site "Healthline": don't print both
  if (item.publisher && item['container-title'] && type !== 'article-journal') {
    const a = item.publisher.toLowerCase(), b = item['container-title'].toLowerCase();
    if (a.includes(b) || b.includes(a)) delete item.publisher;
  }
  if (type === 'book' || type === 'chapter') {
    if (type === 'chapter') item['container-title'] = m.get('citation_inbook_title') || item['container-title'];
    else delete item['container-title'];
    item['publisher-place'] = m.get('citation_publisher_place');
  }
  if (type === 'thesis') item.genre = m.get('citation_dissertation_name') || 'Doctoral dissertation';
  if (type === 'article-journal' && m.get('citation_journal_abbrev')) item['container-title-short'] = m.get('citation_journal_abbrev');
  if (item.page && type === 'webpage') delete item.page;
  if (primary?.duration && genre === 'Video') item.dimensions = isoDuration(primary.duration);

  return { item: prune(item), hints: { doi, isbn, arxiv: m.get('citation_arxiv_id'), pmid: m.get('citation_pmid') }, text: $('body').text().slice(0, 200000) };
}

function normalizeLang(l) {
  if (!l) return undefined;
  l = l.replace('_', '-').trim();
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(l)) return undefined;
  return l;
}

function isoDuration(d) {
  const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
  return h ? `${h}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${mi}:${String(s).padStart(2, '0')}`;
}

// ---------- special sites ----------
async function youtube(url) {
  const o = await getJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  const item = { type: 'webpage', genre: 'Video', title: o.title, author: [{ literal: o.author_name }], 'container-title': 'YouTube', URL: cleanUrl(url), accessed: today() };
  try {
    const page = await fetchPage(url);
    if (page.kind === 'html') {
      const $ = cheerio.load(page.html);
      const d = $('meta[itemprop="datePublished"]').attr('content') || $('meta[itemprop="uploadDate"]').attr('content') || (page.html.match(/"publishDate":"([^"]+)"/) || [])[1] || (page.html.match(/"uploadDate":"([^"]+)"/) || [])[1];
      item.issued = d && /T/.test(d) ? parseDate(new Date(d).toISOString()) : parseDate(d);
      const dur = $('meta[itemprop="duration"]').attr('content');
      if (dur) item.dimensions = isoDuration(dur);
    }
  } catch {}
  // Short canonical URL: https://www.youtube.com/watch?v=ID
  try {
    const u = new URL(url);
    const id = u.hostname.includes('youtu.be') ? u.pathname.slice(1) : u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/) || [])[1];
    if (id) item.URL = `https://www.youtube.com/watch?v=${id}`;
  } catch {}
  return prune(item);
}

async function vimeo(url) {
  const o = await getJSON(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
  return prune({ type: 'webpage', genre: 'Video', title: o.title, author: [parseName(o.author_name) || { literal: o.author_name }], 'container-title': 'Vimeo', issued: parseDate(o.upload_date), URL: cleanUrl(url), accessed: today(), dimensions: o.duration ? isoDuration(`PT${o.duration}S`) : undefined });
}

async function wikipedia(url) {
  const u = new URL(url);
  const lang = u.hostname.split('.')[0];
  const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ''));
  const s = await getJSON(`https://${lang === 'www' || lang === 'm' ? 'en' : lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  return prune({
    type: 'entry-encyclopedia', title: s.title || title.replace(/_/g, ' '), 'container-title': 'Wikipedia',
    issued: parseDate(s.timestamp), URL: s.content_urls?.desktop?.page || cleanUrl(url), accessed: today(), language: s.lang,
  });
}

function amazonIsbn(url) {
  const m = url.match(/\/(?:dp|gp\/product|product|ASIN)\/([0-9]{9}[0-9X])(?:[/?]|$)/i);
  return m && validIsbn(m[1]) ? m[1] : null;
}

async function googleBooks(url) {
  const id = new URL(url).searchParams.get('id') || (url.match(/books\/edition\/[^/]+\/([^/?]+)/) || [])[1];
  if (!id) return null;
  const v = await getJSON(`https://www.googleapis.com/books/v1/volumes/${id}${process.env.GOOGLE_BOOKS_API_KEY ? `?key=${process.env.GOOGLE_BOOKS_API_KEY}` : ''}`);
  const item = googleBookToCsl(v);
  delete item._thumb;
  if (item.ISBN) { try { return { ...(await lookupIsbn(item.ISBN)), ...pickDefined(item) }; } catch {} }
  return { ...item, accessed: today() };
}

function pickDefined(o) { return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))); }

function extractFromPdf(buf, url) {
  const head = buf.subarray(0, 3_000_000).toString('latin1');
  const doi = (head.match(/\b(10\.\d{4,9}\/[^\s"<>()\]]+)/) || [])[1];
  const t = (head.match(/\/Title\s*\(([^)]{3,300})\)/) || [])[1];
  const a = (head.match(/\/Author\s*\(([^)]{2,300})\)/) || [])[1];
  const d = (head.match(/\/CreationDate\s*\(D:(\d{4})(\d{2})?(\d{2})?/) || []);
  const xmpTitle = (head.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/) || [])[1];
  const xmpCreators = [...(head.match(/<dc:creator>[\s\S]*?<\/dc:creator>/) || [''])[0].matchAll(/<rdf:li[^>]*>([^<]+)<\/rdf:li>/g)].map(x => x[1]);
  const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
  const pdfStr = s => s && !/^\s*(untitled|microsoft word|document\d*|þÿ)/i.test(s) ? s.replace(/\\(\d{3})/g, (m, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, '$1').trim() : null;
  const title = cleanText(xmpTitle || pdfStr(t) || fileName);
  const authors = (xmpCreators.length ? xmpCreators : (pdfStr(a) ? splitAuthors(pdfStr(a)) : [])).filter(x => /^[\p{L} .,'-]+$/u.test(x) && /\p{L}{2}/u.test(x));
  return {
    item: prune({
      type: 'webpage', title, author: authors.map(x => parseName(x)).filter(Boolean), 'container-title': siteNameFor(url),
      issued: d[1] ? parseDate(`${d[1]}-${d[2] || '01'}-${d[3] || '01'}`) : undefined, URL: cleanUrl(url), accessed: today(),
    }),
    hints: { doi: doi?.replace(/[.,;]$/, '') },
  };
}

function fromUrlOnly(url) {
  const u = new URL(url);
  const slug = u.pathname.split('/').filter(Boolean).pop() || '';
  const title = decodeURIComponent(slug).replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b\d{5,}\b/g, '').trim();
  const date = u.pathname.match(/\/(20\d\d|19\d\d)\/(\d{1,2})\/(\d{1,2})\//);
  return prune({
    type: 'webpage', title: title ? title[0].toUpperCase() + title.slice(1) : siteNameFor(url),
    'container-title': siteNameFor(url), URL: cleanUrl(url), accessed: today(),
    issued: date ? parseDate(`${date[1]}-${date[2]}-${date[3]}`) : undefined,
  });
}

// Merge scholarly metadata over page metadata, keeping the page URL.
function mergeScholarly(page, scholarly) {
  const merged = { ...page, ...pickDefined(scholarly) };
  if (page.URL && !/doi\.org/.test(page.URL) && scholarly.type !== 'article-journal') merged.URL = page.URL;
  if (scholarly.DOI) merged.URL = page.URL && !/doi\.org/.test(page.URL) ? page.URL : `https://doi.org/${scholarly.DOI}`;
  if (!scholarly.author?.length && page.author?.length) merged.author = page.author;
  delete merged.genre;
  if (scholarly.genre) merged.genre = scholarly.genre;
  merged.accessed = today();
  return merged;
}

// Optional: a self-hosted zotero/translation-server for sites our scanner
// can't read well (JSTOR, IEEE, ScienceDirect…). Set TRANSLATION_SERVER_URL.
async function viaTranslationServer(url) {
  const base = process.env.TRANSLATION_SERVER_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/web`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: url, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const zotItems = await res.json();
    if (!Array.isArray(zotItems) || !zotItems.length) return null;
    const exp = await fetch(`${base.replace(/\/$/, '')}/export?format=csljson`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(zotItems.slice(0, 1)), signal: AbortSignal.timeout(15000) });
    if (!exp.ok) return null;
    const [csl] = await exp.json();
    if (!csl?.title) return null;
    const { id, ...rest } = csl;
    return prune({ ...rest, URL: rest.URL || cleanUrl(url), accessed: today() });
  } catch { return null; }
}

const isWeak = item => !item?.author?.length && !item?.issued;

export async function citeUrl(inputUrl) {
  const url = inputUrl.trim();
  const host = hostOf(url);
  const warnings = [];

  // Fast paths for sites with good APIs
  try {
    if (/^(youtube\.com|youtu\.be|music\.youtube\.com)$/.test(host)) return { item: await youtube(url), source: 'YouTube' };
    if (host === 'vimeo.com') return { item: await vimeo(url), source: 'Vimeo' };
    if (/wikipedia\.org$/.test(host) && /\/wiki\//.test(url)) return { item: await wikipedia(url), source: 'Wikipedia' };
    if (/doi\.org$/.test(host)) return { item: await lookupDoi(new URL(url).pathname.slice(1)), source: 'DOI' };
    if (host === 'arxiv.org') { const id = (url.match(/(?:abs|pdf)\/([^?#]+?)(?:v\d+)?(?:\.pdf)?(?:[?#]|$)/) || [])[1]; if (id) return { item: await lookupArxiv(id), source: 'arXiv' }; }
    if (/(^|\.)ncbi\.nlm\.nih\.gov$/.test(host) && /PMC\d+/i.test(url)) return { item: { ...(await lookupPmc(url.match(/PMC(\d+)/i)[1])), URL: cleanUrl(url) }, source: 'PubMed Central' };
    if (/pubmed\.ncbi\.nlm\.nih\.gov$/.test(host)) { const id = (url.match(/\/(\d+)\/?/) || [])[1]; if (id) return { item: { ...(await lookupPmid(id)), URL: cleanUrl(url) }, source: 'PubMed' }; }
    // Publishers that block servers outright: resolve their article IDs instead
    if (/(^|\.)(sciencedirect\.com|cell\.com|thelancet\.com|elsevier\.com)$/.test(host)) {
      const pii = (url.match(/\/pii\/(S?[0-9X()-]{15,})/i) || url.match(/\/(S\d{4}-?\d{3}[\dX]\(?\d{2}\)?\d{5}-?[\dX])/i) || [])[1];
      if (pii) return { item: { ...(await lookupPii(pii)), accessed: today() }, source: 'DOI' };
    }
    if (host === 'jstor.org') { const id = (url.match(/\/stable\/(?:pdf\/)?(\d+)/) || [])[1]; if (id) return { item: await lookupDoi(`10.2307/${id}`), source: 'DOI' }; }
    if (/(^|\.)amazon\./.test(host)) { const isbn = amazonIsbn(url); if (isbn) return { item: await lookupIsbn(isbn), source: 'ISBN' }; }
    if (/^books\.google\./.test(host) || /google\.[a-z.]+$/.test(host) && /\/books\//.test(url)) { const r = await googleBooks(url); if (r) return { item: r, source: 'Google Books' }; }
  } catch (e) { warnings.push(`Quick lookup failed (${e.message}); scanned the page instead.`); }

  // DOI embedded in a publisher URL (e.g. /doi/10.1177/...)
  const urlDoi = (host === 'nature.com' && (url.match(/\/articles\/([a-z0-9.-]+)/i) || [])[1] && `10.1038/${url.match(/\/articles\/([a-z0-9.-]+)/i)[1]}`) || (decodeURIComponent(url).match(/\/(?:doi|abs|full|pdf|epdf|article|chapter|book)\/(?:abs\/|full\/|pdf\/|epdf\/)?(10\.\d{4,9}\/[^?#\s]+?)(?:\.pdf)?(?:[?#]|$)/) || decodeURIComponent(url).match(/[?&]doi=(10\.\d{4,9}\/[^&#\s]+)/) || [])[1];

  let page;
  try { page = await fetchPage(url); }
  catch (e) {
    if (urlDoi) { try { return { item: mergeScholarly({ URL: cleanUrl(url) }, await lookupDoi(urlDoi)), source: 'DOI' }; } catch {} }
    const ts = await viaTranslationServer(url);
    if (ts) return { item: ts, source: 'Zotero translator' };
    return { item: fromUrlOnly(url), source: 'URL', warnings: [`We couldn't open that page (${e.message}), so we guessed from the link. Please check the details.`] };
  }

  let result;
  if (page.kind === 'pdf') result = extractFromPdf(page.buf, page.finalUrl || url);
  else result = extractFromHtml(page.html, page.finalUrl || url);
  let { item, hints } = result;
  if (page.status === 404) {
    return { item: fromUrlOnly(url), source: 'URL', warnings: ['That page says "not found", so we guessed from the link. Double-check the link and details.'] };
  }

  // Enrich from authoritative sources
  const doi = hints.doi || urlDoi;
  let source = page.kind === 'pdf' ? 'PDF' : 'Webpage';
  if (doi) {
    try { item = mergeScholarly(item, await lookupDoi(doi)); source = 'DOI'; } catch {}
  } else if (hints.arxiv) {
    try { item = mergeScholarly(item, await lookupArxiv(hints.arxiv)); source = 'arXiv'; } catch {}
  } else if (hints.pmid && item.type === 'article-journal' && !item['container-title']) {
    try { item = mergeScholarly(item, await lookupPmid(hints.pmid)); source = 'PubMed'; } catch {}
  } else if (item.type === 'book') {
    const isbn = hints.isbn || isbnsIn(result.text || '')[0];
    if (isbn) {
      try {
        const book = await lookupIsbn(isbn);
        item = { ...item, ...pickDefined(book), URL: undefined };
        source = 'ISBN';
      } catch {}
    }
  }
  if (source === 'Webpage' && isWeak(item)) {
    const ts = await viaTranslationServer(url);
    if (ts) { item = { ...item, ...pickDefined(ts) }; source = 'Zotero translator'; }
  }
  if (!item.title) item.title = fromUrlOnly(url).title;
  return { item: prune(item), source, warnings };
}
