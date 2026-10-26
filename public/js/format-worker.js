// Citation formatting runs here, in a background worker in the student's own
// browser: instant results, no server round trip, and the server stays light
// enough for free hosting no matter how many people use it.
import CSL from '../vendor/citeproc.js';
import { API_BASE } from './config.js';
import { createFormatter } from './csl-core.js';

async function getText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function getServerStyle(name) {
  let res;
  try { res = await fetch(`${API_BASE}/api/csl/${name}`); } catch { throw new Error('Can’t reach the citation server to load this style. Check your connection.'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn’t load the “${name}” style`);
  return res.json();
}

const OPS = createFormatter({ CSL, getText, getServerStyle });

self.onmessage = async e => {
  const { id, op, args } = e.data;
  try { self.postMessage({ id, ok: true, result: await OPS[op](args) }); }
  catch (err) { self.postMessage({ id, ok: false, error: err?.message || 'Formatting failed' }); }
};
