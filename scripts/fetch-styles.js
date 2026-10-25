// Downloads the CSL style catalog + popular styles + locales into data/.
// Run with: npm run setup
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const stylesDir = path.join(dataDir, 'styles');
const localesDir = path.join(dataDir, 'locales');

export const POPULAR = [
  'apa', 'modern-language-association', 'chicago-author-date', 'chicago-notes-bibliography',
  'chicago-shortened-notes-bibliography', 'harvard-cite-them-right', 'ieee', 'american-medical-association',
  'american-sociological-association', 'nlm-citation-sequence', 'american-chemical-society',
  'american-political-science-association', 'apa-6th-edition', 'nature', 'elsevier-harvard', 'oscola',
  'bluebook-law-review', 'american-anthropological-association', 'springer-basic-author-date',
  'apa-annotated-bibliography', 'modern-language-association-annotated-bibliography',
];
const LOCALES = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES', 'it-IT', 'pt-BR', 'nl-NL'];

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'citemyshi-setup' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function main() {
  await fs.mkdir(stylesDir, { recursive: true });
  await fs.mkdir(localesDir, { recursive: true });

  console.log('Fetching style catalog…');
  const all = JSON.parse(await get('https://www.zotero.org/styles-files/styles.json'));
  const index = all.map(s => ({
    n: s.name, t: s.title, s: s.titleShort || undefined, d: s.dependent ? 1 : 0,
    f: s.categories?.format,
  }));
  await fs.writeFile(path.join(dataDir, 'styles-index.json'), JSON.stringify(index));
  console.log(`  ${index.length} styles indexed`);

  for (const name of POPULAR) {
    try {
      const xml = await get(`https://www.zotero.org/styles/${name}`);
      await fs.writeFile(path.join(stylesDir, `${name}.csl`), xml);
      console.log(`  ✓ ${name}`);
    } catch (e) { console.warn(`  ✗ ${name}: ${e.message}`); }
  }

  for (const loc of LOCALES) {
    try {
      const xml = await get(`https://raw.githubusercontent.com/citation-style-language/locales/master/locales-${loc}.xml`);
      await fs.writeFile(path.join(localesDir, `locales-${loc}.xml`), xml);
      console.log(`  ✓ locale ${loc}`);
    } catch (e) { console.warn(`  ✗ locale ${loc}: ${e.message}`); }
  }
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
