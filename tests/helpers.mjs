// Runs the browser's formatter (public/js/csl-core.js) in Node for tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CSL from '../public/vendor/citeproc.js';
import { createFormatter } from '../public/js/csl-core.js';
import { loadStyle } from '../server/styles.js';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const formatter = createFormatter({
  CSL,
  getText: p => fs.readFile(path.join(pub, p), 'utf8'),
  getServerStyle: async name => { const s = await loadStyle(name); return { name: s.name, title: s.title, isNote: s.isNote, defaultLocale: s.defaultLocale, xml: s.xml }; },
});

export const ITEMS = {
  journal: { id: 'j', type: 'article-journal', title: 'Deep learning', author: [{ given: 'Yann', family: 'LeCun' }, { given: 'Yoshua', family: 'Bengio' }, { given: 'Geoffrey', family: 'Hinton' }], 'container-title': 'Nature', volume: '521', issue: '7553', page: '436-444', issued: { 'date-parts': [[2015, 5, 28]] }, DOI: '10.1038/nature14539' },
  book: { id: 'b', type: 'book', title: 'Pride and prejudice', author: [{ given: 'Jane', family: 'Austen' }], publisher: 'Penguin Books', 'publisher-place': 'London', issued: { 'date-parts': [[2003]] } },
  web: { id: 'w', type: 'webpage', title: 'How green tea can help you lose weight', author: [{ given: 'Kris', family: 'Gunnars' }], 'container-title': 'Healthline', issued: { 'date-parts': [[2023, 5, 12]] }, accessed: { 'date-parts': [[2026, 10, 26]] }, URL: 'https://www.healthline.com/nutrition/green-tea-and-weight-loss' },
  two: { id: 't', type: 'article-journal', title: 'How much do disasters cost? A comparison of disaster cost estimates in Australia', author: [{ given: 'Monique', family: 'Ladds' }, { given: 'Adriana', family: 'Keating' }], 'container-title': 'International Journal of Disaster Risk Reduction', volume: '21', page: '419-429', issued: { 'date-parts': [[2017, 3]] }, DOI: '10.1016/j.ijdrr.2017.01.004' },
};

export async function render(style, keys, lang) {
  const r = await formatter.format({ items: keys.map(k => ITEMS[k]), style, lang });
  return Object.fromEntries(r.entries.map(e => [e.id, e]));
}
