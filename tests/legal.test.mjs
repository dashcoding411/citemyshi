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
