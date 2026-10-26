// Every source type the editor offers, in the 8 most-used styles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatter } from './helpers.mjs';
import { EXAMPLES, STYLES } from './sources.mjs';

const plain = h => h.replace(/<[^>]+>/g, '').replace(/&#38;/g, '&').replace(/&#60;/g, '<').replace(/&#62;/g, '>');

for (const style of STYLES) {
  test(`${style}: every source type formats cleanly`, async () => {
    const r = await formatter.format({ items: Object.entries(EXAMPLES).map(([id, it]) => ({ ...it, id })), style });
    assert.equal(r.entries.length, Object.keys(EXAMPLES).length, 'every source gets an entry or an in-text-only note');
    for (const e of r.entries) {
      const it = EXAMPLES[e.id];
      assert.ok(plain(e.intext.paren).trim(), `${e.id}: has an in-text citation`);
      if (e.inBibliography === false) continue; // e.g. APA personal communications
      assert.ok(e.text, `${e.id}: has a reference`);
      assert.doesNotMatch(e.text, /undefined|NO_PRINTED|null|\[CSL/, `${e.id}: no junk`);
      assert.doesNotMatch(e.text.replace(/\.\.\./g, ''), /\.\.|,,|\(\)|\[\]/, `${e.id}: no doubled punctuation (${e.text})`);
      if (it.issued && !['letter'].includes(e.id)) assert.doesNotMatch(e.text, /\bn\.d\./, `${e.id}: keeps its date`);
    }
  });
}

test('Australian law is written AGLC-style in non-legal styles', async () => {
  for (const style of ['apa', 'modern-language-association', 'harvard-cite-them-right', 'chicago-author-date']) {
    const r = await formatter.format({ items: ['legislation', 'case'].map(id => ({ ...EXAMPLES[id], id })), style });
    const by = Object.fromEntries(r.entries.map(e => [e.id, e]));
    assert.equal(by.legislation.text, 'Corporations Act 2001 (Cth).', style);
    assert.equal(by.case.text, 'Mabo v Queensland (No 2) (1992) 175 CLR 1.', style);
  }
});

test('APA labels for films, TV, podcasts and songs', async () => {
  const r = await formatter.format({ items: ['film', 'tv', 'podcast', 'song'].map(id => ({ ...EXAMPLES[id], id })), style: 'apa' });
  const t = Object.fromEntries(r.entries.map(e => [e.id, e.text]));
  assert.equal(t.film, 'Bong, J. (Director). (2019). Parasite [Film]. CJ Entertainment.');
  assert.match(t.tv, /The constant \(Season 4, Episode 5\) \[TV series episode\]\. In Lost\. ABC\./);
  assert.match(t.podcast, /The power of habits \(No\. 120\) \[Audio podcast episode\]\. In Hidden Brain\. NPR\./);
  assert.match(t.song, /Bohemian rhapsody \[Song\]\. On A night at the opera\. EMI\./);
});

test('APA personal communications are in-text only', async () => {
  const r = await formatter.format({ items: [{ ...EXAMPLES.letter, id: 'l' }], style: 'apa' });
  assert.equal(r.entries[0].inBibliography, false);
  assert.equal(plain(r.entries[0].intext.paren), '(A. Chen, personal communication, April 3, 2024)');
});

test('AGLC editions, IEEE arXiv numbers, MLA speech dates', async () => {
  const f = async (style, id, extra = {}) => (await formatter.format({ items: [{ ...EXAMPLES[id], ...extra, id }], style })).entries[0].text;
  assert.match(await f('australian-guide-to-legal-citation', 'book'), /\(Farrar, Straus and Giroux, 2nd ed, 2011\)/);
  assert.match(await f('ieee', 'preprint'), /arXiv: 2005\.14165/);
  assert.doesNotMatch(await f('ieee', 'preprint'), /arXiv: arXiv/);
  assert.match(await f('modern-language-association', 'speech'), /13 Feb\. 2008/);
});

test('entries stay matched to their own source when some are in-text only', async () => {
  for (const style of ['apa', 'chicago-notes-bibliography', 'chicago-author-date']) {
    const r = await formatter.format({ items: Object.entries(EXAMPLES).map(([id, it]) => ({ ...it, id })), style });
    for (const e of r.entries) {
      if (e.inBibliography === false || !EXAMPLES[e.id].title) continue;
      const words = EXAMPLES[e.id].title.toLowerCase().split(/\W+/).filter(w => w.length > 3).slice(0, 2);
      for (const w of words) assert.ok(e.text.toLowerCase().includes(w), `${style}: entry "${e.id}" shows its own title (got: ${e.text})`);
    }
  }
});
