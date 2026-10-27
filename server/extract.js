// Scans a web page for every bit of citation metadata it exposes:
// Highwire/Google Scholar citation_* tags, Dublin Core, PRISM, Open Graph,
// Twitter cards, JSON-LD (schema.org), microdata, bylines, <time> tags…
// and enriches it from DOI/ISBN/oEmbed/Wikipedia APIs when possible.
import * as cheerio from 'cheerio';
import zlib from 'node:zlib';
import { safeFetch } from './net.js';
import { isLegalHost, legalFromUrl, legalFromPage } from './legal.js';
import { capitaliseNames } from './casing.js';
import { parseName, splitAuthors, parseDate, cleanText, today, looksLikeOrg, looksLikePersonName } from './names.js';
import { lookupDoi, lookupIsbn, lookupArxiv, lookupPmid, lookupPmc, lookupPii, findByTitle, validIsbn, getJSON, prune, googleBookToCsl } from './lookup.js';

// One honest request per page: a normal browser string plus who we are, like
// other link-preview services. Sites that block automated access are respected
// — we fall back to official sources (DOI, Crossref title lookup) instead.
const PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 citemyshi/1.0 (+https://citemyshi.web.app)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Well-known sites whose og:site_name is missing or unhelpful
const SITE_NAMES = {
  'nytimes.com': 'The New York Times', 'washingtonpost.com': 'The Washington Post', 'wsj.com': 'The Wall Street Journal',
  'theguardian.com': 'The Guardian', 'bbc.com': 'BBC News', 'bbc.co.uk': 'BBC News', 'cnn.com': 'CNN', 'reuters.com': 'Reuters',
  'apnews.com': 'AP News', 'npr.org': 'NPR', 'theatlantic.com': 'The Atlantic', 'newyorker.com': 'The New Yorker',
  'economist.com': 'The Economist', 'forbes.com': 'Forbes', 'bloomberg.com': 'Bloomberg', 'time.com': 'Time',
  'latimes.com': 'Los Angeles Times', 'usatoday.com': 'USA Today', 'nbcnews.com': 'NBC News', 'cbsnews.com': 'CBS News',
  'abcnews.go.com': 'ABC News', 'foxnews.com': 'Fox News', 'politico.com': 'Politico', 'vox.com': 'Vox', 'wired.com': 'Wired',
  'theverge.com': 'The Verge', 'nature.com': 'Nature', 'sciencedirect.com': 'ScienceDirect', 'britannica.com': 'Encyclopaedia Britannica',
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
  'hbr.org': 'Harvard Business Review', 'news.com.au': 'news.com.au', 'theage.com.au': 'The Age', 'theaustralian.com.au': 'The Australian',
  'afr.com': 'Australian Financial Review', 'sbs.com.au': 'SBS News', 'brisbanetimes.com.au': 'Brisbane Times', 'canberratimes.com.au': 'The Canberra Times',
  'nzherald.co.nz': 'The New Zealand Herald', 'rnz.co.nz': 'RNZ', 'technologyreview.com': 'MIT Technology Review',
};
// Organisations students cite most: their pages are written by the organisation,
// which APA 7 (9.11) makes the author ("World Health Organization. (2023)…")
const ORGS = {
  'who.int': 'World Health Organization', 'cdc.gov': 'Centers for Disease Control and Prevention', 'nih.gov': 'National Institutes of Health',
  'nhs.uk': 'NHS', 'un.org': 'United Nations', 'unicef.org': 'UNICEF', 'oecd.org': 'OECD', 'ipcc.ch': 'Intergovernmental Panel on Climate Change',
  'worldbank.org': 'World Bank', 'imf.org': 'International Monetary Fund', 'unesco.org': 'UNESCO', 'unhcr.org': 'UNHCR', 'ilo.org': 'International Labour Organization',
  'wto.org': 'World Trade Organization', 'weforum.org': 'World Economic Forum', 'amnesty.org': 'Amnesty International', 'hrw.org': 'Human Rights Watch',
  'abs.gov.au': 'Australian Bureau of Statistics', 'aihw.gov.au': 'Australian Institute of Health and Welfare', 'rba.gov.au': 'Reserve Bank of Australia',
  'csiro.au': 'CSIRO', 'bom.gov.au': 'Bureau of Meteorology', 'healthdirect.gov.au': 'Healthdirect Australia', 'beyondblue.org.au': 'Beyond Blue',
  'blackdoginstitute.org.au': 'Black Dog Institute', 'cancer.org.au': 'Cancer Council Australia', 'heartfoundation.org.au': 'Heart Foundation',
  'alrc.gov.au': 'Australian Law Reform Commission', 'humanrights.gov.au': 'Australian Human Rights Commission', 'aph.gov.au': 'Parliament of Australia',
  'dfat.gov.au': 'Department of Foreign Affairs and Trade', 'ato.gov.au': 'Australian Taxation Office', 'asic.gov.au': 'Australian Securities and Investments Commission',
  'accc.gov.au': 'Australian Competition and Consumer Commission', 'ga.gov.au': 'Geoscience Australia', 'naa.gov.au': 'National Archives of Australia',
  'nla.gov.au': 'National Library of Australia', 'aiatsis.gov.au': 'AIATSIS', 'pc.gov.au': 'Productivity Commission', 'aec.gov.au': 'Australian Electoral Commission',
  'esafety.gov.au': 'eSafety Commissioner', 'safeworkaustralia.gov.au': 'Safe Work Australia', 'fairwork.gov.au': 'Fair Work Ombudsman',
  'headspace.org.au': 'headspace', 'lifeline.org.au': 'Lifeline Australia', 'redcross.org.au': 'Australian Red Cross', 'climatecouncil.org.au': 'Climate Council',
  'apa.org': 'American Psychological Association', 'mayoclinic.org': 'Mayo Clinic', 'clevelandclinic.org': 'Cleveland Clinic', 'nasa.gov': 'NASA',
  'noaa.gov': 'National Oceanic and Atmospheric Administration', 'epa.gov': 'U.S. Environmental Protection Agency', 'fda.gov': 'U.S. Food and Drug Administration',
  'census.gov': 'U.S. Census Bureau', 'bls.gov': 'U.S. Bureau of Labor Statistics', 'ons.gov.uk': 'Office for National Statistics',
  'nice.org.uk': 'National Institute for Health and Care Excellence', 'stats.govt.nz': 'Stats NZ', 'statcan.gc.ca': 'Statistics Canada',
  'pewresearch.org': 'Pew Research Center', 'brookings.edu': 'Brookings Institution', 'rand.org': 'RAND Corporation', 'kff.org': 'KFF',
  'mckinsey.com': 'McKinsey & Company', 'deloitte.com': 'Deloitte', 'pwc.com': 'PwC', 'kpmg.com': 'KPMG', 'msf.org': 'Médecins Sans Frontières',
  'oxfam.org': 'Oxfam International', 'savethechildren.org': 'Save the Children', 'wwf.org.au': 'WWF-Australia', 'unaids.org': 'UNAIDS',
};
// Site names that differ from the organisation behind them
const SITE_OVERRIDES = { 'betterhealth.vic.gov.au': 'Better Health Channel', 'nhs.uk': 'NHS', 'healthdirect.gov.au': 'Healthdirect' };
const NEWS_HOSTS = new Set(['theconversation.com', 'news.com.au', 'theage.com.au', 'theaustralian.com.au', 'afr.com', 'sbs.com.au', '9news.com.au', '7news.com.au',
  'brisbanetimes.com.au', 'watoday.com.au', 'canberratimes.com.au', 'couriermail.com.au', 'heraldsun.com.au', 'dailytelegraph.com.au', 'adelaidenow.com.au',
  'perthnow.com.au', 'crikey.com.au', 'nzherald.co.nz', 'stuff.co.nz', 'rnz.co.nz', 'inews.co.uk', 'standard.co.uk', 'news.sky.com', 'nypost.com', 'propublica.org',
  'channelnewsasia.com', 'straitstimes.com', 'dw.com', 'france24.com', 'euronews.com', 'theglobeandmail.com', 'thestar.com', 'globalnews.ca', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'theguardian.com', 'bbc.com', 'bbc.co.uk', 'cnn.com', 'reuters.com', 'apnews.com', 'npr.org', 'latimes.com', 'usatoday.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'foxnews.com', 'politico.com', 'bloomberg.com', 'ft.com', 'independent.co.uk', 'telegraph.co.uk', 'aljazeera.com', 'huffpost.com', 'cnbc.com', 'axios.com', 'thehill.com', 'newsweek.com', 'chicagotribune.com', 'bostonglobe.com', 'sfchronicle.com', 'dailymail.co.uk', 'thesun.co.uk', 'mirror.co.uk', 'thetimes.co.uk', 'lemonde.fr', 'spiegel.de', 'elpais.com', 'scmp.com', 'japantimes.co.jp', 'hindustantimes.com', 'timesofindia.indiatimes.com', 'thehindu.com', 'ndtv.com', 'indianexpress.com', 'smh.com.au', 'abc.net.au', 'cbc.ca', 'economist.com', 'time.com', 'usnews.com', 'businessinsider.com']);
const MAGAZINE_HOSTS = new Set(['hbr.org', 'theatlantic.com', 'newstatesman.com', 'spectator.co.uk', 'themonthly.com.au', 'thesaturdaypaper.com.au', 'harpers.org', 'foreignaffairs.com', 'foreignpolicy.com', 'technologyreview.com', 'fastcompany.com', 'inc.com', 'newyorker.com', 'wired.com', 'vox.com', 'theverge.com', 'smithsonianmag.com', 'scientificamerican.com', 'nationalgeographic.com', 'psychologytoday.com', 'forbes.com', 'vogue.com', 'rollingstone.com', 'variety.com', 'hollywoodreporter.com', 'slate.com', 'salon.com', 'newscientist.com', 'arstechnica.com']);

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
// One attempt with a given set of headers. Rejects on block/error so attempts can race.
async function tryFetch(url, headers, timeout) {
  const res = await safeFetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok && res.status !== 404) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(res.url)) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { kind: 'pdf', buf, finalUrl: res.url, status: res.status };
  }
  const html = await readLimited(res, 4_000_000);
  // Cloudflare / bot-wall pages don't contain metadata
  const wall = /<title>\s*(Just a moment|Attention Required|Access denied|Access Denied|Are you a robot|Please verify|Robot or human|Client Challenge|Security check|Verifying|One moment|Pardon Our Interruption|Checking your browser|Request blocked)/i.test(html)
    || (hostOf(res.url) && hostOf(res.url) !== hostOf(url) && /^(idp|auth|login|signin|sso|accounts|consent)\./.test(new URL(res.url).hostname));
  if (wall) throw new Error('This site blocks automated access');
  return { kind: 'html', html, finalUrl: res.url, status: res.status };
}

async function fetchPage(url) {
  try { return await tryFetch(url, PAGE_HEADERS, 9000); }
  catch (e) {
    if (e.name === 'TimeoutError' || /timeout|aborted/i.test(e.message)) throw new Error('The site took too long to respond');
    if (e.status === 403 || e.status === 401 || e.status === 429) throw new Error('This site blocks automated access');
    throw e;
  }
}

// Citation metadata lives in <head> (plus bylines/JSON-LD near the top of the
// body), so once the head has arrived we only wait a little longer for the
// rest — slow sites can take seconds to trickle out the whole page.
async function readLimited(res, max, { afterHeadMs = 700, afterHeadBytes = 500_000 } = {}) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0, headAt = -1, deadline = Infinity, tail = '';
  while (true) {
    const wait = deadline - Date.now();
    if (wait <= 0) { reader.cancel().catch(() => {}); break; }
    const next = Number.isFinite(wait)
      ? await Promise.race([reader.read(), new Promise(r => setTimeout(() => r({ timeout: true }), wait))])
      : await reader.read();
    if (next.timeout) { reader.cancel().catch(() => {}); break; }
    if (next.done) break;
    chunks.push(next.value); size += next.value.length;
    if (headAt < 0) {
      const text = tail + Buffer.from(next.value).toString('latin1');
      if (/<\/head>/i.test(text)) { headAt = size; deadline = Date.now() + afterHeadMs; }
      tail = text.slice(-16);
    } else if (size - headAt > afterHeadBytes) { reader.cancel().catch(() => {}); break; }
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

// Australian government sites use AGLS: "scheme=AGLSTERMS.AglsAgent; corporateName=Reserve Bank of Australia; address=…"
function aglsValue(v) {
  if (!v) return v;
  const s = String(v);
  if (!/=/.test(s)) return s;
  const m = s.match(/(?:^|;)\s*(?:corporateName|personalName|name)\s*=\s*([^;]+)/i);
  return m ? m[1].trim() : null;
}

// "Page last reviewed: 19 February 2025", "Reviewed on: 17-01-2023", WHO's <span class="timestamp">
const DATE_LABEL = /(page last (?:reviewed|updated)|last (?:updated|reviewed|modified|revised)|reviewed on|updated on|date (?:published|updated)|published on|first published|published|updated|posted on)\s*:?\s*((?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4})|(?:[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})|(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{4})|(?:\d{4}-\d{2}-\d{2}))/gi;
function visibleDates($, dayFirst) {
  const out = { updated: null, published: null };
  const text = $('main').text() || $('article').text() || $('body').text();
  // Only the top of the page: the byline area, not "updated" dates in related-article lists
  for (const m of String(text).replace(/\s+/g, ' ').slice(0, 6000).matchAll(DATE_LABEL)) {
    const d = parseDate(m[2], { dayFirst });
    if (!d || d['date-parts'][0].length < 2) continue;
    if (/review|updat|modif|revis/i.test(m[1])) out.updated ||= d; else out.published ||= d;
  }
  if (!out.published) {
    for (const sel of ['.timestamp', '.date-published', '.published-date', '.publish-date', '.article-date', '.post-date', '.entry-date', '.pubdate', 'header .date', '.article-meta .date']) {
      const t = cleanText($(sel).first().text());
      const d = t && t.length < 40 ? parseDate(t, { dayFirst }) : null;
      if (d && d['date-parts'][0].length === 3) { out.published = d; break; }
    }
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
// Drop scripts/styles/SVG before parsing (keeping JSON-LD): far less work for
// the parser, which matters a lot on small hosting CPUs.
function slimHtml(html) {
  return html
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(style|svg|noscript|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .slice(0, 1_500_000);
}

export function extractFromHtml(html, pageUrl) {
  const $ = cheerio.load(slimHtml(html));
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
  const orgKey = hostKey(host, ORGS);
  const knownOrg = orgKey ? ORGS[orgKey] : null;
  const override = hostKey(host, SITE_OVERRIDES);
  const knownSite = override ? SITE_OVERRIDES[override] : hostKey(host, SITE_NAMES) ? SITE_NAMES[hostKey(host, SITE_NAMES)] : knownOrg;
  // A site's own og:site_name is often a section ("Diabetes" on cdc.gov) or a bare domain ("nhs.uk")
  const weakSiteName = !siteName || siteName.length < 3 || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(siteName) || siteName.toLowerCase().replace(/\W/g, '') === host.split('.')[0] || /^[A-Z]{2,4}$/.test(siteName) && !host.includes(siteName.toLowerCase());
  const container = knownSite && (weakSiteName || override || knownOrg) ? knownSite : siteName;

  // ----- title -----
  const scholarlyTitle = m.get('citation_title', 'prism.title', 'bepress_citation_title');
  let title = scholarlyTitle || ldText(primary?.headline) || m.get('og:title') || m.get('dc.title', 'dcterms.title') || ldText(primary?.name) || m.get('twitter:title', 'sailthru.title', 'parsely-title', 'title') || $('title').first().text() || $('h1').first().text();
  if (!scholarlyTitle) title = cleanTitle(title, [container, siteName, knownSite, siteNameFor(pageUrl), ldText(publisherNode), host]);

  // ----- authors -----
  const siteNames = [container, siteName, knownSite, ldText(publisherNode)].filter(Boolean).map(s => s.toLowerCase());
  let authorList = [];
  const citationAuthors = m.all('citation_author').length ? m.all('citation_author') : m.all('bepress_citation_author');
  if (citationAuthors.length) authorList = citationAuthors.map(a => ({ person: parseName(a, { forcePerson: !looksLikeOrg(a) || a.includes(',') }) }));
  const dcCreators = [...m.all('dc.creator'), ...m.all('dcterms.creator')];
  if (!authorList.length && dcCreators.length) {
    authorList = dcCreators.flatMap(a => {
      if (/corporateName\s*=/i.test(a)) return [{ name: aglsValue(a), org: true }];
      const v = aglsValue(a);
      return v ? splitAuthors(v).map(name => ({ name, org: looksLikeOrg(v) && !/,/.test(v) })) : [];
    });
  }
  if (!authorList.length && primary?.author) authorList = ldPeople(primary.author, byId);
  if (!authorList.length && primary?.creator) authorList = ldPeople(primary.creator, byId);
  if (!authorList.length) {
    const metaAuthors = [...m.all('author'), ...m.all('article:author').filter(a => !/^https?:/.test(a)), ...m.all('parsely-author'), ...m.all('sailthru.author'), ...m.all('byl'), ...m.all('twitter:data1').filter((v, i) => /author|written/i.test(m.get('twitter:label1') || ''))];
    authorList = metaAuthors.map(a => { const after = String(a).split(/:\s+/).pop(); return /:\s/.test(a) && looksLikePersonName(after) ? after : a; })
      .flatMap(a => splitAuthors(a).map(name => ({ name })));
  }
  if (!authorList.length) {
    // Visible bylines
    const sel = ['[rel="author"]', '[itemprop="author"] [itemprop="name"]', '[itemprop="author"]', '.byline a', '.byline__name', '.byline-name', '.author-name', '.author__name', '.c-byline__author', '.article-author', '.post-author', '.entry-author', 'a[href*="/author/"]', 'a[href*="/authors/"]', 'a[href*="/people/"]', 'a[href*="/profile/"]', '.byline', '[class*="byline"]', '[data-testid*="byline"]', '[class*="author"] a', '[class*="Author"] a'];
    for (const s of sel) {
      const found = $(s).slice(0, 8).map((i, el) => cleanText($(el).text())).get()
        .filter(t => t.length <= 150) // a whole header block, not the byline itself
        .map(t => t.replace(/^[\s\S]*\b[Bb]y\s+(?=\p{Lu})/u, '').split(/:\s+/).pop()) // "…explain. by Clayton M. Christensen, …" 
        .flatMap(t => splitAuthors(t)).filter(looksLikePersonName);
      if (found.length) { authorList = [...new Set(found)].map(name => ({ name })); break; }
    }
  }
  let author = toNames(authorList, siteNames);
  const isSiteName = a => a.literal && siteNames.some(s => s === a.literal.toLowerCase() || s.replace(/^the /, '') === a.literal.toLowerCase().replace(/^the /, ''));
  // An organisation named as author: use its full name ("CDC" on cdc.gov, "AIHW" on aihw.gov.au, "NHS website")
  author = author.map(a => {
    if (!a.literal) return a;
    if (knownOrg && (/^[A-Z]{2,8}$/.test(a.literal) && host.split('.').includes(a.literal.toLowerCase()) || /\swebsite$/i.test(a.literal) || isSiteName(a))) return { literal: knownOrg };
    return { literal: a.literal.replace(/\s+website$/i, '') };
  });
  if (author.length > 30) author = author.slice(0, 30);

  // ----- dates -----
  const dayFirst = /\.(au|uk|nz|ie|za|in|sg|my|hk|eu|de|fr|es|it|nl|be|ch|at|se|no|dk|fi|br|ar|mx)$/.test(host);
  const pd = v => parseDate(v, { dayFirst });
  const published = pd(m.get('citation_publication_date', 'citation_date', 'citation_online_date', 'citation_cover_date', 'dc.date.issued', 'dc.date', 'dcterms.issued', 'dcterms.date', 'prism.publicationdate', 'prism.coverdate', 'bepress_citation_date'))
    || pd(primary?.datePublished) || pd(primary?.uploadDate)
    || pd(m.get('article:published_time', 'og:published_time', 'published_time', 'datepublished', 'uploaddate', 'pubdate', 'publishdate', 'publish-date', 'publication_date', 'date', 'sailthru.date', 'parsely-pub-date', 'article.published', 'og:article:published_time', 'release_date', 'cxenseparse:recs:publishtime'))
    || pd($('time[datetime][itemprop="datePublished"], [itemprop="datePublished"]').first().attr('datetime') || $('[itemprop="datePublished"]').first().attr('content'))
    || pd($('article time[datetime], main time[datetime], header time[datetime]').first().attr('datetime'));
  const created = pd(m.get('dc.date.created', 'dcterms.created', 'datecreated')) || pd(primary?.dateCreated);
  const modified = pd(m.get('article:modified_time', 'og:updated_time', 'last-modified', 'dcterms.modified')) || pd(primary?.dateModified);
  const seen = visibleDates($, dayFirst);
  // APA 7 (9.15): a web page is dated by its last update when it shows one ("Reviewed on: 17-01-2023")
  const isPage = !m.get('citation_journal_title', 'citation_title') && !/NewsArticle|BlogPosting|ScholarlyArticle/.test(primary ? typeOf(primary).join(' ') : '');
  const later = (a, b) => a && (!b || a['date-parts'][0].join('-').localeCompare(b['date-parts'][0].join('-'), undefined, { numeric: true }) > 0);
  const issued = (isPage && seen.updated && later(seen.updated, published) ? seen.updated : null) || published || seen.published || (isPage && seen.updated) || created || modified
    || pd($('time[datetime]').first().attr('datetime'));

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
    else if (/\bMovie\b/.test(ldTypes) && primary?.director) { type = 'motion_picture'; genre = 'Film'; }
    else if (/VideoObject|Movie|TVEpisode/.test(ldTypes) || ogType.startsWith('video')) { type = 'webpage'; genre = 'Video'; }
    else if (/PodcastEpisode/.test(ldTypes)) { type = 'song'; genre = 'Podcast episode'; }
    else if (/(^|\.)(medium\.com|substack\.com|wordpress\.com|blogspot\.com|ghost\.io)$/.test(host)) type = 'post-weblog';
    else if ((/NewsArticle/.test(ldTypes) && !knownOrg) || (hostKey(host, NEWS_HOSTS) && !(host === 'abc.net.au' && !/\/news\//.test(pageUrl)))) type = 'article-newspaper';
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
  // "Software 2.0 - Andrej Karpathy", "Title | by Jane Smith | Medium": the author isn't part of the title
  for (const a of item.title ? item.author : []) {
    const full = a.literal || [a.given, a['non-dropping-particle'], a.family].filter(Boolean).join(' ');
    if (full.length > 3) item.title = item.title.replace(new RegExp(`\\s*[|\\-–—]\\s*(by\\s+)?${full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trim() || item.title;
  }
  // Films (IMDb, Letterboxd…): cited as the film itself (APA 10.12) — director, year, studio
  if (type === 'motion_picture') {
    item.director = toNames(ldPeople(primary.director, byId), []);
    item.author = [];
    const studio = [].concat(primary.productionCompany || primary.creator || []).find(c => c && typeOf(c).some(t => /Organization/.test(t)));
    if (studio) item.publisher = ldText(studio);
    item.title = cleanText(ldText(primary.name) || item.title);
    item.issued = pd(primary.datePublished) || item.issued;
    delete item['container-title']; delete item.URL;
  }
  // Encyclopaedia Britannica: an entry in a reference work, dated by its last update
  if (host === 'britannica.com') {
    item.type = 'entry-encyclopedia';
    delete item.publisher;
    if (item.title) item.title = item.title.split(/\s+\|\s+/)[0];
    const upd = String($('body').text()).match(/Last Updated:?\s*([A-Za-z]{3,9}\.? \d{1,2},? \d{4})/);
    if (upd) item.issued = pd(upd[1]);
  }
  // News and magazine articles without a byline start with the title; other pages are by
  // the organisation that publishes them (APA 7 9.11; MLA then lists it once, as publisher)
  const periodical = ['article-newspaper', 'article-magazine', 'post-weblog', 'article-journal'].includes(type);
  if (periodical) item.author = item.author.filter(a => !isSiteName(a));
  else if (!item.author.length && ['webpage', 'report', 'dataset', 'document'].includes(type) && genre !== 'Video') {
    const agls = aglsValue(m.get('dcterms.publisher', 'dc.publisher'));
    const ldOrg = publisherNode && typeOf(publisherNode).some(t => /Organization|GovernmentOrganization|Corporation|NGO|EducationalOrganization|MedicalOrganization/.test(t)) ? ldText(publisherNode) : null;
    const org = knownOrg || (agls && looksLikeOrg(agls) ? agls : null) || ldOrg || (/\.(gov|edu|int|mil)(\.[a-z]{2})?$|\.(org|ac)\.[a-z]{2}$|\.org$/.test(host) && !weakSiteName ? siteName : null);
    if (org) item.author = [{ literal: org }];
  }
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
function youtubeId(url) {
  try {
    const u = new URL(url);
    return u.hostname.includes('youtu.be') ? u.pathname.slice(1).split('/')[0] : u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/) || [])[1];
  } catch { return null; }
}

// "The power of vulnerability | Brené Brown | TED" on the TED channel -> "The power of vulnerability | Brené Brown"
const dropChannel = (title, channel) => {
  const t = cleanText(title);
  if (!channel) return t;
  const re = new RegExp(`\\s*[|\\-–—:]\\s*${channel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const cut = t.replace(re, '').trim();
  return cut.length >= 3 ? cut : t;
};

// Official sources only: the YouTube Data API when YOUTUBE_API_KEY is set
// (title, channel, exact upload date), otherwise oEmbed (title + channel) plus
// the watch page's own metadata when YouTube serves it to us.
async function youtube(url) {
  const id = youtubeId(url);
  const canonical = id ? `https://www.youtube.com/watch?v=${id}` : cleanUrl(url);
  if (id && process.env.YOUTUBE_API_KEY) {
    try {
      const r = await getJSON(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${process.env.YOUTUBE_API_KEY}`);
      const v = r.items?.[0];
      if (v) return prune({
        type: 'webpage', genre: 'Video', title: dropChannel(v.snippet.title, v.snippet.channelTitle), author: [{ literal: v.snippet.channelTitle }], 'container-title': 'YouTube',
        issued: parseDate(v.snippet.publishedAt), dimensions: isoDuration(v.contentDetails?.duration), URL: canonical, accessed: today(),
      });
    } catch {}
  }
  const [o, pageRes] = await Promise.allSettled([
    getJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`),
    fetchPage(canonical),
  ]);
  if (o.status === 'rejected') throw o.reason;
  const item = { type: 'webpage', genre: 'Video', title: dropChannel(o.value.title, o.value.author_name), author: [{ literal: o.value.author_name }], 'container-title': 'YouTube', URL: canonical, accessed: today() };
  const page = pageRes.status === 'fulfilled' ? pageRes.value : null;
  if (page?.kind === 'html') {
    const $ = cheerio.load(page.html);
    const d = $('meta[itemprop="datePublished"]').attr('content') || $('meta[itemprop="uploadDate"]').attr('content') || (page.html.match(/"publishDate":"([^"]+)"/) || [])[1] || (page.html.match(/"uploadDate":"([^"]+)"/) || [])[1];
    item.issued = d && /T/.test(d) ? parseDate(new Date(d).toISOString()) : parseDate(d);
    const dur = $('meta[itemprop="duration"]').attr('content');
    if (dur) item.dimensions = isoDuration(dur);
  }
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
  const host = `${lang === 'www' || lang === 'm' ? 'en' : lang}.wikipedia.org`;
  return prune({
    type: 'entry-encyclopedia', title: s.title || title.replace(/_/g, ' '), 'container-title': 'Wikipedia',
    issued: parseDate(s.timestamp), URL: s.content_urls?.desktop?.page || cleanUrl(url), accessed: today(), language: s.lang,
    // APA 7 cites the exact version read
    _permalink: s.revision ? `https://${host}/w/index.php?title=${encodeURIComponent((s.titles?.canonical || title).replace(/ /g, '_'))}&oldid=${s.revision}` : undefined,
  });
}

// Stanford Encyclopedia of Philosophy: cite the quarterly archived edition, the
// way the SEP and APA 7 (10.2) both show it
async function stanfordEncyclopedia(url) {
  const entry = (url.match(/\/entries\/([^/?#]+)/) || [])[1];
  if (!entry) return null;
  const page = await fetchPage(`https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=${encodeURIComponent(entry)}`);
  const $ = cheerio.load(page.html);
  const text = $('body').text().replace(/\s+/g, ' '); // not cleanText: it would strip the <URL>
  // Author, "Title", The Stanford Encyclopedia of Philosophy (Fall 2023 Edition), Edward N. Zalta & Uri Nodelman (eds.), URL = <…>
  const m = text.match(/([^"“]+?),\s*["“]([^"”]+)["”],?\s*The Stanford Encyclopedia of Philosophy\s*\(([A-Za-z]+ \d{4}) Edition\),?\s*(.+?)\s*\(eds?\.\),?\s*URL\s*=\s*<?\s*(https?:\/\/\S+?)\s*>/);
  if (!m) return null;
  // "Sinnott-Armstrong, Walter" or "Driver, Julia and Smith, Jane" (after "…in which it appears:")
  const people = m[1].split(/:\s+/).pop().split(/\s+and\s+/).map(a => parseName(a.trim(), { forcePerson: true }));
  const editors = m[4].split(/\s*(?:&|and|,)\s*/).map(e => parseName(e, { forcePerson: true })).filter(Boolean);
  // "First published Mon May 20, 2003; substantive revision Wed Oct 4, 2023"
  const entryPage = await fetchPage(`https://plato.stanford.edu/entries/${encodeURIComponent(entry)}/`).catch(() => null);
  const pub = entryPage ? cleanText(cheerio.load(entryPage.html)('#pubinfo').text()) : '';
  const revised = pub.match(/substantive revision\s+(?:[A-Za-z]{3}\s+)?([A-Za-z]+\s+\d{1,2},\s*\d{4})/i) || pub.match(/First published\s+(?:[A-Za-z]{3}\s+)?([A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
  return prune({
    type: 'entry-encyclopedia', title: m[2].trim(), author: people.filter(Boolean), editor: editors,
    'container-title': 'The Stanford encyclopedia of philosophy', edition: `${m[3]} ed.`, publisher: 'Metaphysics Research Lab, Stanford University',
    issued: parseDate(revised?.[1]) || parseDate(m[3].match(/\d{4}/)[0]), URL: m[5].replace(/[>.,]+$/, ''), accessed: today(),
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
  // Skip IDs ("syc-20371444", "tt6751668", "1f7b2rf2y", "-a64152b37c35", "-20210809-p58h3v")
  const segs = u.pathname.split('/').filter(Boolean).map(x => decodeURIComponent(x).replace(/\.(html?|php|aspx?)$/i, ''));
  const wordy = (x, i) => (x.match(/[a-z]{3,}/gi) || []).length >= (i === 0 ? 1 : 2) && /[a-z]{4,}/i.test(x) && !/^(syc|tt|nm)-?\d+$/i.test(x) && !/^(index|default|home|page|article|title|news|story)$/i.test(x);
  const pick = [...segs].reverse().find(wordy) || segs[segs.length - 1] || '';
  const title = pick.replace(/-(?=[a-z0-9]*\d)[a-z0-9]{6,}$/i, '').replace(/-\d{8}-p[0-9a-z]{5}$/i, '').replace(/[-_+]+/g, ' ').replace(/\b\d{5,}\b/g, '').replace(/\b(19|20)\d\d \d\d \d\d\b/, '').trim();
  const date = u.pathname.match(/\/(20\d\d|19\d\d)\/(\d{1,2})\/(\d{1,2})\//);
  return prune({
    type: hostKey(hostOf(url), NEWS_HOSTS) ? 'article-newspaper' : hostKey(hostOf(url), MAGAZINE_HOSTS) ? 'article-magazine' : 'webpage', title: title ? capitaliseNames(title) : siteNameFor(url),
    'container-title': siteNameFor(url), URL: cleanUrl(url), accessed: today(),
    issued: date ? parseDate(`${date[1]}-${date[2]}-${date[3]}`) : undefined,
  });
}

// When a site turns automated readers away (or the page has gone), read the
// copy the Internet Archive keeps instead — the citation metadata is the same.
async function archivedHtml(url) {
  // Asking for today's date redirects to the closest snapshot; "id_" means the page exactly as archived
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let res = await safeFetch(`https://web.archive.org/web/${stamp}id_/${cleanUrl(url)}`, { headers: PAGE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(9000) });
  // The newest copy may itself be the site's "blocked" page; an older one usually isn't
  if (res.status === 403 || res.status === 429 || res.status === 503) res = await safeFetch(`https://web.archive.org/web/2023id_/${cleanUrl(url)}`, { headers: PAGE_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(6000) });
  if (!res.ok || /pdf/i.test(res.headers.get('content-type') || '')) return null;
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8_000_000) buf = buf.subarray(0, 8_000_000);
  // Snapshots keep the site's original compression
  if (buf[0] === 0x1f && buf[1] === 0x8b) { try { buf = zlib.gunzipSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch { return null; } }
  const html = buf.toString('utf8');
  return /<title>\s*(Just a moment|Attention Required|Access denied)/i.test(html) ? null : html;
}

async function fromArchive(url) {
  const html = await archivedHtml(url);
  if (!html) return null;
  const { item, hints } = extractFromHtml(html, url);
  if (!item.title || /^(just a moment|access denied|attention required|simple page)/i.test(item.title)) return null;
  item.URL = cleanUrl(url);
  return { item, hints };
}

// Extra lookups shouldn't hold the citation hostage: give up after `ms`.
const within = (p, ms = 3500) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms))]);

// Merge scholarly metadata over page metadata, keeping the page URL.
function mergeScholarly(page, scholarly) {
  const merged = { ...page, ...pickDefined(scholarly) };
  // A news or magazine site that registers DOIs (The Conversation) is still news; the DOI's
  // generic "article" type and year-only date shouldn't replace what the page says
  if (['article-newspaper', 'article-magazine', 'post-weblog'].includes(page.type) && ['article', 'webpage', 'document', undefined].includes(scholarly.type)) {
    merged.type = page.type;
    if (page['container-title']) merged['container-title'] = page['container-title'];
    if ((page.issued?.['date-parts']?.[0]?.length || 0) > (scholarly.issued?.['date-parts']?.[0]?.length || 0)) merged.issued = page.issued;
    delete merged.publisher;
  }
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

  // Legislation sites, AustLII, JADE: the page title (when we can read it)
  // plus what the link itself says
  if (isLegalHost(host)) {
    let title = '';
    try { const page = await fetchPage(url); if (page.kind === 'html') title = cheerio.load(page.html)('title').first().text(); } catch {}
    if (!legalFromPage(url, title)?.title) {
      try { const html = await within(archivedHtml(url), 14000); if (html) title = cheerio.load(html)('title').first().text() || title; } catch {}
    }
    const item = legalFromPage(url, title);
    if (item) {
      const missing = !item.title;
      return { item: { ...item, URL: cleanUrl(url) }, source: missing ? 'URL' : 'legal database', warnings: missing ? [`${hostOf(url)} doesn’t let us read the page, so we filled in what the link tells us${item.type === 'legal_case' ? ' (court, year and number)' : ' (jurisdiction and year)'}. Add the ${item.type === 'legal_case' ? 'case name' : 'name of the Act'}.`] : [] };
    }
  }

  // Fast paths for sites with good APIs
  try {
    if (/^(youtube\.com|youtu\.be|music\.youtube\.com)$/.test(host)) return { item: await youtube(url), source: 'YouTube' };
    if (host === 'vimeo.com') return { item: await vimeo(url), source: 'Vimeo' };
    if (/wikipedia\.org$/.test(host) && /\/wiki\//.test(url)) return { item: await wikipedia(url), source: 'Wikipedia' };
    if (host === 'plato.stanford.edu' && /\/entries\//.test(url)) { const r = await within(stanfordEncyclopedia(url), 9000); if (r) return { item: r, source: 'Stanford Encyclopedia of Philosophy' }; }
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
    try {
      const archived = await within(fromArchive(url), 14000);
      if (archived) return { item: archived.item, source: 'Web archive', warnings: [`${hostOf(url)} doesn’t let us read the page directly, so we used the Internet Archive’s copy. Check the date matches the version you read.`] };
    } catch {}
    // Blocked, but the link often contains the title (ResearchGate, Academia…): look it up
    const guess = fromUrlOnly(url);
    try { const found = await within(findByTitle(guess.title), 5000); if (found) return { item: found, source: 'DOI' }; } catch {}
    return { item: guess, source: 'URL', warnings: [`We couldn't open that page (${e.message}), so we guessed from the link. Please check the details.`] };
  }

  let result;
  if (page.kind === 'pdf') result = extractFromPdf(page.buf, page.finalUrl || url);
  else result = extractFromHtml(page.html, page.finalUrl || url);
  let { item, hints } = result;
  if (page.kind === 'html' && !item.title) {
    try { const archived = await within(fromArchive(url), 14000); if (archived) ({ item, hints } = archived); } catch {}
  }
  if (page.status === 404) {
    try {
      const archived = await within(fromArchive(url), 14000);
      if (archived) return { item: archived.item, source: 'Web archive', warnings: ['That page no longer exists, so we used the Internet Archive’s copy. Check this is the page you read.'] };
    } catch {}
    return { item: fromUrlOnly(url), source: 'URL', warnings: ['That page says "not found", so we guessed from the link. Double-check the link and details.'] };
  }

  // Enrich from authoritative sources
  const doi = hints.doi || urlDoi;
  let source = page.kind === 'pdf' ? 'PDF' : 'Webpage';
  if (doi) {
    try { item = mergeScholarly(item, await within(lookupDoi(doi), 5000)); source = 'DOI'; } catch {}
  } else if (hints.arxiv) {
    try { item = mergeScholarly(item, await within(lookupArxiv(hints.arxiv), 5000)); source = 'arXiv'; } catch {}
  } else if (hints.pmid && item.type === 'article-journal' && !item['container-title']) {
    try { item = mergeScholarly(item, await within(lookupPmid(hints.pmid))); source = 'PubMed'; } catch {}
  } else if (item.type === 'book') {
    const isbn = hints.isbn || isbnsIn(result.text || '')[0];
    if (isbn) {
      try {
        const book = await within(lookupIsbn(isbn));
        item = { ...item, ...pickDefined(book), URL: undefined };
        source = 'ISBN';
      } catch {}
    }
  }
  if (source === 'Webpage' && isWeak(item)) {
    const ts = await viaTranslationServer(url);
    if (ts) { item = { ...item, ...pickDefined(ts) }; source = 'Zotero translator'; }
  }
  if (!item.title) {
    item.title = fromUrlOnly(url).title;
    warnings.push(`We couldn’t read this page’s title, so we guessed “${item.title}” from the link. Please type the real title.`);
  }
  return { item: prune(item), source, warnings };
}
