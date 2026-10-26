import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
globalThis.document = { addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.location = { hostname: 'localhost' };
const { analyzePaper } = await import('../public/js/audit.js');

const items = [
  { id: 'a', title: 'Deep learning', author: [{ family: 'LeCun' }, { family: 'Bengio' }], issued: { 'date-parts': [[2015]] } },
  { id: 'b', title: 'Pride and prejudice', author: [{ family: 'Austen' }], issued: { 'date-parts': [[2003]] } },
  { id: 'c', title: 'Never cited', author: [{ family: 'Nobody' }], issued: { 'date-parts': [[2010]] } },
];
const fmt = paren => ({ entries: items.map(i => ({ id: i.id, intext: { paren } })) });

test('author-date: finds missing and uncited sources', () => {
  const r = analyzePaper('Nets work (LeCun et al., 2015, p. 437). Austen (2003) wrote. Others disagree (Smith, 2019). See Figure 2 (Figure 2).', items, fmt('(X, 2000)'));
  assert.deepEqual(r.missing, ['(Smith, 2019)']);
  assert.deepEqual(r.uncited.map(i => i.id), ['c']);
});
test('MLA author-page citations', () => {
  const r = analyzePaper('Love (Austen 45). Machines (LeCun et al. 437). Ghost (Jones 12).', items, fmt('(X)'));
  assert.deepEqual(r.missing, ['(Jones 12)']);
});
test('numbered citations', () => {
  const r = analyzePaper('Shown in [1], [2] and [1, 5].', items, fmt('[1]'));
  assert.deepEqual(r.missing, ['[5]']);
  assert.deepEqual(r.uncited.map(i => i.id), ['c']);
});
