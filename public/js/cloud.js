// Optional Google sign-in + Firestore sync. Everything still works signed out
// (localStorage); signing in merges this device with your account and keeps
// every device in sync live.
//
// Layout: users/{uid} holds meta (folders, recent styles, deletions) and
// users/{uid}/projects/{projectId} holds one project each. Data is stored as a
// JSON string because Firestore can't hold CSL's nested date arrays.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, connectAuthEmulator, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteField, runTransaction, collection, onSnapshot, writeBatch, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAnalytics, isSupported as analyticsSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import { firebaseConfig } from './firebase-config.js';
import * as S from './store.js';
import { state } from './store.js';
import { debounce } from './ui.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Local testing against the Firebase emulators: http://localhost:3000/?emulator=1
const EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulator');
if (EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  window.__cmsSignIn = (sub, name) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email: `${sub}@example.com`, email_verified: true, name })));
} else analyticsSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});

export const cloud = { user: null, status: 'off', error: null, ready: false };
const listeners = new Set();
export const onCloudChange = fn => listeners.add(fn);
const setStatus = (status, error = null) => { cloud.status = status; cloud.error = error; listeners.forEach(fn => fn(cloud)); };

let pushedProjects = new Map(); // id -> JSON last known to be in the cloud
const pushedLinks = new Map(); // connection code -> JSON last sent to the add-ins

// What the Word / Google Docs add-ins see for a connected project
const linkPayload = p => JSON.stringify({ v: 1, name: p.name, style: p.style, styleTitle: p.styleTitle, lang: p.lang || '', items: p.items.map(({ _thumb, ...i }) => i), updatedAt: p.updatedAt });
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
export const formatCode = c => c.replace(/(.{4})(?=.)/g, '$1-');

export async function connectProject(project) {
  if (!cloud.user) throw new Error('Sign in first so your project can be shared with Word / Google Docs securely.');
  if (!project.linkCode) { project.linkCode = newCode(); project.updatedAt = Date.now(); S.emit({ projects: true }); }
  await pushNow();
  return project.linkCode;
}

export async function disconnectProject(project) {
  const code = project.linkCode;
  if (!code) return;
  delete project.linkCode;
  project.updatedAt = Date.now();
  S.emit({ projects: true });
  if (cloud.user) { await deleteDoc(doc(db, 'links', code)).catch(() => {}); pushedLinks.delete(code); }
}
let pushedMeta = '';
let unsubs = [];

const metaJson = () => JSON.stringify({ folders: state.folders, recentStyles: state.recentStyles || [], deleted: state.deleted || {}, shared: state.sharedIds || [] });

export function friendlyError(e) {
  const code = e?.code || '';
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') return 'Google sign-in isn’t enabled yet. In the Firebase console: Authentication → Get started → Sign-in method → Google → Enable.';
  if (code === 'auth/unauthorized-domain') return `This address isn’t allowed to sign in. Firebase console → Authentication → Settings → Authorized domains → add ${location.hostname}.`;
  if (code === 'auth/popup-blocked') return 'Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  if (/has not been used|database .*does not exist|NOT_FOUND/i.test(e?.message || '') || code === 'not-found') return 'Cloud sync isn’t available right now — your projects are still saved on this device.';
  if (code === 'permission-denied' || /PERMISSION_DENIED/i.test(e?.message || '')) return 'Sync was refused — try signing out and back in. Your projects are still saved on this device.';
  if (code === 'unavailable') return 'You’re offline — changes will sync when you reconnect.';
  return e?.message || 'Something went wrong with sync';
}

export async function signIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signOut() {
  await pushNow().catch(() => {});
  await fbSignOut(auth);
}

const push = debounce(() => pushNow().catch(e => setStatus('error', friendlyError(e))), 1200);

async function pushNow() {
  const user = cloud.user;
  if (!user) return;
  const batch = writeBatch(db);
  let n = 0;
  const pending = [];
  for (const p of state.projects) {
    if (p.shared) continue; // group projects live in shared/{id}, synced below
    const json = JSON.stringify(p);
    if (pushedProjects.get(p.id) === json) continue;
    if (json.length > 950_000) { setStatus('error', `“${p.name}” is too big to sync — split it into smaller projects.`); continue; }
    batch.set(doc(db, 'users', user.uid, 'projects', p.id), { data: json, updatedAt: p.updatedAt || Date.now() });
    pending.push([p.id, json]); n++;
  }
  const removed = [...pushedProjects.keys()].filter(id => !state.projects.some(p => p.id === id && !p.shared));
  for (const id of removed) { batch.delete(doc(db, 'users', user.uid, 'projects', id)); n++; }
  const linkPending = [];
  for (const p of state.projects) {
    if (!p.linkCode) continue;
    const json = linkPayload(p);
    if (pushedLinks.get(p.linkCode) === json) continue;
    batch.set(doc(db, 'links', p.linkCode), { owner: user.uid, data: json, updatedAt: Date.now() });
    linkPending.push([p.linkCode, json]); n++;
  }
  const meta = metaJson();
  if (meta !== pushedMeta) { batch.set(doc(db, 'users', user.uid), { data: meta, updatedAt: Date.now() }); n++; }
  await pushShared();
  if (!n) { if (cloud.status !== 'error') setStatus('synced'); return; }
  setStatus('syncing');
  await batch.commit();
  for (const [id, json] of pending) pushedProjects.set(id, json);
  for (const [code, json] of linkPending) pushedLinks.set(code, json);
  for (const id of removed) pushedProjects.delete(id);
  pushedMeta = meta;
  setStatus('synced');
}

// ---------- group projects: shared/{id} ----------
const lastShared = new Map(); // id -> JSON last read from / written to the cloud
const sharedSubs = new Map(); // id -> unsubscribe
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const newSharedId = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), b => ID_CHARS[b % ID_CHARS.length]).join('');
export const joinLink = sid => `${location.origin}/?join=${sid}`;
const myName = () => (cloud.user?.name || cloud.user?.email?.split('@')[0] || 'Someone').slice(0, 60);
const infoFrom = (data, uid) => ({ owner: data.owner, members: data.members, role: data.members?.[uid]?.role || null });

function watchShared(sid) {
  if (sharedSubs.has(sid) || !cloud.user) return;
  const uid = cloud.user.uid;
  sharedSubs.set(sid, onSnapshot(doc(db, 'shared', sid), snap => {
    if (snap.metadata.hasPendingWrites) return;
    if (!snap.exists()) { endShared(sid, true, 'The owner stopped sharing a group project — you’ve kept your own copy.'); return; }
    const d = snap.data();
    if (!d.members?.[uid]) { endShared(sid, true, 'You were removed from a group project — you’ve kept your own copy.'); return; }
    if (d.data === lastShared.get(sid)) {
      // membership may still have changed
      const p = state.projects.find(x => x.shared?.id === sid);
      if (p) { p.shared = { ...p.shared, ...infoFrom(d, uid) }; S.emit({ projects: true, project: p.id === state.activeId }); }
      return;
    }
    lastShared.set(sid, d.data);
    S.applyRemoteShared(sid, JSON.parse(d.data), infoFrom(d, uid));
  }, e => {
    // Lost access (removed, or the project was deleted)
    if (e.code === 'permission-denied') endShared(sid, true, 'You no longer have access to a group project — you’ve kept your own copy.');
  }));
}

function endShared(sid, keepCopy, message) {
  sharedSubs.get(sid)?.();
  sharedSubs.delete(sid);
  lastShared.delete(sid);
  const p = S.removeShared(sid, { keepCopy });
  if (p && message) sharedNotice(message);
}
let noticeFn = null;
export const onSharedNotice = fn => { noticeFn = fn; };
const sharedNotice = msg => noticeFn?.(msg);

// Merge our changes with whatever the group saved meanwhile, in a transaction
let sharedRetry = 0;
async function pushShared() {
  for (const p of state.projects.filter(x => x.shared)) {
    const sid = p.shared.id;
    const mine = JSON.stringify(S.sharedPayload(p));
    const seen = lastShared.get(sid);
    if (mine === seen) continue;
    try {
      const saved = await runTransaction(db, async t => {
        const snap = await t.get(doc(db, 'shared', sid));
        if (!snap.exists()) throw Object.assign(new Error('gone'), { code: 'not-found' });
        const m = S.mergeShared(S.sharedPayload(p), JSON.parse(snap.data().data));
        const json = JSON.stringify(m);
        if (json.length > 950_000) throw new Error(`“${p.name}” is too big to sync — split it into smaller projects.`);
        if (json !== snap.data().data) t.update(doc(db, 'shared', sid), { data: json, updatedAt: Date.now() });
        return { m, json };
      });
      // Merge (never replace): a newer change from the group may have arrived while saving
      const before = JSON.stringify(S.sharedPayload(p));
      Object.assign(p, S.mergeShared(S.sharedPayload(p), saved.m));
      if (lastShared.get(sid) === seen) lastShared.set(sid, saved.json); // no newer snapshot meanwhile
      if (JSON.stringify(S.sharedPayload(p)) !== before) S.emit({ projects: true, project: p.id === state.activeId, format: p.id === state.activeId, remote: true });
      if (JSON.stringify(S.sharedPayload(p)) !== lastShared.get(sid)) push(); // still ahead of the cloud: save again
    } catch (e) {
      if (e.code === 'not-found' || e.code === 'permission-denied') endShared(sid, true, 'You no longer have access to a group project — you’ve kept your own copy.');
      else {
        // Usually someone else saved at the same moment: try again shortly so nothing is lost
        sharedRetry = Math.min((sharedRetry || 1000) * 2, 30000);
        setTimeout(() => push(), sharedRetry);
        if (sharedRetry > 8000) setStatus('error', friendlyError(e));
      }
      continue;
    }
    sharedRetry = 0;
  }
}

export async function shareProject(p) {
  if (!cloud.user) throw new Error('Sign in first to share a project with your group.');
  if (p.shared) return joinLink(p.shared.id);
  const sid = newSharedId();
  const uid = cloud.user.uid;
  const members = { [uid]: { role: 'owner', name: myName() } };
  const json = JSON.stringify(S.sharedPayload(p));
  await setDoc(doc(db, 'shared', sid), { owner: uid, members, data: json, updatedAt: Date.now() });
  lastShared.set(sid, json);
  p.shared = { id: sid, owner: uid, members, role: 'owner' };
  S.rememberShared(sid);
  S.emit({ projects: true, project: p.id === state.activeId });
  watchShared(sid);
  await pushNow(); // removes the personal copy, saves the membership list
  return joinLink(sid);
}

export async function joinShared(sid) {
  if (!cloud.user) throw new Error('Sign in to join the group project.');
  if (!/^[a-z0-9]{20}$/.test(sid)) throw new Error('That join link isn’t complete — ask for it again.');
  const uid = cloud.user.uid;
  const ref = doc(db, 'shared', sid);
  let snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists()) {
    try { await updateDoc(ref, { [`members.${uid}`]: { role: 'editor', name: myName() } }); }
    catch (e) { throw new Error(e.code === 'not-found' ? 'That group project no longer exists.' : 'Couldn’t join — the link may have been turned off. Ask for a new one.'); }
    snap = await getDoc(ref);
  }
  const d = snap.data();
  lastShared.set(sid, d.data);
  S.rememberShared(sid);
  const p = S.applyRemoteShared(sid, JSON.parse(d.data), infoFrom(d, uid));
  watchShared(sid);
  S.setActive(p.id);
  push();
  return p;
}

export async function leaveShared(p) {
  const sid = p.shared?.id;
  if (!sid || !cloud.user) return;
  await updateDoc(doc(db, 'shared', sid), { [`members.${cloud.user.uid}`]: deleteField() });
  endShared(sid, false);
  push();
}

export async function removeMember(p, memberUid) {
  await updateDoc(doc(db, 'shared', p.shared.id), { [`members.${memberUid}`]: deleteField() });
}

// Owner: stop sharing. Everyone keeps their own copy; yours becomes personal again.
export async function stopSharing(p) {
  const sid = p.shared?.id;
  if (!sid) return;
  sharedSubs.get(sid)?.(); sharedSubs.delete(sid);
  await deleteDoc(doc(db, 'shared', sid));
  lastShared.delete(sid);
  const mine = S.removeShared(sid, { keepCopy: true });
  if (mine) { mine.name = mine.name.replace(/ \(copy\)$/, ''); S.emit({ projects: true, project: true }); }
  push();
}

async function startSync(user) {
  setStatus('syncing');
  try {
    const [metaSnap, projSnap] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDocs(collection(db, 'users', user.uid, 'projects')),
    ]);
    const meta = metaSnap.exists() ? JSON.parse(metaSnap.data().data) : null;
    const projects = projSnap.docs.map(d => JSON.parse(d.data().data));
    pushedProjects = new Map(projSnap.docs.map(d => [d.id, d.data().data]));
    pushedMeta = metaSnap.exists() ? metaSnap.data().data : '';
    S.mergeRemote({ meta, projects });
    for (const sid of state.sharedIds || []) watchShared(sid);
    await pushNow();

    // Live updates from your other devices
    unsubs.push(onSnapshot(collection(db, 'users', user.uid, 'projects'), snap => {
      for (const ch of snap.docChanges()) {
        if (ch.doc.metadata.hasPendingWrites) continue; // our own write echoing back
        if (ch.type === 'removed') {
          pushedProjects.delete(ch.doc.id);
          // Sharing a project moves it to shared/{id}; that isn't a deletion
          if (state.projects.some(p => p.id === ch.doc.id && p.shared)) continue;
          S.applyRemoteDelete(ch.doc.id);
          continue;
        }
        const json = ch.doc.data().data;
        if (pushedProjects.get(ch.doc.id) === json) continue;
        pushedProjects.set(ch.doc.id, json);
        S.applyRemoteProject(JSON.parse(json));
      }
    }, e => setStatus('error', friendlyError(e))));
    unsubs.push(onSnapshot(doc(db, 'users', user.uid), snap => {
      if (snap.metadata.hasPendingWrites || !snap.exists()) return;
      const json = snap.data().data;
      if (json === pushedMeta) return;
      pushedMeta = json;
      S.applyRemoteMeta(JSON.parse(json));
      for (const sid of state.sharedIds || []) watchShared(sid);
    }, e => setStatus('error', friendlyError(e))));
  } catch (e) {
    setStatus('error', friendlyError(e));
  }
}

function stopSync() {
  unsubs.forEach(u => u());
  unsubs = [];
  sharedSubs.forEach(u => u());
  sharedSubs.clear();
  lastShared.clear();
  pushedProjects = new Map();
  pushedMeta = '';
}

S.onChange(() => { if (cloud.user) push(); });
window.addEventListener('online', () => { if (cloud.user) push(); });

onAuthStateChanged(auth, user => {
  cloud.ready = true;
  stopSync();
  cloud.user = user ? { uid: user.uid, name: user.displayName, email: user.email, photo: user.photoURL } : null;
  if (user) startSync(user); else setStatus('off');
});
