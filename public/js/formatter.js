// Main-thread side of the formatting worker (see format-worker.js).
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./format-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = e => {
    e.preventDefault?.();
    for (const p of pending.values()) p.reject(new Error('Citation formatting stopped unexpectedly — try again.'));
    pending.clear();
    worker.terminate();
    worker = null; // next call starts a fresh worker
  };
  return worker;
}

function call(op, args) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, op, args });
  });
}

export const formatBibliography = args => call('format', args);
export const formatSample = args => call('sample', args);
export const formatInText = args => call('intext', args);
export const styleInfo = name => call('styleInfo', { style: name });
