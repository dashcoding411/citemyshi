// Builds data/words.json from the LibreOffice Hunspell dictionaries (US, UK,
// Australian English). Used to sentence-case titles without lowercasing proper
// nouns: lowercase entries are ordinary words; capitalised ones are names.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lower = new Set();
const proper = new Map(); // lowercase -> canonical form, e.g. covid -> COVID
for (const lang of ['en_US', 'en_GB', 'en_AU']) {
  const res = await fetch(`https://raw.githubusercontent.com/LibreOffice/dictionaries/master/en/${lang}.dic`);
  if (!res.ok) throw new Error(`${lang}: HTTP ${res.status}`);
  const lines = (await res.text()).split('\n').slice(1);
  for (const line of lines) {
    const word = line.split('/')[0].trim();
    if (!word || /[^\p{L}'’-]/u.test(word)) continue;
    if (word === word.toLowerCase()) lower.add(word);
    else proper.set(word.toLowerCase(), word);
  }
}
// The macOS/BSD system word list adds prefixed and older words Hunspell builds
// from affix rules (e.g. "disaster"); proper nouns there are capitalised too.
try {
  for (const word of (await fs.readFile('/usr/share/dict/words', 'utf8')).split('\n')) {
    const w = word.trim();
    if (!w || /[^\p{L}'’-]/u.test(w)) continue;
    if (w === w.toLowerCase()) lower.add(w);
    else if (!proper.has(w.toLowerCase())) proper.set(w.toLowerCase(), w);
  }
} catch { console.warn('  (no /usr/share/dict/words — using Hunspell only)'); }
await fs.writeFile(path.join(root, 'data', 'words.json'), JSON.stringify({ lower: [...lower].sort(), proper: Object.fromEntries([...proper].sort()) }));
console.log(`words: ${lower.size} common, ${proper.size} proper nouns → data/words.json`);
