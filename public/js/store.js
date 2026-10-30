// All data lives in localStorage — no account needed.
import { uid } from './ui.js';

const KEY = 'citemyshi:v1';
const listeners = new Set();

function blankProject(name = 'My bibliography', extra = {}) {
  const now = Date.now();
  return { id: uid(), name, folderId: null, style: 'apa', styleTitle: 'APA 7th edition', lang: '', items: [], notes: '', createdAt: now, updatedAt: now, sort: 'style', group: 'none', ...extra };
}

function defaults() {
  const p = blankProject('My first bibliography');
  return { version: 1, folders: [], projects: [p], activeId: p.id, theme: 'system', recentStyles: ['apa', 'modern-language-association', 'chicago-author-date', 'harvard-cite-them-right'], deleted: {} };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.projects?.length) {
      s.folders ||= [];
      s.recentStyles ||= [];
      s.deleted ||= {};
      // '' = use each style's own language (AGLC/OSCOLA are British English)
      if (!s.langMigrated) { s.projects.forEach(p => { if (p.lang === 'en-US') p.lang = ''; }); s.langMigrated = true; }
      if (!s.projects.find(p => p.id === s.activeId)) s.activeId = s.projects[0].id;
      return s;
    }
  } catch {}
  return defaults();
}

export const state = load();

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.error('Could not save', e); }
  }, 150);
}
window.addEventListener('beforeunload', () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} });

export function onChange(fn) { listeners.add(fn); }
export function emit(what = {}) { save(); listeners.forEach(fn => fn(what)); }

// ---------- projects ----------
export const active = () => state.projects.find(p => p.id === state.activeId) || state.projects[0];
export const project = id => state.projects.find(p => p.id === id);

export function createProject(name, folderId = null, inherit = active()) {
  const p = blankProject(name, { folderId, style: inherit?.style || 'apa', styleTitle: inherit?.styleTitle || 'APA 7th edition', lang: inherit?.lang || '' });
  state.projects.push(p);
  state.activeId = p.id;
  emit({ projects: true, project: true });
  return p;
}

// Fields that belong to a project's content (shared with a group) vs. this
// person's view of it (folder, sorting) — see shared projects in cloud.js
const META_KEYS = ['name', 'style', 'styleTitle', 'lang', 'notes', 'document'];
export const SHARED_KEYS = [...META_KEYS, 'items', 'deletedItems', 'metaUpdatedAt', 'updatedAt'];
export const touchMeta = p => { p.metaUpdatedAt = Date.now(); p.updatedAt = p.metaUpdatedAt; };

export function updateProject(id, patch) {
  const p = project(id);
  if (!p) return;
  Object.assign(p, patch, { updatedAt: Date.now() });
  if (META_KEYS.some(k => k in patch)) p.metaUpdatedAt = p.updatedAt;
  emit({ projects: true, project: id === state.activeId, format: 'style' in patch || 'lang' in patch });
}

export function deleteProject(id) {
  const idx = state.projects.findIndex(p => p.id === id);
  if (idx < 0) return null;
  const [removed] = state.projects.splice(idx, 1);
  tombstone(id);
  if (!state.projects.length) state.projects.push(blankProject('My bibliography'));
  if (state.activeId === id) state.activeId = (state.projects[Math.max(0, idx - 1)] || state.projects[0]).id;
  emit({ projects: true, project: true, format: true });
  return { removed, idx };
}

export function restoreProject({ removed, idx }) {
  state.projects.splice(idx, 0, removed);
  delete state.deleted[removed.id];
  removed.updatedAt = Date.now();
  state.activeId = removed.id;
  emit({ projects: true, project: true, format: true });
}

export function duplicateProject(id) {
  const p = project(id);
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = uid(); copy.name = `${p.name} (copy)`; copy.createdAt = copy.updatedAt = Date.now();
  copy.items.forEach(i => { i.id = uid(); });
  state.projects.splice(state.projects.indexOf(p) + 1, 0, copy);
  state.activeId = copy.id;
  emit({ projects: true, project: true, format: true });
}

export function setActive(id) {
  if (state.activeId === id) return;
  state.activeId = id;
  emit({ projects: true, project: true, format: true, switched: true });
}

// ---------- folders ----------
export function createFolder(name) {
  const f = { id: uid(), name, collapsed: false, color: null };
  state.folders.push(f);
  emit({ projects: true });
  return f;
}
export function updateFolder(id, patch) { Object.assign(state.folders.find(f => f.id === id), patch); emit({ projects: true }); }
export function deleteFolder(id, { withProjects = false } = {}) {
  const f = state.folders.find(x => x.id === id);
  state.folders = state.folders.filter(x => x.id !== id);
  tombstone(id);
  const inside = state.projects.filter(p => p.folderId === id);
  if (withProjects) { for (const p of inside) { state.projects.splice(state.projects.indexOf(p), 1); tombstone(p.id); } if (!state.projects.length) state.projects.push(blankProject()); if (!project(state.activeId)) state.activeId = state.projects[0].id; }
  else inside.forEach(p => { p.folderId = null; p.updatedAt = Date.now(); });
  emit({ projects: true, project: true, format: true });
  return { folder: f, inside };
}
export function moveProject(projectId, folderId) {
  const p = project(projectId);
  if (!p || p.folderId === folderId) return;
  p.folderId = folderId;
  p.updatedAt = Date.now();
  if (folderId) { const f = state.folders.find(x => x.id === folderId); if (f) f.collapsed = false; }
  emit({ projects: true, project: true });
}

// ---------- citations ----------
export function addItems(items, projectId = state.activeId) {
  const p = project(projectId);
  const now = Date.now();
  const added = items.map((it, i) => ({ ...it, id: uid(), _added: now + i, _updated: now + i }));
  p.items.push(...added);
  p.updatedAt = now;
  emit({ projects: true, project: projectId === state.activeId, format: projectId === state.activeId });
  return added;
}

export function updateItem(itemId, patch, projectId = state.activeId) {
  const p = project(projectId);
  const it = p.items.find(i => i.id === itemId);
  if (!it) return;
  Object.assign(it, patch, { _updated: Date.now() });
  p.updatedAt = Date.now();
  emit({ project: true, format: true, projects: true });
}

export function replaceItem(itemId, item, projectId = state.activeId) {
  const p = project(projectId);
  const idx = p.items.findIndex(i => i.id === itemId);
  if (idx < 0) return;
  p.items[idx] = { ...item, id: itemId, _added: p.items[idx]._added, _updated: Date.now() };
  p.updatedAt = Date.now();
  emit({ project: true, format: true, projects: true });
}

export function removeItems(ids, projectId = state.activeId) {
  const p = project(projectId);
  const removed = [];
  p.items = p.items.filter((it, idx) => { if (ids.includes(it.id)) { removed.push({ it, idx }); return false; } return true; });
  p.updatedAt = Date.now();
  p.deletedItems = { ...(p.deletedItems || {}) };
  for (const id of ids) p.deletedItems[id] = p.updatedAt; // so group members' copies drop it too
  emit({ project: true, format: true, projects: true });
  return () => { // undo
    for (const { it, idx } of removed) { delete p.deletedItems[it.id]; it._updated = Date.now(); p.items.splice(Math.min(idx, p.items.length), 0, it); }
    emit({ project: true, format: true, projects: true });
  };
}

export function transferItems(ids, toProjectId, { copy = false } = {}) {
  const from = active();
  const to = project(toProjectId);
  if (!to || to.id === from.id) return 0;
  const moving = from.items.filter(i => ids.includes(i.id));
  to.items.push(...moving.map((i, n) => ({ ...JSON.parse(JSON.stringify(i)), id: copy ? uid() : i.id, _added: Date.now() + n, _updated: Date.now() + n })));
  if (!copy) {
    from.items = from.items.filter(i => !ids.includes(i.id));
    from.deletedItems = { ...(from.deletedItems || {}) };
    for (const id of ids) from.deletedItems[id] = Date.now();
  }
  to.updatedAt = from.updatedAt = Date.now();
  emit({ project: true, format: true, projects: true });
  return moving.length;
}

export function allTags(p = active()) {
  const counts = new Map();
  for (const it of p.items) for (const t of it._tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function findDuplicate(item, p = active()) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return p.items.find(i =>
    (item.DOI && i.DOI && item.DOI.toLowerCase() === i.DOI.toLowerCase()) ||
    (item.ISBN && i.ISBN && norm(item.ISBN) === norm(i.ISBN)) ||
    (item.URL && i.URL && norm(item.URL.replace(/^https?:\/\/(www\.)?/, '')) === norm(i.URL.replace(/^https?:\/\/(www\.)?/, ''))) ||
    (item.title && norm(item.title) === norm(i.title) && item.type === i.type && JSON.stringify(item.author?.[0] || '') === JSON.stringify(i.author?.[0] || '')));
}

// ---------- cloud sync ----------
function tombstone(id) {
  state.deleted ||= {};
  state.deleted[id] = Date.now();
  const cutoff = Date.now() - 90 * 864e5;
  for (const [k, t] of Object.entries(state.deleted)) if (t < cutoff) delete state.deleted[k];
}

const isPristine = p => !p.items.length && !p.notes && p.name === 'My first bibliography';

// First sync on this device: union local + cloud, newest copy of each project wins.
export function mergeRemote({ meta, projects }) {
  const deleted = { ...(state.deleted || {}), ...(meta?.deleted || {}) };
  const byId = new Map(state.projects.filter(p => !(projects.length && isPristine(p))).map(p => [p.id, p]));
  for (const rp of projects) {
    const lp = byId.get(rp.id);
    if (!lp || (rp.updatedAt || 0) >= (lp.updatedAt || 0)) byId.set(rp.id, rp);
  }
  state.projects = [...byId.values()].filter(p => !deleted[p.id]);
  if (!state.projects.length) state.projects.push(blankProject('My first bibliography'));
  const folders = new Map(state.folders.map(f => [f.id, f]));
  for (const f of meta?.folders || []) folders.set(f.id, f);
  state.folders = [...folders.values()].filter(f => !deleted[f.id]);
  state.recentStyles = [...new Set([...(state.recentStyles || []), ...(meta?.recentStyles || [])])].slice(0, 8);
  state.deleted = deleted;
  state.sharedIds = [...new Set([...(state.sharedIds || []), ...(meta?.shared || [])])].filter(sid => !deleted[`sh:${sid}`]);
  if (!project(state.activeId)) state.activeId = state.projects[0].id;
  emit({ projects: true, project: true, format: true });
}

export function applyRemoteProject(rp) {
  if (state.deleted?.[rp.id]) return;
  const idx = state.projects.findIndex(p => p.id === rp.id);
  if (idx >= 0 && (state.projects[idx].updatedAt || 0) > (rp.updatedAt || 0)) return;
  if (idx >= 0) state.projects[idx] = rp; else state.projects.push(rp);
  const isActive = rp.id === state.activeId;
  emit({ projects: true, project: isActive, format: isActive, remote: true });
}

export function applyRemoteDelete(id) {
  const idx = state.projects.findIndex(p => p.id === id);
  if (idx < 0) return;
  state.projects.splice(idx, 1);
  tombstone(id);
  if (!state.projects.length) state.projects.push(blankProject('My first bibliography'));
  const wasActive = state.activeId === id;
  if (wasActive) state.activeId = state.projects[0].id;
  emit({ projects: true, project: wasActive, format: wasActive, remote: true });
}

export function applyRemoteMeta(meta) {
  state.deleted = { ...(state.deleted || {}), ...(meta.deleted || {}) };
  state.sharedIds = [...new Set([...(state.sharedIds || []), ...(meta.shared || [])])].filter(sid => !state.deleted[`sh:${sid}`]);
  state.folders = (meta.folders || []).filter(f => !state.deleted[f.id]);
  for (const p of state.projects) if (p.folderId && !state.folders.some(f => f.id === p.folderId)) p.folderId = null;
  state.recentStyles = meta.recentStyles || state.recentStyles;
  const before = state.projects.length;
  state.projects = state.projects.filter(p => !state.deleted[p.id]);
  if (!state.projects.length) state.projects.push(blankProject('My first bibliography'));
  if (!project(state.activeId)) state.activeId = state.projects[0].id;
  emit({ projects: true, project: before !== state.projects.length, format: before !== state.projects.length, remote: true });
}

// ---------- shared (group) projects ----------
const stamp = it => it._updated || it._added || 0;

// Combine two copies of a shared project: newest version of each source wins,
// deletions win over older edits, settings come from whoever changed them last.
export function mergeShared(local, remote) {
  const deleted = { ...(remote.deletedItems || {}) };
  for (const [id, t] of Object.entries(local.deletedItems || {})) deleted[id] = Math.max(deleted[id] || 0, t);
  const byId = new Map();
  for (const it of [...(local.items || []), ...(remote.items || [])]) {
    const cur = byId.get(it.id);
    if (!cur || stamp(it) > stamp(cur)) byId.set(it.id, it);
  }
  const order = [...(local.items || []).map(i => i.id), ...(remote.items || []).map(i => i.id)];
  const items = [...new Set(order)].map(id => byId.get(id)).filter(it => !(deleted[it.id] >= stamp(it)));
  const metaFrom = (remote.metaUpdatedAt || 0) > (local.metaUpdatedAt || 0) ? remote : local;
  const out = { items, deletedItems: deleted, metaUpdatedAt: Math.max(local.metaUpdatedAt || 0, remote.metaUpdatedAt || 0), updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0) };
  for (const k of META_KEYS) if (metaFrom[k] !== undefined) out[k] = metaFrom[k];
  return out;
}

export const sharedPayload = p => Object.fromEntries(SHARED_KEYS.filter(k => p[k] !== undefined).map(k => [k, p[k]]));

// A shared project arrived or changed in the cloud
export function applyRemoteShared(sid, remote, info) {
  let p = state.projects.find(x => x.shared?.id === sid);
  const isNew = !p;
  if (isNew) {
    p = blankProject(remote.name || 'Group project', { id: `sh_${sid}`, items: [] });
    state.projects.push(p);
  }
  const merged = mergeShared(isNew ? {} : p, remote);
  Object.assign(p, merged, { shared: { ...(p.shared || {}), id: sid, ...info } });
  const active = p.id === state.activeId;
  emit({ projects: true, project: active, format: active, remote: true });
  return p;
}

export function rememberShared(sid) {
  state.sharedIds = [...new Set([...(state.sharedIds || []), sid])];
  if (state.deleted) delete state.deleted[`sh:${sid}`];
}

// You left (keepCopy = false) or the owner stopped sharing (keepCopy = true:
// you keep your own copy of the sources)
export function removeShared(sid, { keepCopy = false } = {}) {
  state.sharedIds = (state.sharedIds || []).filter(x => x !== sid);
  tombstone(`sh:${sid}`);
  const idx = state.projects.findIndex(x => x.shared?.id === sid);
  if (idx < 0) { emit({}); return null; }
  const p = state.projects[idx];
  if (keepCopy) {
    delete p.shared;
    if (p.id.startsWith('sh_')) { const old = p.id; p.id = uid(); if (state.activeId === old) state.activeId = p.id; }
    p.name = `${p.name} (copy)`;
    p.updatedAt = Date.now();
  } else {
    state.projects.splice(idx, 1);
    if (!state.projects.length) state.projects.push(blankProject('My first bibliography'));
    if (state.activeId === p.id) state.activeId = state.projects[0].id;
  }
  emit({ projects: true, project: true, format: true, remote: true });
  return p;
}

// ---------- backup ----------
export function exportBackup() { return JSON.stringify({ app: 'citemyshi', exported: new Date().toISOString(), ...state }, null, 2); }
export function importBackup(json, { merge = true } = {}) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.projects)) throw new Error('That file isn’t a citemyshi backup');
  if (!merge) { state.projects = []; state.folders = []; }
  const folderMap = new Map();
  for (const f of data.folders || []) { const nf = { ...f, id: uid() }; folderMap.set(f.id, nf.id); state.folders.push(nf); }
  for (const p of data.projects) state.projects.push({ ...p, id: uid(), folderId: p.folderId ? folderMap.get(p.folderId) || null : null });
  if (!project(state.activeId)) state.activeId = state.projects[0].id;
  emit({ projects: true, project: true, format: true });
  return data.projects.length;
}
