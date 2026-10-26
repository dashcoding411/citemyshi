import { $, $$, esc, api, warmUp, debounce, toast, openMenu, closeMenu, openModal, confirmDialog, promptDialog, copyRich, download, tagColor, FOLDER_COLORS, topModal } from './ui.js';
import { icon } from './icons.js';
import { CITE_TABS, SOURCE_TYPES, sourceTypeFor, missingInfo } from './types.js';
import * as S from './store.js';
import { state, active } from './store.js';
import { openEditor } from './editor.js';
import { openStylePicker, openInText, openImport, pickProject } from './dialogs.js';
import { sourceBadge, fixAll, openPaperCheck } from './audit.js';
import { formatBibliography } from './formatter.js';

let cloudMod = null; // optional Firebase sync, loaded lazily so the app works offline

const ui = {
  tab: 'all', query: '', loading: false, results: null, resultsFor: '', kb: -1,
  fmt: null, fmtFor: null, formatting: false,
  selected: new Set(), filter: '', tagFilter: null, incompleteOnly: false, fixing: null, sideFilter: '', editingNote: null, showProjectNotes: false,
  flash: null,
};

// ============ SIDEBAR ============
function renderSidebar() {
  const q = ui.sideFilter.toLowerCase();
  const match = p => !q || p.name.toLowerCase().includes(q);
  const projRow = p => `
    <div class="tree-row ${p.id === state.activeId ? 'active' : ''}" data-project="${p.id}" draggable="true" title="${esc(p.name)}">
      ${icon('file')}<span class="name">${esc(p.name)}</span><span class="count">${p.items.length}</span>
      <button class="row-menu" data-project-menu="${p.id}" aria-label="Project options">${icon('more')}</button>
    </div>`;
  const folders = state.folders.map(f => {
    const kids = state.projects.filter(p => p.folderId === f.id && match(p));
    if (q && !kids.length && !f.name.toLowerCase().includes(q)) return '';
    const total = state.projects.filter(p => p.folderId === f.id).reduce((n, p) => n + p.items.length, 0);
    return `
      <div class="folder ${f.collapsed && !q ? 'collapsed' : ''}">
        <div class="tree-row" data-folder="${f.id}">
          ${icon('chevronDown', 'chev')}
          <span class="folder-dot" style="background:${f.color || 'var(--muted)'}"></span>
          <span class="name" style="font-weight:600">${esc(f.name)}</span><span class="count">${total}</span>
          <button class="row-menu" data-folder-menu="${f.id}" aria-label="Folder options">${icon('more')}</button>
        </div>
        ${f.collapsed && !q ? '' : `<div class="folder-children">${kids.map(projRow).join('') || '<div class="tree-empty">Drag projects here</div>'}</div>`}
      </div>`;
  }).join('');
  const loose = state.projects.filter(p => !p.folderId && match(p));
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

  $('#sidebar').innerHTML = `
    <a class="brand" href="/"><span class="brand-mark">“</span><span>citemyshi<small>free citation generator</small></span></a>
    <div class="side-actions">
      <button class="btn btn-primary" data-new-project>${icon('plus')} New project</button>
      <button class="btn" data-new-folder title="New folder" aria-label="New folder">${icon('folderPlus')}</button>
    </div>
    ${state.projects.length > 5 ? `<div class="side-search">${icon('search')}<input placeholder="Find a project…" value="${esc(ui.sideFilter)}" data-side-filter></div>` : ''}
    <nav class="tree" aria-label="Projects and folders">
      ${state.folders.length ? `<div class="tree-label"><span>Folders</span></div>${folders}` : ''}
      <div class="tree-label"><span>${state.folders.length ? 'Projects' : 'Your projects'}</span></div>
      <div class="root-drop" data-root-drop>${loose.map(projRow).join('') || (state.folders.length ? '<div class="tree-empty">All projects are in folders</div>' : '')}</div>
    </nav>
    <div class="side-foot">
      <button class="icon-btn" data-theme-toggle title="Toggle dark mode" aria-label="Toggle dark mode">${icon(dark ? 'sun' : 'moon')}</button>
      <button class="icon-btn" data-backup title="Back up & restore" aria-label="Back up and restore">${icon('archive')}</button>
      <span class="spacer"></span>
      ${accountHtml()}
    </div>`;
}

function accountHtml() {
  const c = cloudMod?.cloud;
  if (!c?.ready) return '<span style="font-size:11.5px;color:var(--muted)">Saved on this device</span>';
  if (!c.user) return `<button class="btn btn-sm" data-sign-in title="Sign in with Google to sync across devices">${GOOGLE_G} Sign in to sync</button>`;
  const label = { syncing: 'Syncing…', synced: 'Synced', error: 'Sync issue', off: 'Signed in' }[c.status] || 'Synced';
  const dot = { syncing: 'var(--brand)', synced: 'var(--ok)', error: 'var(--warn)' }[c.status] || 'var(--muted)';
  const avatar = c.user.photo
    ? `<img src="${esc(c.user.photo)}" alt="" referrerpolicy="no-referrer" style="width:24px;height:24px;border-radius:50%">`
    : `<span style="width:24px;height:24px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700">${esc((c.user.name || c.user.email || '?')[0].toUpperCase())}</span>`;
  return `<button class="btn btn-sm btn-ghost" data-account title="${esc(c.error || `Signed in as ${c.user.email}`)}" style="gap:8px;padding:4px 8px">
    ${avatar}<span style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-2)"><span style="width:7px;height:7px;border-radius:50%;background:${dot}"></span>${label}</span></button>`;
}

const GOOGLE_G = '<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

async function doSignIn(btn) {
  if (!cloudMod) return toast('Sync is unavailable right now — check your connection', { error: true });
  btn && (btn.disabled = true);
  try {
    await cloudMod.signIn();
    toast('Signed in — your projects will sync across devices');
  } catch (e) {
    const msg = cloudMod.friendlyError(e);
    if (msg) toast(msg, { error: true, duration: 10000 });
  }
  btn && (btn.disabled = false);
}

function accountMenu(anchor) {
  const c = cloudMod.cloud;
  openMenu(anchor, [
    { label: c.user.name || c.user.email, heading: true },
    c.error && { label: c.error, icon: 'alert', onClick: () => toast(c.error, { duration: 10000 }) },
    { label: c.user.email, icon: 'user' },
    { sep: true },
    { label: 'Sign out', icon: 'external', onClick: async () => { await cloudMod.signOut(); toast('Signed out — your projects stay saved on this device'); } },
  ], { align: 'right' });
}

function projectMenu(anchor, id) {
  const p = S.project(id);
  openMenu(anchor, [
    { label: 'Open', icon: 'file', onClick: () => S.setActive(id) },
    { label: 'Rename', icon: 'pencil', onClick: async () => { const n = await promptDialog({ title: 'Rename project', label: 'Project name', value: p.name }); if (n) S.updateProject(id, { name: n }); } },
    { label: 'Duplicate', icon: 'copy', onClick: () => { S.duplicateProject(id); toast('Project duplicated'); } },
    { label: 'Move to folder…', icon: 'folderMove', onClick: () => folderPicker(anchor, id) },
    { sep: true },
    { label: 'Delete project', icon: 'trash', danger: true, onClick: () => deleteProject(id) },
  ]);
}

function folderPicker(anchor, projectId) {
  const p = S.project(projectId);
  openMenu(anchor, [
    { label: 'Move to', heading: true },
    ...state.folders.map(f => ({ label: f.name, icon: 'folder', checked: p.folderId === f.id, onClick: () => S.moveProject(projectId, f.id) })),
    { label: 'No folder', icon: 'file', checked: !p.folderId, onClick: () => S.moveProject(projectId, null) },
    { sep: true },
    { label: 'New folder…', icon: 'folderPlus', onClick: async () => { const n = await promptDialog({ title: 'New folder', label: 'Folder name', placeholder: 'e.g. History class', confirm: 'Create' }); if (n) { const f = S.createFolder(n); S.moveProject(projectId, f.id); } } },
  ]);
}

async function deleteProject(id) {
  const p = S.project(id);
  const ok = !p.items.length || await confirmDialog({ title: 'Delete project?', message: `“${esc(p.name)}” and its ${p.items.length} citation${p.items.length === 1 ? '' : 's'} will be deleted.`, confirm: 'Delete', danger: true });
  if (!ok) return;
  const undo = S.deleteProject(id);
  toast(`Deleted “${p.name}”`, { action: { label: 'Undo', fn: () => S.restoreProject(undo) } });
}

function folderMenu(anchor, id) {
  const f = state.folders.find(x => x.id === id);
  openMenu(anchor, [
    { label: 'New project in folder', icon: 'plus', onClick: async () => { const n = await promptDialog({ title: 'New project', label: 'Project name', placeholder: 'e.g. Essay 1', confirm: 'Create' }); if (n) S.createProject(n, id); } },
    { label: 'Rename folder', icon: 'pencil', onClick: async () => { const n = await promptDialog({ title: 'Rename folder', label: 'Folder name', value: f.name }); if (n) S.updateFolder(id, { name: n }); } },
    { label: 'Color', heading: true },
    { html: `<div class="swatches">${FOLDER_COLORS.map(c => `<span class="swatch ${f.color === c ? 'on' : ''}" style="background:${c}" data-c="${c}" role="button" aria-label="Color ${c}"></span>`).join('')}</div>`, onMount: (el, close) => $$('[data-c]', el).forEach(s => s.onclick = () => { S.updateFolder(id, { color: s.dataset.c }); close(); }) },
    { sep: true },
    { label: 'Delete folder (keep projects)', icon: 'folder', onClick: () => { const r = S.deleteFolder(id); toast(`Folder deleted — ${r.inside.length} project${r.inside.length === 1 ? '' : 's'} moved out`); } },
    { label: 'Delete folder and projects', icon: 'trash', danger: true, onClick: async () => {
      const n = state.projects.filter(p => p.folderId === id).length;
      if (await confirmDialog({ title: 'Delete folder and projects?', message: `This deletes “${esc(f.name)}” and the ${n} project${n === 1 ? '' : 's'} inside it. This can’t be undone.`, confirm: 'Delete all', danger: true })) S.deleteFolder(id, { withProjects: true });
    } },
  ]);
}

function backupMenu(anchor) {
  openMenu(anchor, [
    { label: 'Download backup (.json)', icon: 'download', onClick: () => download(`citemyshi-backup-${new Date().toISOString().slice(0, 10)}.json`, S.exportBackup(), 'application/json') },
    { label: 'Restore from backup…', icon: 'upload', onClick: () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json';
      inp.onchange = async () => { try { const n = S.importBackup(await inp.files[0].text()); toast(`Restored ${n} project${n === 1 ? '' : 's'}`); } catch (e) { toast(e.message, { error: true }); } };
      inp.click();
    } },
    { sep: true },
    { label: `Citation font: ${state.serif ? 'Serif' : 'Sans'}`, icon: 'type', onClick: () => { state.serif = !state.serif; S.emit({ project: true }); } },
  ]);
}

function wireSidebar() {
  const sb = $('#sidebar');
  sb.addEventListener('click', async e => {
    const t = e.target.closest('[data-project-menu],[data-folder-menu],[data-project],[data-folder],[data-new-project],[data-new-folder],[data-theme-toggle],[data-backup],[data-sign-in],[data-account]');
    if (!t) return;
    if ('signIn' in t.dataset) return doSignIn(t);
    if ('account' in t.dataset) return accountMenu(t);
    if (t.dataset.projectMenu) { e.stopPropagation(); return projectMenu(t, t.dataset.projectMenu); }
    if (t.dataset.folderMenu) { e.stopPropagation(); return folderMenu(t, t.dataset.folderMenu); }
    if (t.dataset.project) { S.setActive(t.dataset.project); document.body.classList.remove('nav-open'); return; }
    if (t.dataset.folder) { const f = state.folders.find(x => x.id === t.dataset.folder); S.updateFolder(f.id, { collapsed: !f.collapsed }); return; }
    if ('newProject' in t.dataset) {
      const n = await promptDialog({ title: 'New project', label: 'Project name', placeholder: 'e.g. Biology essay', confirm: 'Create' });
      if (n) { S.createProject(n, active()?.folderId || null); document.body.classList.remove('nav-open'); setTimeout(() => $('#citeInput')?.focus(), 50); }
      return;
    }
    if ('newFolder' in t.dataset) { const n = await promptDialog({ title: 'New folder', label: 'Folder name', placeholder: 'e.g. History class', confirm: 'Create' }); if (n) S.createFolder(n); return; }
    if ('themeToggle' in t.dataset) {
      const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      state.theme = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = state.theme;
      S.emit({ projects: true, project: true });
      return;
    }
    if ('backup' in t.dataset) return backupMenu(t);
  });
  sb.addEventListener('contextmenu', e => {
    const pr = e.target.closest('[data-project]'); const fo = e.target.closest('[data-folder]');
    if (pr) { e.preventDefault(); projectMenu(pr, pr.dataset.project); }
    else if (fo) { e.preventDefault(); folderMenu(fo, fo.dataset.folder); }
  });
  sb.addEventListener('input', e => { if ('sideFilter' in e.target.dataset) { ui.sideFilter = e.target.value; renderSidebar(); const i = $('[data-side-filter]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });

  // Drag & drop: projects into folders, citations onto projects
  let drag = null;
  sb.addEventListener('dragstart', e => {
    const pr = e.target.closest('[data-project]');
    if (pr) { drag = { kind: 'project', id: pr.dataset.project }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', pr.dataset.project); }
  });
  sb.addEventListener('dragover', e => {
    const d = drag || window.__citeDrag;
    if (!d) return;
    const folder = e.target.closest('[data-folder]');
    const proj = e.target.closest('[data-project]');
    const root = e.target.closest('[data-root-drop]');
    $$('.drop-target', sb).forEach(x => x.classList.remove('drop-target'));
    if (d.kind === 'project' && (folder || (root && !proj))) { e.preventDefault(); (folder || root).classList.add('drop-target'); }
    if (d.kind === 'project' && proj && !folder) {
      // dropping a project on a project inside a folder → that folder
      const inFolder = proj.closest('.folder-children');
      if (inFolder) { e.preventDefault(); proj.closest('.folder').querySelector('[data-folder]').classList.add('drop-target'); }
      else if (root) { e.preventDefault(); root.classList.add('drop-target'); }
    }
    if (d.kind === 'cites' && proj && proj.dataset.project !== state.activeId) { e.preventDefault(); e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'; proj.classList.add('drop-target'); }
  });
  sb.addEventListener('dragleave', e => { if (!sb.contains(e.relatedTarget)) $$('.drop-target', sb).forEach(x => x.classList.remove('drop-target')); });
  sb.addEventListener('drop', e => {
    const d = drag || window.__citeDrag;
    const target = $('.drop-target', sb);
    $$('.drop-target', sb).forEach(x => x.classList.remove('drop-target'));
    if (!d || !target) return;
    e.preventDefault();
    if (d.kind === 'project') S.moveProject(d.id, target.dataset.folder || null);
    if (d.kind === 'cites' && target.dataset.project) {
      const to = S.project(target.dataset.project);
      const n = S.transferItems(d.ids, to.id, { copy: e.altKey });
      ui.selected.clear();
      toast(`${e.altKey ? 'Copied' : 'Moved'} ${n} citation${n === 1 ? '' : 's'} to ${to.name}`);
    }
    drag = null; window.__citeDrag = null;
  });
  sb.addEventListener('dragend', () => { drag = null; $$('.drop-target', sb).forEach(x => x.classList.remove('drop-target')); });
}

// ============ TOP BAR ============
function renderTopbar() {
  const p = active();
  const folder = state.folders.find(f => f.id === p.folderId);
  $('#topbar').innerHTML = `
    <button class="icon-btn menu-toggle" data-nav aria-label="Open projects">${icon('menu')}</button>
    <div class="project-title">
      <input value="${esc(p.name)}" aria-label="Project name" data-project-name maxlength="120">
      <div class="project-sub">
        ${folder ? `<span class="crumb"><span class="folder-dot" style="background:${folder.color || 'var(--muted)'}"></span>${esc(folder.name)}</span><span>·</span>` : ''}
        <span>${p.items.length} citation${p.items.length === 1 ? '' : 's'}</span>
        <span>·</span>
        <button class="cite-foot-link" data-proj-notes style="background:none;border:0;padding:0;color:${p.notes ? 'var(--brand)' : 'var(--muted)'};display:inline-flex;gap:4px;align-items:center;font-size:13px">${icon('note')} ${p.notes ? 'Project notes' : 'Add project notes'}</button>
      </div>
    </div>
    <button class="style-btn" data-style title="Change citation style">
      <span style="min-width:0"><span class="lbl">Citation style</span><span class="val">${esc(p.styleTitle || p.style)}</span></span>${icon('chevronDown')}
    </button>
    ${ui.showProjectNotes ? '' : ''}`;
  const notesHost = $('#projNotes');
  if (ui.showProjectNotes) {
    if (!notesHost) $('#topbar').insertAdjacentHTML('afterend', `<div class="project-notes" id="projNotes"><textarea placeholder="Notes for this whole project — assignment brief, due date, thesis ideas…">${esc(p.notes || '')}</textarea></div>`);
    else $('textarea', notesHost).value = p.notes || '';
  } else notesHost?.remove();
}

function wireTopbar() {
  const tb = $('#topbar');
  tb.addEventListener('click', e => {
    if (e.target.closest('[data-style]')) openStylePicker();
    if (e.target.closest('[data-nav]')) document.body.classList.add('nav-open');
    if (e.target.closest('[data-proj-notes]')) { ui.showProjectNotes = !ui.showProjectNotes; renderTopbar(); if (ui.showProjectNotes) $('#projNotes textarea')?.focus(); }
  });
  tb.addEventListener('change', e => { if ('projectName' in e.target.dataset) { const v = e.target.value.trim(); if (v) S.updateProject(state.activeId, { name: v }); else e.target.value = active().name; } });
  tb.addEventListener('keydown', e => { if ('projectName' in e.target.dataset && e.key === 'Enter') e.target.blur(); });
  document.addEventListener('input', debounce(e => { if (e.target.closest?.('#projNotes')) { const p = active(); p.notes = e.target.value; p.updatedAt = Date.now(); S.emit({}); } }, 400));
  $('#backdrop').onclick = () => document.body.classList.remove('nav-open');
}

// ============ CITE BOX ============
function renderCiteCard() {
  const tab = CITE_TABS.find(t => t.id === ui.tab);
  const tabIcons = { website: 'globe', book: 'book', journal: 'journal', video: 'video', all: 'search' };
  $('#citeCard').innerHTML = `
    <div class="tabs" role="tablist">${CITE_TABS.map(t => `<button class="tab ${t.id === ui.tab ? 'active' : ''}" role="tab" aria-selected="${t.id === ui.tab}" data-tab="${t.id}">${icon(tabIcons[t.id])}${t.label}</button>`).join('')}</div>
    <form class="cite-form" data-cite-form>
      <div class="cite-input-wrap">
        ${icon(ui.tab === 'website' || ui.tab === 'video' ? 'link' : 'search')}
        <input class="cite-input" id="citeInput" placeholder="${esc(tab.placeholder)}" value="${esc(ui.query)}" autocomplete="off" spellcheck="false" aria-label="${esc(tab.placeholder)}">
        ${ui.query ? `<button type="button" class="icon-btn cite-clear" data-clear aria-label="Clear">${icon('x')}</button>` : ''}
      </div>
      <button class="btn btn-primary btn-lg" type="submit" ${ui.loading ? 'disabled' : ''}>${ui.loading ? '<span class="spinner"></span> Finding…' : `${icon('quote')} Cite`}</button>
    </form>
    <div class="cite-foot">
      <span>Paste a link, DOI, ISBN, PubMed ID or arXiv ID — or search by title. <span class="kbd">/</span> to focus</span>
      <span style="display:flex;gap:14px">
        <button class="link" data-manual>${icon('pencil')} Cite manually</button>
        <button class="link" data-import>${icon('upload')} Import</button>
      </span>
    </div>
    ${renderResults()}`;
}

function renderResults() {
  if (ui.loading && ui.loadingKind === 'search') return `<div class="results"><div class="results-head">Searching…</div>${'<div class="skel"><div style="width:65%"></div><div style="width:40%"></div></div>'.repeat(3)}</div>`;
  if (!ui.results) return '';
  const results = ui.tab === 'book' ? ui.results.filter(r => r.kind === 'book') : ui.tab === 'journal' ? ui.results.filter(r => r.kind === 'journal') : ui.results;
  if (!results.length) return `<div class="results"><div class="results-empty">No results for “${esc(ui.resultsFor)}”. Try different words, paste a link, or <button class="link" data-manual style="background:none;border:0;color:var(--brand);font-weight:600;padding:0">cite it manually</button>.</div></div>`;
  return `<div class="results" role="listbox">
    <div class="results-head"><span>${results.length} results for “${esc(ui.resultsFor)}”</span><button class="icon-btn" data-close-results aria-label="Close results">${icon('x')}</button></div>
    ${results.map((r, i) => {
      const it = r.item;
      const authors = (it.author || []).slice(0, 3).map(a => a.literal || [a.given, a.family].filter(Boolean).join(' ')).join(', ') + ((it.author || []).length > 3 ? ' et al.' : '');
      const year = it.issued?.['date-parts']?.[0]?.[0];
      const where = it['container-title'] || it.publisher || '';
      return `<div class="result ${i === ui.kb ? 'kb' : ''}" data-result="${i}" role="option">
        <div class="result-thumb">${icon(r.kind === 'book' ? 'book' : 'journal')}${it._thumb ? `<img src="${esc(it._thumb)}" alt="" loading="lazy" onerror="this.remove()" onload="if(this.naturalWidth<5)this.remove()">` : ''}</div>
        <div class="result-body">
          <div class="result-title">${esc(it.title)}</div>
          <div class="result-meta"><span class="badge ${r.kind}">${r.kind === 'book' ? 'Book' : sourceTypeFor(it).label}</span> ${esc([authors, year, where].filter(Boolean).join(' · '))}</div>
        </div>
        <button class="btn btn-sm btn-primary" tabindex="-1">${icon('quote')} Cite</button>
      </div>`;
    }).join('')}
  </div>`;
}

async function runCite() {
  const q = ui.query.trim();
  if (!q) { $('#citeInput').focus(); return; }
  const looksDirect = /^(https?:\/\/|www\.|doi:|10\.\d{4,}\/|pmid:|arxiv:)/i.test(q) || /^[\d\s-]{10,17}[xX]?$/.test(q) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*$/i.test(q) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(q);
  ui.loading = true; ui.loadingKind = looksDirect ? 'item' : 'search'; ui.results = null;
  renderCiteCard();
  try {
    const kind = CITE_TABS.find(t => t.id === ui.tab).kind;
    const r = await api(`/api/cite?q=${encodeURIComponent(q)}&kind=${kind}`);
    ui.loading = false;
    if (r.mode === 'item') {
      ui.results = null;
      renderCiteCard();
      openEditor({ item: r.item, isNew: true, source: r.source, warnings: r.warnings || [], onSaved: afterAdd });
    } else {
      ui.results = r.results; ui.resultsFor = q; ui.kb = -1;
      renderCiteCard();
    }
  } catch (e) {
    ui.loading = false;
    renderCiteCard();
    toast(e.message || 'Couldn’t find that', { error: true });
  }
}

async function pickResult(i) {
  const results = ui.tab === 'book' ? ui.results.filter(r => r.kind === 'book') : ui.tab === 'journal' ? ui.results.filter(r => r.kind === 'journal') : ui.results;
  const r = results[i];
  if (!r) return;
  let item = { ...r.item };
  delete item._thumb;
  // Fill gaps (place, pages) from the ISBN record — but never swap in another edition's details
  if (r.kind === 'book' && item.ISBN && (!item['publisher-place'] || !item.publisher)) {
    const el = $(`[data-result="${i}"] .btn`);
    if (el) el.innerHTML = '<span class="spinner" style="width:12px;height:12px"></span>';
    try {
      const full = await Promise.race([api(`/api/cite?q=${encodeURIComponent(item.ISBN)}`), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
      for (const [k, v] of Object.entries(full.item || {})) if (item[k] == null && k !== 'title') item[k] = v;
    } catch {}
  }
  openEditor({ item, isNew: true, source: r.kind === 'book' ? 'book search' : 'Crossref', onSaved: afterAdd });
}

function afterAdd(added) {
  ui.query = ''; ui.results = null;
  ui.flash = added.id;
  renderCiteCard();
}

function wireCiteCard() {
  const c = $('#citeCard');
  c.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { ui.tab = tab.dataset.tab; renderCiteCard(); $('#citeInput').focus(); return; }
    if (e.target.closest('[data-clear]')) { ui.query = ''; ui.results = null; renderCiteCard(); $('#citeInput').focus(); return; }
    if (e.target.closest('[data-close-results]')) { ui.results = null; renderCiteCard(); return; }
    if (e.target.closest('[data-manual]')) {
      const map = { website: 'website', book: 'book', journal: 'journal', video: 'video', all: 'website' };
      const t = SOURCE_TYPES.find(s => s.id === map[ui.tab]);
      const item = { type: t.csl, ...(t.genre ? { genre: t.genre } : {}) };
      if (/^https?:\/\//.test(ui.query)) item.URL = ui.query.trim(); else if (ui.query.trim()) item.title = ui.query.trim();
      openEditor({ item, isNew: true, onSaved: afterAdd });
      return;
    }
    if (e.target.closest('[data-import]')) return openImport();
    const res = e.target.closest('[data-result]');
    if (res) pickResult(+res.dataset.result);
  });
  c.addEventListener('submit', e => { e.preventDefault(); if (ui.kb >= 0 && ui.results) return pickResult(ui.kb); runCite(); });
  c.addEventListener('input', e => {
    if (e.target.id !== 'citeInput') return;
    const had = !!ui.query;
    ui.query = e.target.value;
    if (had !== !!ui.query) { const pos = e.target.selectionStart; renderCiteCard(); const i = $('#citeInput'); i.focus(); i.setSelectionRange(pos, pos); }
  });
  c.addEventListener('paste', e => {
    if (e.target.id !== 'citeInput') return;
    // Pasting a link cites it straight away, like MyBib
    const txt = e.clipboardData.getData('text').trim();
    if (/^https?:\/\/\S+$/.test(txt) && !e.target.value.trim()) { e.preventDefault(); ui.query = txt; renderCiteCard(); runCite(); }
  });
  c.addEventListener('keydown', e => {
    if (e.target.id !== 'citeInput' || !ui.results?.length) return;
    const n = $$('[data-result]', c).length;
    if (e.key === 'ArrowDown') { e.preventDefault(); ui.kb = Math.min(n - 1, ui.kb + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ui.kb = Math.max(-1, ui.kb - 1); }
    else if (e.key === 'Escape') { ui.results = null; }
    else return;
    const pos = e.target.selectionStart;
    renderCiteCard();
    const i = $('#citeInput'); i.focus(); i.setSelectionRange(pos, pos);
    $('.result.kb')?.scrollIntoView({ block: 'nearest' });
  });
}

// ============ BIBLIOGRAPHY ============
let fmtSeq = 0;
async function refreshFormat() {
  const p = active();
  const seq = ++fmtSeq;
  const key = JSON.stringify([p.id, p.style, p.lang, p.items.map(({ _tags, _added, ...i }) => i)]);
  if (ui.fmtFor === key) return renderBib();
  ui.formatting = true;
  if (!ui.fmt || ui.fmt.projectId !== p.id) renderBib();
  try {
    const r = await formatBibliography({ items: p.items, style: p.style, lang: p.lang });
    if (seq !== fmtSeq) return;
    ui.fmt = { ...r, projectId: p.id, byId: new Map(r.entries.map((e, i) => [e.id, { ...e, order: i }])) };
    ui.fmtFor = key;
    if (r.style?.title && !p.styleTitle) S.updateProject(p.id, { styleTitle: r.style.title });
  } catch (e) {
    if (seq !== fmtSeq) return;
    toast(`Formatting failed: ${e.message}`, { error: true });
  }
  ui.formatting = false;
  renderBib();
}

function sortedItems() {
  const p = active();
  const by = ui.fmt?.projectId === p.id ? ui.fmt.byId : new Map();
  let items = [...p.items];
  const f = ui.filter.toLowerCase();
  if (f) items = items.filter(i => (by.get(i.id)?.text || i.title || '').toLowerCase().includes(f) || (i._note || '').toLowerCase().includes(f) || (i._tags || []).some(t => t.toLowerCase().includes(f)));
  if (ui.tagFilter) items = items.filter(i => (i._tags || []).includes(ui.tagFilter));
  if (ui.incompleteOnly) items = items.filter(i => missingInfo(i).length);
  const first = i => { const a = (i.author || i.editor || [])[0]; return (a ? (a.family || a.literal || '') : i.title || '').toLowerCase(); };
  const year = i => i.issued?.['date-parts']?.[0]?.[0] || 0;
  const sorts = {
    style: (a, b) => (by.get(a.id)?.order ?? 1e9) - (by.get(b.id)?.order ?? 1e9),
    'added-desc': (a, b) => (b._added || 0) - (a._added || 0),
    'added-asc': (a, b) => (a._added || 0) - (b._added || 0),
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    author: (a, b) => first(a).localeCompare(first(b)),
    'year-desc': (a, b) => year(b) - year(a),
    'year-asc': (a, b) => year(a) - year(b),
  };
  return items.sort(sorts[p.sort] || sorts.style);
}

const SORT_LABELS = { style: 'Style order (A–Z)', 'added-desc': 'Newest added', 'added-asc': 'Oldest added', title: 'Title', author: 'Author', 'year-desc': 'Year (newest)', 'year-asc': 'Year (oldest)' };
const GROUP_LABELS = { none: 'No grouping', type: 'Source type', tag: 'Tag' };

function linkify(html) {
  return html.replace(/(^|[\s>(])(https?:\/\/[^\s<]+?)(?=[.,;)]?(?:\s|<|$))/g, (m, pre, url) => `${pre}<a href="${url.replace(/&amp;/g, '&').replace(/"/g, '%22')}" target="_blank" rel="noopener">${url}</a>`);
}

function citeHtml(item) {
  const p = active();
  const f = ui.fmt?.projectId === p.id ? ui.fmt.byId.get(item.id) : null;
  const t = sourceTypeFor(item);
  const missing = missingInfo(item);
  const hanging = ui.fmt?.params?.hangingIndent;
  const sel = ui.selected.has(item.id);
  const intext = f?.intext?.paren;
  return `
    <article class="cite ${sel ? 'selected' : ''} ${ui.flash === item.id ? 'flash' : ''}" data-id="${item.id}" draggable="true">
      <label class="check"><input type="checkbox" ${sel ? 'checked' : ''} data-select aria-label="Select citation"></label>
      <div class="cite-body">
        <div class="csl ${hanging ? 'hanging' : ''} ${state.serif ? 'serif' : ''}">${f ? linkify(f.html) : `<span style="color:var(--muted)">${esc(item.title || 'Untitled')}</span>`}</div>
        <div class="cite-meta">
          <span class="type-pill">${icon(t.icon)} ${esc(t.label)}</span>
          ${sourceBadge(item)}
          ${intext ? `<span class="intext-preview">· ${ui.fmt.style.isNote ? 'Note' : 'In-text'}: ${intext.replace(/<[^>]+>/g, '')}</span>` : ''}
          ${missing.length ? `<button class="warn-pill" data-edit title="Missing: ${esc(missing.join(', '))}">${icon('alert')} Missing ${esc(missing.slice(0, 2).join(', ').toLowerCase())}${missing.length > 2 ? ` +${missing.length - 2}` : ''}</button>` : ''}
          ${(item._tags || []).map(tg => `<button class="chip" style="${tagColor(tg)}" data-tag-filter="${esc(tg)}">${esc(tg)}</button>`).join('')}
        </div>
        ${ui.editingNote === item.id
          ? `<div class="note-edit"><textarea data-note-input placeholder="Write a note — key quotes, page numbers, why it matters…">${esc(item._note || '')}</textarea><div class="row"><button class="btn btn-sm" data-note-cancel>Cancel</button><button class="btn btn-sm btn-primary" data-note-save>Save note</button></div></div>`
          : item._note ? `<div class="note" data-note title="Click to edit note">${icon('note')}<span>${esc(item._note)}</span></div>` : ''}
      </div>
      <div class="cite-actions">
        <button class="icon-btn" data-copy title="Copy citation" aria-label="Copy citation">${icon('copy')}</button>
        <button class="icon-btn" data-intext title="In-text citation" aria-label="In-text citation">${icon('quote')}</button>
        <button class="icon-btn ${item._note ? 'on' : ''}" data-note title="${item._note ? 'Edit note' : 'Add note'}" aria-label="Note">${icon('note')}</button>
        <button class="icon-btn" data-edit title="Edit" aria-label="Edit citation">${icon('pencil')}</button>
        <button class="icon-btn" data-more title="More" aria-label="More options">${icon('more')}</button>
      </div>
    </article>`;
}

function renderBib() {
  const p = active();
  const items = sortedItems();
  const tags = S.allTags(p);
  const selCount = [...ui.selected].filter(id => p.items.some(i => i.id === id)).length;
  const allSel = items.length && items.every(i => ui.selected.has(i.id));
  const incomplete = p.items.filter(i => missingInfo(i).length).length;
  if (!incomplete) ui.incompleteOnly = false;

  let listHtml;
  if (!p.items.length) {
    listHtml = `<div class="empty">
      <div class="empty-art">${icon('quote')}</div>
      <h3>No citations yet</h3>
      <p>Paste a link to any website, article or video above — or search for a book or journal article. We’ll grab the author, date, publisher and everything else for you.</p>
      <div class="examples">
        <button class="btn btn-sm" data-example="https://en.wikipedia.org/wiki/Citation">${icon('globe')} Try a website</button>
        <button class="btn btn-sm" data-example="9780141439518">${icon('book')} Try an ISBN</button>
        <button class="btn btn-sm" data-example="10.1038/nature14539">${icon('journal')} Try a DOI</button>
      </div>
    </div>`;
  } else if (!items.length) {
    listHtml = `<div class="empty"><h3>Nothing matches</h3><p>No citations match your filter.</p><div class="examples"><button class="btn btn-sm" data-clear-filters>Clear filters</button></div></div>`;
  } else if (p.group === 'type' || p.group === 'tag') {
    const groups = new Map();
    for (const it of items) {
      const keys = p.group === 'type' ? [sourceTypeFor(it).label] : (it._tags?.length ? it._tags : ['Untagged']);
      for (const k of keys) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    }
    listHtml = [...groups.entries()].sort((a, b) => (a[0] === 'Untagged') - (b[0] === 'Untagged') || a[0].localeCompare(b[0]))
      .map(([k, list]) => `<div class="group-head">${p.group === 'tag' && k !== 'Untagged' ? `<span class="chip" style="${tagColor(k)}">${esc(k)}</span>` : esc(k)} <span style="font-weight:500">${list.length}</span></div>${list.map(citeHtml).join('')}`).join('');
  } else listHtml = items.map(citeHtml).join('');

  const heading = ui.fmt?.style?.name ? headingFor(ui.fmt.style.name) : 'References';
  $('#bib').innerHTML = `
    <div class="bib-head">
      <h2>${icon('layers')} ${esc(heading)} ${ui.formatting ? '<span class="spinner" style="width:13px;height:13px;color:var(--muted)"></span>' : ''}</h2>
      <span class="spacer"></span>
      ${p.items.length ? `
        <button class="btn btn-sm btn-ghost" data-paper-check title="Check your essay's in-text citations against this bibliography">${icon('check')} <span class="hide-sm">Check paper</span></button>
        <button class="btn btn-sm" data-copy-all>${icon('copy')} Copy all</button>
        <button class="btn btn-sm btn-primary" data-export>${icon('download')} Export ${icon('chevronDown')}</button>` : ''}
    </div>
    ${p.items.length ? `
    <div class="toolbar ${selCount ? 'selecting' : ''}">
      <label class="check-all"><input type="checkbox" data-select-all ${allSel ? 'checked' : ''} aria-label="Select all"></label>
      ${selCount ? `
        <span class="sel-count">${selCount} selected</span>
        <button class="btn btn-sm" data-sel-copy>${icon('copy')} Copy</button>
        <button class="btn btn-sm" data-sel-move>${icon('folderMove')} Move / copy to…</button>
        <button class="btn btn-sm" data-sel-tag>${icon('tag')} Tag</button>
        <button class="btn btn-sm" data-sel-export>${icon('download')} Export</button>
        <button class="btn btn-sm btn-danger" data-sel-delete>${icon('trash')} Delete</button>
        <span class="spacer"></span>
        <button class="btn btn-sm btn-ghost" data-sel-clear>Clear</button>
      ` : `
        <div class="filter-input">${icon('search')}<input placeholder="Filter citations…" value="${esc(ui.filter)}" data-filter></div>
        ${incomplete ? `<button class="btn btn-sm fix-btn" data-fix-all ${ui.fixing ? 'disabled' : ''} title="Look up missing details automatically">${ui.fixing ? `<span class="spinner" style="width:12px;height:12px"></span> Fixing ${ui.fixing}` : `${icon('sparkles')} Fix ${incomplete} incomplete`}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-sm btn-ghost" data-sort>${icon('sort')} <span class="hide-sm">${esc(SORT_LABELS[p.sort] || SORT_LABELS.style)}</span></button>
        <button class="btn btn-sm btn-ghost" data-group>${icon('layers')} <span class="hide-sm">${p.group && p.group !== 'none' ? `By ${GROUP_LABELS[p.group].toLowerCase()}` : 'Group'}</span></button>
      `}
    </div>
    ${ui.incompleteOnly ? `<div class="tagbar">${icon('alert')}<span class="lbl" style="color:var(--warn)">Showing ${incomplete} citation${incomplete === 1 ? '' : 's'} that need${incomplete === 1 ? 's' : ''} details — click one to fill it in.</span><button class="btn btn-sm btn-ghost" data-clear-filters>Show all</button></div>` : ''}
    ${tags.length ? `<div class="tagbar"><span class="lbl">${icon('tag')} Tags:</span>${tags.map(([tg, n]) => `<button class="chip ${ui.tagFilter === tg ? 'active' : ''}" style="${tagColor(tg)}" data-tag-filter="${esc(tg)}">${esc(tg)} <span style="opacity:.7">${n}</span></button>`).join('')}${ui.tagFilter ? `<button class="btn btn-sm btn-ghost" data-clear-filters>Show all</button>` : ''}</div>` : ''}
    ` : ''}
    <div class="list" style="${p.items.length ? '' : 'border-radius:12px'}">${listHtml}</div>
    ${p.items.length ? `<div class="bib-foot"><span>${items.length === p.items.length ? `${p.items.length} citation${p.items.length === 1 ? '' : 's'}` : `Showing ${items.length} of ${p.items.length}`} · ${esc(p.styleTitle || p.style)}</span><span>Drag citations onto a project in the sidebar to move them (hold <span class="kbd">Alt</span> to copy)</span></div>` : ''}`;
  ui.flash = null;
}

function headingFor(style) {
  if (/^modern-language-association/.test(style)) return 'Works Cited';
  if (/^(chicago|turabian|australian-guide-to-legal|oscola|mhra|modern-humanities)/.test(style)) return 'Bibliography';
  if (/harvard/.test(style)) return 'Reference List';
  return 'References';
}

function selectedItems() {
  const p = active();
  const order = sortedItems();
  return order.filter(i => ui.selected.has(i.id));
}

function bibHtmlFor(items) {
  const hanging = ui.fmt?.params?.hangingIndent;
  const spacing = ui.fmt?.params?.lineSpacing >= 2 ? 'line-height:2;' : '';
  return items.map(i => {
    const f = ui.fmt?.byId.get(i.id);
    if (!f) return '';
    const inner = f.html.replace(/^<div class="csl-entry">|<\/div>\s*$/g, '').replace(/<div class="csl-left-margin">(.*?)<\/div><div class="csl-right-inline">/g, '$1 ').replace(/<\/?div[^>]*>/g, '');
    return `<p style="${hanging ? 'padding-left:0.5in;text-indent:-0.5in;' : ''}${spacing}margin:0 0 ${spacing ? 0 : 8}px;font-family:'Times New Roman',serif;font-size:12pt">${inner}</p>`;
  }).join('');
}
const bibTextFor = items => items.map(i => ui.fmt?.byId.get(i.id)?.text).filter(Boolean).join('\n\n');

async function copyItems(items, label = 'Copied to clipboard') {
  if (!ui.fmt) return;
  const ok = await copyRich(bibHtmlFor(items), bibTextFor(items));
  toast(ok ? label : 'Couldn’t copy — try again', { error: !ok });
}

function exportMenu(anchor, items) {
  const p = active();
  const name = (p.name || 'bibliography').replace(/[^\w .-]+/g, '').trim() || 'bibliography';
  const viaServer = async (fmt, ext, mime) => {
    try { const r = await api(`/api/export/${fmt}`, { body: { items } }); download(`${name}.${ext}`, r.text, mime); }
    catch (e) { toast(e.message, { error: true }); }
  };
  openMenu(anchor, [
    { label: 'Documents', heading: true },
    { label: 'Word document (.docx)', icon: 'file', onClick: async () => {
      try {
        if (!ui.fmt) throw new Error('Still formatting — try again in a second');
        const entries = items.map(i => ui.fmt.byId.get(i.id)).filter(Boolean).map(e => ({ html: e.html }));
        const res = await api('/api/export/docx', { body: { entries, params: ui.fmt.params, style: p.style, title: headingFor(p.style), filename: name }, raw: true });
        download(`${name}.docx`, await res.blob());
      } catch (e) { toast(e.message, { error: true }); }
    } },
    { label: 'Google Docs (copy & paste)', icon: 'copy', onClick: () => copyItems(items, 'Copied — paste into Google Docs') },
    { label: 'Plain text (.txt)', icon: 'doc', onClick: () => download(`${name}.txt`, `${headingFor(p.style)}\n\n${bibTextFor(items)}\n`) },
    { label: 'Web page (.html)', icon: 'globe', onClick: () => download(`${name}.html`, `<!doctype html><meta charset="utf-8"><title>${esc(p.name)}</title><body style="max-width:7in;margin:1in auto"><h1 style="text-align:center;font:bold 12pt 'Times New Roman',serif">${esc(headingFor(p.style))}</h1>${bibHtmlFor(items)}</body>`, 'text/html') },
    { label: 'Print / save as PDF', icon: 'printer', onClick: () => printItems(items) },
    { label: 'Reference managers', heading: true },
    { label: 'BibTeX (.bib)', icon: 'code', onClick: () => viaServer('bibtex', 'bib', 'application/x-bibtex') },
    { label: 'BibLaTeX (.bib)', icon: 'code', onClick: () => viaServer('biblatex', 'bib', 'application/x-bibtex') },
    { label: 'RIS — Zotero, EndNote, Mendeley', icon: 'data', onClick: () => viaServer('ris', 'ris', 'application/x-research-info-systems') },
    { label: 'CSL-JSON', icon: 'code', onClick: () => viaServer('csl', 'json', 'application/json') },
  ], { align: 'right' });
}

function printItems(items) {
  const p = active();
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print', { error: true });
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(p.name)}</title><style>@page{margin:1in}body{font-family:'Times New Roman',serif;font-size:12pt}h1{text-align:center;font-size:12pt;font-weight:${/^modern-language/.test(p.style) ? 'normal' : 'bold'}}</style><h1>${esc(headingFor(p.style))}</h1>${bibHtmlFor(items)}<script>onload=()=>{print()}<\/script>`);
  w.document.close();
}

function citeMenu(anchor, id) {
  const p = active();
  const it = p.items.find(i => i.id === id);
  openMenu(anchor, [
    { label: 'Edit citation', icon: 'pencil', onClick: () => openEditor({ item: it }) },
    { label: it._note ? 'Edit note' : 'Add note', icon: 'note', onClick: () => startNote(id) },
    { label: 'Add tag…', icon: 'tag', onClick: () => tagItems([id]) },
    { label: 'In-text citation', icon: 'quote', onClick: () => openInText(it) },
    { sep: true },
    { label: 'Duplicate', icon: 'copy', onClick: () => { const { id: _, _added, ...rest } = it; const [n] = S.addItems([rest]); ui.flash = n.id; toast('Citation duplicated'); } },
    { label: 'Move / copy to project…', icon: 'folderMove', onClick: () => moveItems([id]) },
    it.URL && { label: 'Open source', icon: 'external', onClick: () => window.open(it.URL, '_blank', 'noopener') },
    { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => { const undo = S.removeItems([id]); ui.selected.delete(id); toast('Citation deleted', { action: { label: 'Undo', fn: undo } }); } },
  ], { align: 'right' });
}

function moveItems(ids) {
  pickProject({
    title: `Move ${ids.length} citation${ids.length === 1 ? '' : 's'} to…`, exclude: state.activeId,
    onPick: async (pid, { copy }) => {
      if (!pid) {
        const n = await promptDialog({ title: 'New project', label: 'Project name', confirm: 'Create' });
        if (!n) return;
        const from = state.activeId;
        const np = S.createProject(n, active()?.folderId);
        S.setActive(from);
        pid = np.id;
      }
      const n = S.transferItems(ids, pid, { copy });
      ids.forEach(id => ui.selected.delete(id));
      toast(`${copy ? 'Copied' : 'Moved'} ${n} citation${n === 1 ? '' : 's'} to ${S.project(pid).name}`, { action: { label: 'Go there', fn: () => S.setActive(pid) } });
    },
  });
}

async function tagItems(ids) {
  const existing = S.allTags().map(([t]) => t);
  const m = openModal({
    title: `Tag ${ids.length} citation${ids.length === 1 ? '' : 's'}`,
    body: `<div class="field"><label>Tag name</label><input class="input" id="tag-name" list="tag-dl" placeholder="e.g. Primary source, Chapter 2, To read" autofocus><datalist id="tag-dl">${existing.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
      ${existing.length ? `<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">${existing.map(t => `<button class="chip" style="${tagColor(t)}" data-pick="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}`,
    foot: `${ids.length > 1 || existing.length ? '<button class="btn btn-ghost" data-untag>Remove tag</button>' : ''}<span class="spacer"></span><button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-ok>${icon('tag')} Add tag</button>`,
  });
  const input = $('#tag-name', m.el);
  const apply = (remove = false) => {
    const tg = input.value.trim();
    if (!tg) return input.focus();
    const p = active();
    for (const it of p.items) if (ids.includes(it.id)) {
      const set = new Set(it._tags || []);
      remove ? set.delete(tg) : set.add(tg);
      it._tags = [...set];
      if (!it._tags.length) delete it._tags;
    }
    p.updatedAt = Date.now();
    S.emit({ project: true });
    m.close();
    toast(remove ? `Removed “${tg}”` : `Tagged “${tg}”`);
  };
  $$('[data-pick]', m.el).forEach(b => b.onclick = () => { input.value = b.dataset.pick; input.focus(); });
  input.onkeydown = e => { if (e.key === 'Enter') apply(); };
  $('[data-ok]', m.el).onclick = () => apply();
  $('[data-untag]', m.el)?.addEventListener('click', () => apply(true));
  $('[data-cancel]', m.el).onclick = () => m.close();
}

function startNote(id) {
  ui.editingNote = id;
  renderBib();
  const ta = $(`[data-id="${id}"] [data-note-input]`);
  ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length);
}

function wireBib() {
  const bib = $('#bib');
  bib.addEventListener('click', e => {
    const el = e.target.closest('button, [data-note], input[type=checkbox], a');
    if (!el) return;
    if (el.tagName === 'A') return;
    const card = el.closest('[data-id]');
    const id = card?.dataset.id;
    const p = active();
    const item = id && p.items.find(i => i.id === id);
    const d = el.dataset;
    if ('example' in d) { ui.query = d.example; ui.tab = 'all'; renderCiteCard(); runCite(); return; }
    if ('select' in d) { el.checked ? ui.selected.add(id) : ui.selected.delete(id); renderBib(); return; }
    if ('selectAll' in d) { const items = sortedItems(); if (el.checked) items.forEach(i => ui.selected.add(i.id)); else ui.selected.clear(); renderBib(); return; }
    if ('copy' in d && item) return copyItems([item]);
    if ('intext' in d && item) return openInText(item);
    if ('note' in d && item) return startNote(id);
    if ('noteCancel' in d) { ui.editingNote = null; renderBib(); return; }
    if ('noteSave' in d) {
      const v = $('[data-note-input]', card).value.trim();
      ui.editingNote = null;
      S.updateItem(id, { _note: v || undefined });
      if (!v) delete item._note;
      toast(v ? 'Note saved' : 'Note removed');
      return;
    }
    if ('edit' in d && item) return openEditor({ item });
    if ('more' in d) return citeMenu(el, id);
    if ('tagFilter' in d) { ui.tagFilter = ui.tagFilter === d.tagFilter ? null : d.tagFilter; renderBib(); return; }
    if ('clearFilters' in d) { ui.tagFilter = null; ui.filter = ''; ui.incompleteOnly = false; renderBib(); return; }
    if ('paperCheck' in d) return openPaperCheck(() => ui.fmt);
    if ('fixAll' in d) {
      ui.fixing = '…'; renderBib();
      fixAll((n, total) => { ui.fixing = `${n}/${total}`; renderBib(); }).then(r => {
        ui.fixing = null;
        renderBib();
        const msg = r.fixed ? `Filled in ${r.fixed} citation${r.fixed === 1 ? '' : 's'}` : 'Couldn’t find anything new automatically';
        if (r.still) toast(`${msg} · ${r.still} still need${r.still === 1 ? 's' : ''} your input`, { action: { label: 'Show them', fn: () => { ui.incompleteOnly = true; renderBib(); } }, duration: 7000 });
        else toast(`${msg} — everything’s complete`);
      });
      return;
    }
    if ('copyAll' in d) return copyItems(sortedItems(), `Copied ${sortedItems().length} citations`);
    if ('export' in d) return exportMenu(el, sortedItems());
    if ('sort' in d) return openMenu(el, Object.entries(SORT_LABELS).map(([k, l]) => ({ label: l, checked: (p.sort || 'style') === k, onClick: () => S.updateProject(p.id, { sort: k }) })), { align: 'right' });
    if ('group' in d) return openMenu(el, Object.entries(GROUP_LABELS).map(([k, l]) => ({ label: l, checked: (p.group || 'none') === k, onClick: () => S.updateProject(p.id, { group: k }) })), { align: 'right' });
    if ('selClear' in d) { ui.selected.clear(); renderBib(); return; }
    if ('selCopy' in d) return copyItems(selectedItems(), `Copied ${selectedItems().length} citations`);
    if ('selExport' in d) return exportMenu(el, selectedItems());
    if ('selMove' in d) return moveItems(selectedItems().map(i => i.id));
    if ('selTag' in d) return tagItems(selectedItems().map(i => i.id));
    if ('selDelete' in d) {
      const ids = selectedItems().map(i => i.id);
      const undo = S.removeItems(ids);
      ui.selected.clear();
      toast(`Deleted ${ids.length} citation${ids.length === 1 ? '' : 's'}`, { action: { label: 'Undo', fn: undo } });
    }
  });
  bib.addEventListener('dblclick', e => {
    const card = e.target.closest('[data-id]');
    if (card && e.target.closest('.csl') && !e.target.closest('a')) openEditor({ item: active().items.find(i => i.id === card.dataset.id) });
  });
  bib.addEventListener('input', debounce(e => {
    if ('filter' in e.target.dataset) { ui.filter = e.target.value; renderBib(); const i = $('[data-filter]'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
  }, 120));
  bib.addEventListener('keydown', e => {
    if (e.target.matches('[data-note-input]')) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('[data-note-save]', e.target.closest('[data-id]')).click();
      if (e.key === 'Escape') { e.stopPropagation(); ui.editingNote = null; renderBib(); }
    }
  });
  // Drag citations to sidebar projects
  bib.addEventListener('dragstart', e => {
    const card = e.target.closest('[data-id]');
    if (!card || e.target.closest('textarea')) return;
    const ids = ui.selected.has(card.dataset.id) ? selectedItems().map(i => i.id) : [card.dataset.id];
    window.__citeDrag = { kind: 'cites', ids };
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData('text/plain', ids.map(id => ui.fmt?.byId.get(id)?.text || '').join('\n\n'));
    card.classList.add('dragging');
    if (ids.length > 1) {
      const ghost = document.createElement('div');
      ghost.textContent = `${ids.length} citations`;
      ghost.style.cssText = 'position:absolute;top:-100px;padding:6px 12px;background:#3b5bfd;color:#fff;border-radius:8px;font:600 13px Inter,sans-serif';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 10, 10);
      setTimeout(() => ghost.remove(), 0);
    }
  });
  bib.addEventListener('dragend', e => { e.target.closest?.('[data-id]')?.classList.remove('dragging'); setTimeout(() => { window.__citeDrag = null; }, 50); });
}

// ============ GLOBAL ============
document.addEventListener('keydown', e => {
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  if (e.key === 'Escape') {
    if (document.querySelector('.menu')) return closeMenu();
    const m = topModal();
    if (m) { m.close(); return; }
    if (ui.results) { ui.results = null; renderCiteCard(); }
    if (ui.selected.size) { ui.selected.clear(); renderBib(); }
    document.body.classList.remove('nav-open');
  }
  if (typing || topModal()) return;
  if (e.key === '/') { e.preventDefault(); $('#citeInput').focus(); $('#citeInput').select(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selected.size) $('[data-sel-delete]')?.click();
  if ((e.metaKey || e.ctrlKey) && e.key === 'a' && active().items.length) { e.preventDefault(); sortedItems().forEach(i => ui.selected.add(i.id)); renderBib(); }
});

S.onChange(what => {
  if (what.switched) { ui.selected.clear(); ui.filter = ''; ui.tagFilter = null; ui.editingNote = null; ui.showProjectNotes = !!active().notes && false; }
  if (what.projects) renderSidebar();
  if (what.project) renderTopbar();
  if (what.format) refreshFormat();
  else if (what.project) renderBib();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.theme === 'system') { renderSidebar(); renderBib(); } });

import('./cloud.js').then(m => {
  cloudMod = m;
  let lastErr = null;
  m.onCloudChange(c => {
    renderSidebar();
    if (c.status === 'error' && c.error && c.error !== lastErr) toast(c.error, { error: true, duration: 10000 });
    lastErr = c.error;
  });
  renderSidebar();
}).catch(e => console.warn('Cloud sync unavailable:', e.message));

warmUp();
renderSidebar();
renderTopbar();
renderCiteCard();
renderBib();
wireSidebar();
wireTopbar();
wireCiteCard();
wireBib();
refreshFormat();
