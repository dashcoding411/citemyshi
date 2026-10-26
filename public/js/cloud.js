// Optional Google sign-in + Firestore sync. Everything still works signed out
// (localStorage); signing in merges this device with your account and keeps
// every device in sync live.
//
// Layout: users/{uid} holds meta (folders, recent styles, deletions) and
// users/{uid}/projects/{projectId} holds one project each. Data is stored as a
// JSON string because Firestore can't hold CSL's nested date arrays.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, onSnapshot, writeBatch, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAnalytics, isSupported as analyticsSupported } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import { firebaseConfig } from './firebase-config.js';
import * as S from './store.js';
import { state } from './store.js';
import { debounce } from './ui.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
analyticsSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});

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

const metaJson = () => JSON.stringify({ folders: state.folders, recentStyles: state.recentStyles || [], deleted: state.deleted || {} });

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
    const json = JSON.stringify(p);
    if (pushedProjects.get(p.id) === json) continue;
    if (json.length > 950_000) { setStatus('error', `“${p.name}” is too big to sync — split it into smaller projects.`); continue; }
    batch.set(doc(db, 'users', user.uid, 'projects', p.id), { data: json, updatedAt: p.updatedAt || Date.now() });
    pending.push([p.id, json]); n++;
  }
  const removed = [...pushedProjects.keys()].filter(id => !state.projects.some(p => p.id === id));
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
  if (!n) { if (cloud.status !== 'error') setStatus('synced'); return; }
  setStatus('syncing');
  await batch.commit();
  for (const [id, json] of pending) pushedProjects.set(id, json);
  for (const [code, json] of linkPending) pushedLinks.set(code, json);
  for (const id of removed) pushedProjects.delete(id);
  pushedMeta = meta;
  setStatus('synced');
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
    await pushNow();

    // Live updates from your other devices
    unsubs.push(onSnapshot(collection(db, 'users', user.uid, 'projects'), snap => {
      for (const ch of snap.docChanges()) {
        if (ch.doc.metadata.hasPendingWrites) continue; // our own write echoing back
        if (ch.type === 'removed') { pushedProjects.delete(ch.doc.id); S.applyRemoteDelete(ch.doc.id); continue; }
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
    }, e => setStatus('error', friendlyError(e))));
  } catch (e) {
    setStatus('error', friendlyError(e));
  }
}

function stopSync() {
  unsubs.forEach(u => u());
  unsubs = [];
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
