// A pretend document for testing the panel in a normal browser:
// /addin/mock.html?code=XXXX. Paragraph text with citations and footnotes.
export async function createHost() {
  const doc = { body: [{ text: 'My essay begins here. ', cite: null }], notes: [], bib: null };
  let stored = new URLSearchParams(location.search).get('code') || '';
  const render = () => {
    const el = document.getElementById('mockdoc');
    if (!el) return;
    const bodyHtml = doc.body.map(seg => seg.cite ? `<span class="mock-cite" title='${JSON.stringify(seg.cite.payload)}'>${seg.cite.text}</span>` : seg.text).join('');
    el.innerHTML = `<h3>Mock document</h3><p>${bodyHtml}</p>
      ${doc.notes.length ? `<hr><ol class="mock-notes">${doc.notes.map(n => `<li>${n.text}</li>`).join('')}</ol>` : ''}
      ${doc.bib ? `<hr><h4>${doc.bib.heading}</h4>${doc.bib.entries.map(e => `<p class="${e.heading ? 'h' : ''}">${e.heading || e.text}</p>`).join('')}` : ''}`;
    window.__mockDoc = doc;
  };
  setTimeout(render, 0);
  // Testing shortcut: use the website's active project from this browser
  let localProject = null;
  try {
    const st = JSON.parse(localStorage.getItem('citemyshi:v1'));
    const pr = st.projects.find(x => x.id === st.activeId);
    if (pr) localProject = { name: pr.name, style: pr.style, styleTitle: pr.styleTitle, lang: pr.lang || '', items: pr.items };
  } catch {}
  return {
    name: 'Mock',
    localProject,
    supportsFootnotes: true,
    getStoredCode: async () => stored,
    setStoredCode: async c => { stored = c; },
    async insertCitation({ payload, text, isNote }) {
      if (isNote) { doc.body.push({ text: '', cite: null }, { text: `<sup>${doc.notes.length + 1}</sup> `, cite: null }); doc.notes.push({ payload, text }); }
      else doc.body.push({ cite: { payload, text } }, { text: ' More writing. ', cite: null });
      render();
    },
    async updateCitations(isNote, compute) {
      const list = isNote ? doc.notes : doc.body.filter(s => s.cite).map(s => s.cite);
      const results = await compute(list.map(c => c.payload));
      if (results) list.forEach((c, k) => { c.text = results[k].text; });
      render();
    },
    async writeBibliography(bib) { doc.bib = bib; render(); },
  };
}
