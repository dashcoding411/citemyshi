// Acts and cases, the way law students write them:
//   Corporations Act 2001 (Cth) s 9
//   Mabo v Queensland (No 2) [1992] HCA 23
//   Mabo v Queensland (No 2) (1992) 175 CLR 1
//   Donoghue v Stevenson [1932] AC 562
// plus links to legislation sites, AustLII and JADE.
// CSL shape (as the AGLC/OSCOLA styles expect): legislation = title without the
// year + issued year + jurisdiction in container-title; cases = authority (court
// abbreviation) + number for neutral citations, or volume + report
// (container-title-short) + first page for reported cases.
import { today } from './names.js';

const JURISDICTIONS = { cth: 'Cth', nsw: 'NSW', vic: 'Vic', qld: 'Qld', wa: 'WA', sa: 'SA', tas: 'Tas', act: 'ACT', nt: 'NT', nz: 'NZ', uk: 'UK', ire: 'Ire', ca: 'Canada', us: 'US' };
const JUR_RE = 'Cth|NSW|Vic|Qld|WA|SA|Tas|ACT|NT|NZ|UK|Imp|Ire|Canada|US|Commonwealth';

export const COURTS = {
  HCA: 'High Court of Australia', FCA: 'Federal Court of Australia', FCAFC: 'Federal Court of Australia (Full Court)', FamCA: 'Family Court of Australia',
  FamCAFC: 'Family Court of Australia (Full Court)', FCCA: 'Federal Circuit Court of Australia', FedCFamC1A: 'Federal Circuit and Family Court of Australia',
  FedCFamC1F: 'Federal Circuit and Family Court of Australia', FedCFamC2F: 'Federal Circuit and Family Court of Australia', AATA: 'Administrative Appeals Tribunal',
  NSWSC: 'Supreme Court of New South Wales', NSWCA: 'New South Wales Court of Appeal', NSWCCA: 'New South Wales Court of Criminal Appeal', NSWDC: 'District Court of New South Wales', NSWLEC: 'Land and Environment Court of New South Wales', NSWCATAD: 'NSW Civil and Administrative Tribunal',
  VSC: 'Supreme Court of Victoria', VSCA: 'Victorian Court of Appeal', VCC: 'County Court of Victoria', VCAT: 'Victorian Civil and Administrative Tribunal',
  QSC: 'Supreme Court of Queensland', QCA: 'Queensland Court of Appeal', QDC: 'District Court of Queensland', QCAT: 'Queensland Civil and Administrative Tribunal',
  WASC: 'Supreme Court of Western Australia', WASCA: 'Western Australian Court of Appeal', SASC: 'Supreme Court of South Australia', SASCFC: 'Supreme Court of South Australia (Full Court)', SASCA: 'South Australian Court of Appeal',
  TASSC: 'Supreme Court of Tasmania', TASFC: 'Supreme Court of Tasmania (Full Court)', ACTSC: 'Supreme Court of the ACT', ACTCA: 'ACT Court of Appeal', NTSC: 'Supreme Court of the Northern Territory', NTCA: 'Northern Territory Court of Appeal',
  UKHL: 'House of Lords', UKSC: 'Supreme Court of the United Kingdom', UKPC: 'Privy Council', EWCA: 'Court of Appeal of England and Wales', EWHC: 'High Court of England and Wales',
  NZSC: 'Supreme Court of New Zealand', NZCA: 'Court of Appeal of New Zealand', NZHC: 'High Court of New Zealand', SCC: 'Supreme Court of Canada',
};

export const REPORTS = {
  CLR: 'Commonwealth Law Reports', ALR: 'Australian Law Reports', ALJR: 'Australian Law Journal Reports', FCR: 'Federal Court Reports', FLR: 'Federal Law Reports',
  'Fam LR': 'Family Law Reports', NSWLR: 'New South Wales Law Reports', 'SR (NSW)': 'State Reports (New South Wales)', VR: 'Victorian Reports', 'Qd R': 'Queensland Reports',
  SASR: 'South Australian State Reports', WAR: 'Western Australian Reports', 'Tas R': 'Tasmanian Reports', ACTR: 'Australian Capital Territory Reports', NTR: 'Northern Territory Reports',
  'A Crim R': 'Australian Criminal Reports', IR: 'Industrial Reports', AC: 'Appeal Cases', QB: 'Queen’s Bench', KB: 'King’s Bench', Ch: 'Chancery', WLR: 'Weekly Law Reports',
  'All ER': 'All England Law Reports', NZLR: 'New Zealand Law Reports', SCR: 'Supreme Court Reports', US: 'United States Reports', 'S Ct': 'Supreme Court Reporter', 'F 3d': 'Federal Reporter, Third Series',
};

// "Corporations Act 2001 (Cth) s 9" -> legislation
function parseAct(text) {
  const m = text.match(new RegExp(`^(.+?\\b(?:Act|Regulations?|Rules|Ordinance|Code|Bill|By-laws?|Statute|Charter|Order|Determination|Instrument))\\s+(\\d{4})(?:\\s*\\((${JUR_RE})\\))?(?:\\s*,?\\s*((?:ss?|sch|pt|div|reg|r|art|cl)\\s+[\\w.()–-]+(?:[–-][\\w.()]+)?))?\\.?$`, 'i'));
  if (!m) return null;
  const [, title, year, jur, pinpoint] = m;
  const item = { type: /\bBill$/i.test(title) ? 'bill' : 'legislation', title: title.trim(), issued: { 'date-parts': [[+year]] }, accessed: today() };
  if (jur) item['container-title'] = jur === 'Commonwealth' ? 'Cth' : jur;
  return { item, pinpoint };
}

// "Mabo v Queensland (No 2) [1992] HCA 23", "(1992) 175 CLR 1", "[1932] AC 562"
function parseCase(text) {
  const t = text.trim().replace(/\.$/, '');
  // Medium neutral citation: [Year] COURT Number
  let m = t.match(/^(.+?)\s*\[(\d{4})\]\s+([A-Z][A-Za-z]*(?:\s(?:Civ|Crim|Admin|Ch|QB|KB|Fam|Comm|Pat|TCC))?)\s+(\d+)(?:\s*,\s*\[?([\d–-]+)\]?)?(?:\s*\(.*\))?$/);
  if (m && !REPORTS[m[3]]) {
    const [, name, year, court, number, pin] = m;
    return { item: { type: 'legal_case', title: name.trim(), authority: court, number, issued: { 'date-parts': [[+year]] }, accessed: today() }, pinpoint: pin && `[${pin}]` };
  }
  // Reported: (Year) Volume Report Page   or   [Year] (Volume) Report Page
  m = t.match(/^(.+?)\s*([([])(\d{4})[)\]]\s*(\d+)?\s*([A-Z][A-Za-z ()]*?[A-Za-z)])\s+(\d+)(?:\s*,\s*([\d–-]+))?$/);
  if (m) {
    const [, name, , year, volume, report, page, pin] = m;
    const abbr = report.trim();
    const item = { type: 'legal_case', title: name.trim(), issued: { 'date-parts': [[+year]] }, 'container-title': REPORTS[abbr] || abbr, 'container-title-short': abbr, page, accessed: today() };
    if (volume) item.volume = volume;
    return { item, pinpoint: pin };
  }
  return null;
}

export function parseLegalCitation(text) {
  let s = String(text || '').trim();
  if (s.length < 6 || s.length > 300 || /^https?:/i.test(s)) return null;
  // Case nicknames aren't part of the name: Mabo v Queensland (No 2) ("Mabo case")
  s = s.replace(/\s*\(\s*["“][^"”]*["”]\s*\)/g, '');
  // Reported and neutral citations together: AGLC 4 r 2.3 cites the report,
  // "Mabo v Queensland (No 2) [1992] HCA 23; (1992) 175 CLR 1" -> "(1992) 175 CLR 1"
  const parallel = s.match(/^(.+?)\s+\[(\d{4})\]\s+([A-Z][A-Za-z]*)\s+(\d+)\s*;\s*(\(\d{4}\)\s+\d+\s+\S.*)$/);
  if (parallel) {
    const r = parseCase(`${parallel[1]} ${parallel[5]}`);
    if (r) return { ...r, item: { ...r.item, authority: r.item.authority || parallel[3], number: r.item.number || parallel[4] } };
  }
  return parseAct(s) || (/\bv\b|^Re\s|^In re\s|\[\d{4}\]|\(\d{4}\)/.test(s) ? parseCase(s) : null);
}

const LEG_HOSTS = {
  'legislation.gov.au': 'Cth', 'legislation.nsw.gov.au': 'NSW', 'legislation.vic.gov.au': 'Vic', 'legislation.qld.gov.au': 'Qld',
  'legislation.wa.gov.au': 'WA', 'legislation.sa.gov.au': 'SA', 'legislation.tas.gov.au': 'Tas', 'legislation.act.gov.au': 'ACT',
  'legislation.nt.gov.au': 'NT', 'legislation.govt.nz': 'NZ', 'legislation.gov.uk': 'UK',
};

export const isLegalHost = host => !!(LEG_HOSTS[host] || /(^|\.)austlii\.edu\.au$|(^|\.)jade\.io$|(^|\.)nzlii\.org$|(^|\.)bailii\.org$/.test(host));

// Best effort from the link alone (AustLII and NSW block servers, but their
// links still say what the document is)
export function legalFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, '');
  const path = decodeURIComponent(u.pathname);
  // AustLII cases: /au/cases/cth/HCA/1992/23.html
  let m = path.match(/\/au\/cases\/(\w+)\/([A-Za-z]+)\/(\d{4})\/(\d+)/);
  if (m) return { type: 'legal_case', authority: m[2], issued: { 'date-parts': [[+m[3]]] }, number: m[4], URL: url, accessed: today() };
  // AustLII legislation: /au/legis/cth/consol_act/ca2001172/
  m = path.match(/\/au\/legis\/(\w+)\/(?:consol|num)_(act|reg|bill)\/([a-z]+?)(\d{4})\d*/);
  if (m) return { type: m[2] === 'bill' ? 'bill' : 'legislation', 'container-title': JURISDICTIONS[m[1]] || m[1].toUpperCase(), issued: { 'date-parts': [[+m[4]]] }, URL: url, accessed: today() };
  // NSW: /view/html/inforce/current/act-1900-040
  m = host === 'legislation.nsw.gov.au' && path.match(/\/(act|sl)-(\d{4})-(\d+)/);
  if (m) return { type: 'legislation', 'container-title': 'NSW', issued: { 'date-parts': [[+m[2]]] }, number: String(+m[3]), URL: url, accessed: today() };
  if (LEG_HOSTS[host]) return { type: 'legislation', 'container-title': LEG_HOSTS[host], URL: url, accessed: today() };
  return null;
}

// Combine what the link says with the page title (when the site lets us read it)
export function legalFromPage(url, pageTitle) {
  const base = legalFromUrl(url) || {};
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const title = String(pageTitle || '').split(/\s+[|–—-]\s+(?:Federal Register|legislation\.|BarNet|AustLII|NZLII|BAILII|Legislation)/i)[0].trim();
  const parsed = parseLegalCitation(title.replace(/\s*\(\d{1,2} \w+ \d{4}\)\s*$/, '')); // drop "(3 June 1992)" decision dates
  if (parsed) {
    const item = { ...parsed.item, ...Object.fromEntries(Object.entries(base).filter(([k]) => !(k in parsed.item) || k === 'URL')) };
    if (!item['container-title'] && base['container-title']) item['container-title'] = base['container-title'];
    if (LEG_HOSTS[host] && item.type === 'legislation' && !item['container-title']) item['container-title'] = LEG_HOSTS[host];
    return item;
  }
  return Object.keys(base).length ? base : null;
}
