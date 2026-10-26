// Acts and cases for law students (AGLC 4 and OSCOLA)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatter } from './helpers.mjs';
import { parseLegalCitation, legalFromPage } from '../server/legal.js';
import { detectInput } from '../server/lookup.js';

const plain = h => h.replace(/<[^>]+>/g, '').replace(/&#38;/g, '&').replace(/&#60;/g, '<').replace(/&#62;/g, '>');
const item = text => ({ id: 'x', ...parseLegalCitation(text).item });
async function bib(text, style = 'australian-guide-to-legal-citation') {
  const r = await formatter.format({ items: [item(text)], style });
  return r.entries[0];
}
async function note(text, locator, style = 'australian-guide-to-legal-citation') {
  return plain((await formatter.intext({ item: item(text), style, locator, label: 'page' })).paren);
}

const AGLC = [
  ['Corporations Act 2001 (Cth)', 'Corporations Act 2001 (Cth)'],
  ['Crimes Act 1900 (NSW)', 'Crimes Act 1900 (NSW)'],
  ['Human Rights Act 1998 (UK)', 'Human Rights Act 1998 (UK)'],
  ['Mabo v Queensland (No 2) [1992] HCA 23', 'Mabo v Queensland (No 2) [1992] HCA 23'],
  ['Mabo v Queensland (No 2) (1992) 175 CLR 1', 'Mabo v Queensland (No 2) (1992) 175 CLR 1'],
  ['Donoghue v Stevenson [1932] AC 562', 'Donoghue v Stevenson [1932] AC 562'],
  ['R v Smith [2020] NSWCCA 5', 'R v Smith [2020] NSWCCA 5'],
];
for (const [input, want] of AGLC) {
  test(`AGLC bibliography: ${input}`, async () => assert.equal((await bib(input)).text, want));
}

test('AGLC italicises case names and Act titles with the year', async () => {
  assert.match((await bib('Mabo v Queensland (No 2) [1992] HCA 23')).html, /<i>Mabo v Queensland \(No 2\)<\/i>/);
  assert.match((await bib('Corporations Act 2001 (Cth)')).html, /<i>Corporations Act<\/i> <i>2001<\/i> \(Cth\)/);
});

test('AGLC footnote pinpoints', async () => {
  assert.equal(await note('Corporations Act 2001 (Cth)', 's 9'), 'Corporations Act 2001 (Cth) s 9.');
  assert.equal(await note('Crimes Act 1900 (NSW)', 'ss 18–20'), 'Crimes Act 1900 (NSW) ss 18–20.');
  assert.equal(await note('Mabo v Queensland (No 2) (1992) 175 CLR 1', '42'), 'Mabo v Queensland (No 2) (1992) 175 CLR 1, 42.');
  assert.equal(await note('Mabo v Queensland (No 2) [1992] HCA 23', '[42]'), 'Mabo v Queensland (No 2) [1992] HCA 23, [42].');
});

test('an Act title that includes its year is not doubled', async () => {
  const r = await formatter.format({ items: [{ id: 'a', type: 'legislation', title: 'Corporations Act 2001', issued: { 'date-parts': [[2001]] }, 'container-title': 'Cth' }], style: 'australian-guide-to-legal-citation' });
  assert.equal(r.entries[0].text, 'Corporations Act 2001 (Cth)');
});

test('OSCOLA cases', async () => {
  assert.equal((await bib('Donoghue v Stevenson [1932] AC 562', 'oscola')).text, 'Donoghue v Stevenson [1932] AC 562');
});

test('legal citations are recognised in the cite box', () => {
  for (const t of ['Corporations Act 2001 (Cth)', 'Corporations Act 2001 (Cth) s 9', 'Fair Work Regulations 2009 (Cth)', 'Mabo v Queensland (No 2) [1992] HCA 23', 'Re Wakim; Ex parte McNally (1999) 198 CLR 511'])
    assert.equal(detectInput(t).kind, 'legal', t);
  for (const t of ['the great gatsby', 'Pride and Prejudice', 'climate change act policy analysis'])
    assert.equal(detectInput(t).kind, 'search', t);
  assert.equal(parseLegalCitation('Corporations Act 2001 (Cth) s 9').pinpoint, 's 9');
  assert.equal(parseLegalCitation('Mabo v Queensland (No 2) (1992) 175 CLR 1').item.volume, '175');
});

test('legal databases: page titles and links', () => {
  assert.deepEqual(
    (({ type, title, 'container-title': j, issued }) => ({ type, title, j, year: issued['date-parts'][0][0] }))(legalFromPage('https://www.legislation.gov.au/C2004A00818/latest/text', 'Corporations Act 2001 - Federal Register of Legislation')),
    { type: 'legislation', title: 'Corporations Act', j: 'Cth', year: 2001 });
  const austlii = legalFromPage('https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/HCA/1992/23.html', '');
  assert.equal(austlii.authority, 'HCA'); assert.equal(austlii.number, '23'); assert.equal(austlii.issued['date-parts'][0][0], 1992);
  assert.equal(legalFromPage('https://legislation.nsw.gov.au/view/html/inforce/current/act-1900-040', '')['container-title'], 'NSW');
});

// Footnotes across a whole document: Ibid, (n X) and short forms
const ITEMS_DOC = () => [
  { id: 'mabo', ...parseLegalCitation('Mabo v Queensland (No 2) (1992) 175 CLR 1').item },
  { id: 'act', ...parseLegalCitation('Corporations Act 2001 (Cth)').item },
  { id: 'book', type: 'book', title: 'Pride and prejudice', author: [{ given: 'Jane', family: 'Austen' }], publisher: 'Penguin Books', issued: { 'date-parts': [[2003]] } },
];
const SEQ = [['mabo', '20'], ['mabo', '42'], ['act', 's 9'], ['book', '12'], ['mabo', '50'], ['act', 's 9'], ['act', 's 180']]
  .map(([id, locator], i) => ({ id: `c${i}`, items: [{ id, locator, label: 'page' }] }));

test('AGLC footnotes: Ibid and (n X)', async () => {
  const r = await formatter.document({ items: ITEMS_DOC(), style: 'australian-guide-to-legal-citation', citations: SEQ });
  assert.deepEqual(r.citations.map(c => c.text), [
    'Mabo v Queensland (No 2) (1992) 175 CLR 1, 20.',
    'Ibid 42.',
    'Corporations Act 2001 (Cth) s 9.',
    'Jane Austen, Pride and Prejudice (Penguin Books, 2003) 12.',
    'Mabo v Queensland (No 2) (n 1) 50.',
    'Corporations Act (n 3) s 9.',
    'Ibid s 180.',
  ]);
  assert.deepEqual(r.citations.map(c => c.note), [1, 2, 3, 4, 5, 6, 7]);
});

test('Chicago footnotes use short forms for repeats', async () => {
  const r = await formatter.document({ items: ITEMS_DOC(), style: 'chicago-notes-bibliography', citations: SEQ });
  const t = r.citations.map(c => c.text);
  assert.equal(t[0], 'Mabo v Queensland (No 2) (1992) 175 CLR 1, 20.');
  assert.equal(t[4], 'Mabo v Queensland (No 2), 50.');
  assert.equal(t[5], 'Corporations Act, s 9.');
});

test('IEEE numbers references by first citation', async () => {
  const items = [{ ...ITEMS_DOC()[2] }, { id: 'j', type: 'article-journal', title: 'Deep learning', author: [{ given: 'Yann', family: 'LeCun' }], 'container-title': 'Nature', issued: { 'date-parts': [[2015]] } }];
  const r = await formatter.document({ items, style: 'ieee', citations: [{ id: 'a', items: [{ id: 'j' }] }, { id: 'b', items: [{ id: 'book', locator: '12', label: 'page' }] }, { id: 'c', items: [{ id: 'j' }] }] });
  assert.deepEqual(r.citations.map(c => c.text), ['[1]', '[2, p. 12]', '[1]']);
  assert.match(r.entries[0].text, /^\[1\] Y\. LeCun/);
});
