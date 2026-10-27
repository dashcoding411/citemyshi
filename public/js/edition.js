// Shared by the server (when a book is looked up) and the formatter (for
// editions typed by hand): store just the number, or the words plus "ed.".
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };
// "Eleventh edition" -> "11", "3rd ed." -> "3", "Revised edition" -> "Rev. ed.", "1st" -> none
export function tidyEdition(ed) {
  if (ed == null || ed === '') return undefined;
  const s = String(ed).trim();
  const lower = s.toLowerCase();
  if (/anniversary/.test(lower)) return `${s.replace(/\s*edition\.?$/i, '').replace(/\s*ed\.?$/i, '').replace(/^(\d+\w*)\s+Anniversary/i, '$1 anniversary')} ed.`;
  // Only numbers that are clearly an edition: "5", "3rd", "3rd ed.", "Edition 3", "4. Aufl."
  // (not "Tanner introduction (3)" or "Reprint 2005")
  let n = (lower.match(/^(\d{1,2})$/) || lower.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/) || lower.match(/\b(\d{1,2})\.?\s*(?:ed\b|edn\b|edition|aufl)/) || lower.match(/\bed(?:ition|n)?\.?\s*(\d{1,2})\b/) || [])[1];
  if (!n) { const w = Object.keys(ORDINALS).find(k => new RegExp(`^${k}(\\s+(edition|ed\\.?|edn))?\\b`).test(lower) || new RegExp(`\\b${k}\\s+(edition|ed\\b|edn)`).test(lower)); if (w) n = String(ORDINALS[w]); }
  if (n) return +n > 1 ? String(+n) : undefined;
  if (/^rev(ised)?\b/.test(lower)) return 'Rev. ed.';
  // "Global edition", "Australian edition": keep the words, the style adds "ed."
  if (/\b(edition|ed\.?)$/i.test(s) && s.split(/\s+/).length <= 5) { const w = s.replace(/\s*(edition|ed\.?)$/i, '').trim(); return w ? `${w[0].toUpperCase()}${w.slice(1)} ed.` : undefined; }
  return undefined;
}
