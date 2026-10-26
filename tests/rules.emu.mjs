// Security rules, checked by Firebase's own rules engine in the local emulator.
// Run: npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, getDocs } from 'firebase/firestore';

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-citemyshi', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } }); });
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const SID = 'abcdefghijkmnpqrst234'.slice(0, 20);
const CODE = 'K7Q2M9XDPL4W';
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const group = () => seed(db => setDoc(doc(db, 'shared', SID), { owner: 'olivia', members: { olivia: { role: 'owner', name: 'Olivia' }, mia: { role: 'editor', name: 'Mia' } }, data: '{}', updatedAt: 1 }));

test('personal projects are private', async () => {
  await assertSucceeds(setDoc(doc(as('olivia'), 'users/olivia/projects/p1'), { data: '{}', updatedAt: 1 }));
  await assertSucceeds(getDoc(doc(as('olivia'), 'users/olivia/projects/p1')));
  await assertFails(getDoc(doc(as('mallory'), 'users/olivia/projects/p1')));
  await assertFails(setDoc(doc(as('mallory'), 'users/olivia/projects/p2'), { data: '{}' }));
  await assertFails(getDoc(doc(as(null), 'users/olivia')));
});

test('add-in codes: readable by code, never listable, owner-only writes', async () => {
  await assertSucceeds(setDoc(doc(as('olivia'), 'links', CODE), { owner: 'olivia', data: '{}', updatedAt: 1 }));
  await assertSucceeds(getDoc(doc(as(null), 'links', CODE)));
  await assertFails(getDocs(collection(as(null), 'links')));
  await assertFails(getDocs(collection(as('mallory'), 'links')));
  await assertFails(updateDoc(doc(as('mallory'), 'links', CODE), { data: 'hacked' }));
  await assertFails(setDoc(doc(as('mallory'), 'links', 'ABCDEFGHJKLM'), { owner: 'olivia', data: '{}' }));
  await assertSucceeds(updateDoc(doc(as('olivia'), 'links', CODE), { data: '{"v":2}' }));
  await assertSucceeds(deleteDoc(doc(as('olivia'), 'links', CODE)));
});

test('creating a group project', async () => {
  await assertSucceeds(setDoc(doc(as('olivia'), 'shared', SID), { owner: 'olivia', members: { olivia: { role: 'owner', name: 'Olivia' } }, data: '{}', updatedAt: 1 }));
  await env.clearFirestore();
  await assertFails(setDoc(doc(as('olivia'), 'shared', SID), { owner: 'olivia', members: { olivia: { role: 'owner', name: 'O' }, mia: { role: 'editor', name: 'M' } }, data: '{}', updatedAt: 1 }));
  await assertFails(setDoc(doc(as('olivia'), 'shared', SID), { owner: 'mia', members: { olivia: { role: 'owner', name: 'O' } }, data: '{}', updatedAt: 1 }));
});

test('only members can read a group project', async () => {
  await group();
  await assertSucceeds(getDoc(doc(as('mia'), 'shared', SID)));
  await assertFails(getDoc(doc(as('mallory'), 'shared', SID)));
  await assertFails(getDoc(doc(as(null), 'shared', SID)));
  await assertFails(getDocs(collection(as('mia'), 'shared')));
});

test('joining with the link: only yourself, only as an editor', async () => {
  await group();
  await assertFails(updateDoc(doc(as('sam'), 'shared', SID), { 'members.sam': { role: 'owner', name: 'Sam' } }));
  await assertFails(updateDoc(doc(as('sam'), 'shared', SID), { 'members.zoe': { role: 'editor', name: 'Zoe' } }));
  await assertFails(updateDoc(doc(as('sam'), 'shared', SID), { 'members.sam': { role: 'editor', name: 'Sam' }, data: 'mine now' }));
  await assertFails(updateDoc(doc(as('sam'), 'shared', SID), { 'members.mia': deleteField(), 'members.sam': { role: 'editor', name: 'Sam' } }));
  await assertFails(updateDoc(doc(as(null), 'shared', SID), { 'members.anon': { role: 'editor', name: 'x' } }));
  await assertSucceeds(updateDoc(doc(as('sam'), 'shared', SID), { 'members.sam': { role: 'editor', name: 'Sam' } }));
  await assertSucceeds(getDoc(doc(as('sam'), 'shared', SID)));
});

test('members edit the content but not the membership', async () => {
  await group();
  await assertSucceeds(updateDoc(doc(as('mia'), 'shared', SID), { data: '{"items":[]}', updatedAt: 2 }));
  await assertFails(updateDoc(doc(as('mia'), 'shared', SID), { owner: 'mia' }));
  await assertFails(updateDoc(doc(as('mia'), 'shared', SID), { 'members.mia': { role: 'owner', name: 'Mia' } })); // can't promote yourself
  await assertFails(updateDoc(doc(as('mia'), 'shared', SID), { 'members.mia': { role: 'editor', name: 'Someone else' } }));
  await assertFails(updateDoc(doc(as('mia'), 'shared', SID), { 'members.zoe': { role: 'editor', name: 'Zoe' } }));
  await assertFails(updateDoc(doc(as('mia'), 'shared', SID), { 'members.olivia': deleteField() }));
  await assertFails(updateDoc(doc(as('mallory'), 'shared', SID), { data: 'hacked' }));
  await assertFails(deleteDoc(doc(as('mia'), 'shared', SID)));
});

test('leaving, removing people, deleting', async () => {
  await group();
  await assertSucceeds(updateDoc(doc(as('mia'), 'shared', SID), { 'members.mia': deleteField() }));
  await assertFails(getDoc(doc(as('mia'), 'shared', SID)));
  await group();
  await assertFails(updateDoc(doc(as('olivia'), 'shared', SID), { 'members.olivia': deleteField() })); // owner deletes instead
  await assertSucceeds(updateDoc(doc(as('olivia'), 'shared', SID), { 'members.mia': deleteField() }));
  await assertSucceeds(deleteDoc(doc(as('olivia'), 'shared', SID)));
});
