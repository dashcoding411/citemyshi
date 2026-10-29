// Google Docs: this page runs inside the citemyshi sidebar (an iframe). The
// sidebar relays calls to the Apps Script functions in Code.gs.
let seq = 0;
const pending = new Map();
window.addEventListener('message', e => {
  if (e.source !== window.parent || !e.data?.cms) return;
  const p = pending.get(e.data.id);
  if (!p) return;
  pending.delete(e.data.id);
  e.data.ok ? p.resolve(e.data.result) : p.reject(new Error(e.data.error));
});
const call = (fn, ...args) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  window.parent.postMessage({ cms: true, id, fn, args }, '*');
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Google Docs didn’t respond. Reopen the sidebar.')); } }, 60000);
});

export async function createHost() {
  return {
    name: 'Google Docs',
    supportsFootnotes: false, // Docs can't create footnotes from add-ons; you add the footnote, we fill it
    getStoredCode: () => call('getStoredCode'),
    setStoredCode: code => call('setStoredCode', code),
    insertCitation: ({ payload, text, italics, isNote }) => call('insertAtCursor', { payload, text, italics, isNote }),
    async updateCitations(isNote, compute) {
      const payloads = await call('readCitations', isNote);
      const results = await compute(payloads);
      if (results) await call('updateCitations', isNote, results);
    },
    writeBibliography: args => call('writeBibliography', args),
  };
}
