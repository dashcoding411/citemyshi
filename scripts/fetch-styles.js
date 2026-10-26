// Downloads the CSL style catalog (data/, used by the server's search), plus the
// most-used styles for every degree and every citation language into public/
// so the website can format citations without the server. Run: npm run setup
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED } from '../public/js/degrees.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const stylesDir = path.join(root, 'public', 'styles');
const localesDir = path.join(root, 'public', 'locales');

const POPULAR = [
  'apa', 'modern-language-association', 'chicago-author-date', 'chicago-notes-bibliography',
  'chicago-shortened-notes-bibliography', 'harvard-cite-them-right', 'ieee', 'american-medical-association',
  'american-sociological-association', 'nlm-citation-sequence', 'american-chemical-society',
  'american-political-science-association', 'apa-6th-edition', 'nature', 'elsevier-harvard', 'oscola',
  'bluebook-law-review', 'american-anthropological-association', 'springer-basic-author-date',
  'apa-annotated-bibliography', 'modern-language-association-annotated-bibliography',
  'australian-guide-to-legal-citation', 'turabian-author-date', 'turabian-notes-bibliography',
];

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'citemyshi-setup' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()); }));
}

async function main() {
  await fs.mkdir(stylesDir, { recursive: true });
  await fs.mkdir(localesDir, { recursive: true });

  console.log('Fetching style catalog…');
  const all = JSON.parse(await get('https://www.zotero.org/styles-files/styles.json'));
  const index = all.map(s => ({
    n: s.name, t: s.title, s: s.titleShort || undefined, d: s.dependent ? 1 : 0,
    f: s.categories?.format, c: s.categories?.fields?.length ? s.categories.fields : undefined,
  }));
  await fs.writeFile(path.join(dataDir, 'styles-index.json'), JSON.stringify(index));
  console.log(`  ${index.length} styles indexed`);

  const wanted = [...new Set([...POPULAR, ...CURATED])];
  let ok = 0;
  await pool(wanted, 6, async name => {
    try { await fs.writeFile(path.join(stylesDir, `${name}.csl`), await get(`https://www.zotero.org/styles/${name}`)); ok++; }
    catch (e) { console.warn(`  ✗ ${name}: ${e.message}`); }
  });
  console.log(`  ${ok}/${wanted.length} popular and degree styles downloaded`);

  // Journal styles that just point at a parent style need the parent too
  for (const name of wanted) {
    const xml = await fs.readFile(path.join(stylesDir, `${name}.csl`), 'utf8').catch(() => '');
    const parent = (xml.match(/<link[^>]*href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"[^>]*rel="independent-parent"/) || [])[1];
    if (parent && !wanted.includes(parent)) {
      try { await fs.writeFile(path.join(stylesDir, `${parent}.csl`), await get(`https://www.zotero.org/styles/${parent}`)); console.log(`  + parent ${parent} (for ${name})`); }
      catch (e) { console.warn(`  ✗ parent ${parent}: ${e.message}`); }
    }
  }

  // Every CSL locale, so styles print "and", "edited by", months… in the right language
  const meta = JSON.parse(await get('https://raw.githubusercontent.com/citation-style-language/locales/master/locales.json'));
  await fs.writeFile(path.join(localesDir, 'locales.json'), JSON.stringify(meta));
  const codes = Object.keys(meta['language-names']);
  let lok = 0;
  await pool(codes, 6, async code => {
    try { await fs.writeFile(path.join(localesDir, `locales-${code}.xml`), await get(`https://raw.githubusercontent.com/citation-style-language/locales/master/locales-${code}.xml`)); lok++; }
    catch (e) { console.warn(`  ✗ locale ${code}: ${e.message}`); }
  });
  console.log(`  ${lok}/${codes.length} languages downloaded`);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
