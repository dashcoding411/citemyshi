// Merging group members' copies of a shared project
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
globalThis.document = { addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.location = { hostname: 'localhost' };
const { mergeShared } = await import('../public/js/store.js');

const it = (id, title, t) => ({ id, title, _added: 1, _updated: t });

test('both people add sources at the same time: nothing is lost', () => {
  const a = { items: [it('x', 'Shared', 1), it('a1', 'Added by A', 5)] };
  const b = { items: [it('x', 'Shared', 1), it('b1', 'Added by B', 6)] };
  assert.deepEqual(mergeShared(a, b).items.map(i => i.id).sort(), ['a1', 'b1', 'x']);
});

test('the newer edit of the same source wins', () => {
  const a = { items: [it('x', 'Old title', 2)] };
  const b = { items: [it('x', 'New title', 9)] };
  assert.equal(mergeShared(a, b).items[0].title, 'New title');
  assert.equal(mergeShared(b, a).items[0].title, 'New title');
});

test('a deletion removes the source for everyone, unless it was edited afterwards', () => {
  const deleter = { items: [], deletedItems: { x: 10 } };
  assert.deepEqual(mergeShared(deleter, { items: [it('x', 'T', 5)] }).items, []);
  assert.equal(mergeShared(deleter, { items: [it('x', 'Edited later', 12)] }).items.length, 1);
});

test('project settings come from whoever changed them last', () => {
  const a = { name: 'Essay', style: 'apa', metaUpdatedAt: 3, items: [] };
  const b = { name: 'Group essay', style: 'australian-guide-to-legal-citation', metaUpdatedAt: 8, items: [] };
  const m = mergeShared(a, b);
  assert.equal(m.name, 'Group essay');
  assert.equal(m.style, 'australian-guide-to-legal-citation');
});

test('merging is the same whichever copy you start from', () => {
  const a = { items: [it('x', 'A edit', 7), it('y', 'Y', 1)], deletedItems: { z: 4 } };
  const b = { items: [it('x', 'B edit', 3), it('z', 'Z', 2), it('w', 'W', 9)] };
  const ids = m => m.items.map(i => `${i.id}:${i.title}`).sort();
  assert.deepEqual(ids(mergeShared(a, b)), ids(mergeShared(b, a)));
  assert.deepEqual(ids(mergeShared(a, b)), ['w:W', 'x:A edit', 'y:Y']);
});
