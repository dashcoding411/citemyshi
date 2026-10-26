import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseName, splitAuthors, parseDate } from '../server/names.js';
import { detectInput, validIsbn } from '../server/lookup.js';
import { assertPublicUrl } from '../server/net.js';

const names = s => splitAuthors(s).map(n => parseName(n));
test('author lists', () => {
  assert.deepEqual(names('By John Smith and Jane Doe'), [{ given: 'John', family: 'Smith' }, { given: 'Jane', family: 'Doe' }]);
  assert.deepEqual(names('Yann LeCun, Yoshua Bengio & Geoffrey Hinton').map(n => n.family), ['LeCun', 'Bengio', 'Hinton']);
  assert.deepEqual(names('Smith, John A.'), [{ family: 'Smith', given: 'John A.' }]);
  assert.deepEqual(names('Kris Gunnars, BSc'), [{ given: 'Kris', family: 'Gunnars' }]);
  assert.deepEqual(names('Jillian Kubala, MS, RD'), [{ given: 'Jillian', family: 'Kubala' }]);
});
test('particles, suffixes and organisations', () => {
  assert.deepEqual(parseName('Ludwig van Beethoven'), { given: 'Ludwig', family: 'Beethoven', 'non-dropping-particle': 'van' });
  assert.deepEqual(parseName('Martin Luther King Jr.'), { given: 'Martin Luther', family: 'King', suffix: 'Jr.' });
  assert.deepEqual(parseName('World Health Organization'), { literal: 'World Health Organization' });
  assert.deepEqual(parseName('BBC News'), { literal: 'BBC News' });
});
test('dates', () => {
  assert.deepEqual(parseDate('2020-01-02T10:00:00Z'), { 'date-parts': [[2020, 1, 2]] });
  assert.deepEqual(parseDate('January 2, 2020'), { 'date-parts': [[2020, 1, 2]] });
  assert.deepEqual(parseDate('2nd Jan 2020'), { 'date-parts': [[2020, 1, 2]] });
  assert.deepEqual(parseDate('Mar 2019'), { 'date-parts': [[2019, 3]] });
  assert.deepEqual(parseDate('12/25/2019'), { 'date-parts': [[2019, 12, 25]] });
  assert.equal(parseDate('not a date'), null);
});
test('detects what was pasted', () => {
  assert.deepEqual(detectInput('10.1038/nature14539'), { kind: 'doi', value: '10.1038/nature14539' });
  assert.deepEqual(detectInput('https://doi.org/10.1038/nature14539'), { kind: 'doi', value: '10.1038/nature14539' });
  assert.deepEqual(detectInput('978-0-14-143951-8'), { kind: 'isbn', value: '9780141439518' });
  assert.deepEqual(detectInput('PMID: 31535858'), { kind: 'pmid', value: '31535858' });
  assert.deepEqual(detectInput('arXiv:1706.03762'), { kind: 'arxiv', value: '1706.03762' });
  assert.equal(detectInput('www.bbc.com/news').kind, 'url');
  assert.equal(detectInput('the great gatsby').kind, 'search');
  assert.ok(validIsbn('0141439513') && !validIsbn('0141439514'));
});
test('refuses to fetch private or local addresses', () => {
  for (const u of ['http://127.0.0.1/', 'http://localhost:3000/', 'http://169.254.169.254/', 'http://10.0.0.1/', 'file:///etc/passwd', 'http://[::1]/']) {
    assert.throws(() => assertPublicUrl(u), undefined, u);
  }
  assert.doesNotThrow(() => assertPublicUrl('https://www.bbc.com/news'));
});
