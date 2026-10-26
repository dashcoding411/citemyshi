// Word (Office.js). Citations are hidden content controls tagged with the
// source id and pinpoint, so "Update citations" can find and rewrite them in
// document order. Footnotes need WordApi 1.5 (Microsoft 365 / Word 2021+).
const TAG = 'cms|';
const BIB_TAG = 'citemyshi-bibliography';
const enc = p => TAG + encodeURIComponent(JSON.stringify(p));
const dec = t => { try { return JSON.parse(decodeURIComponent(t.slice(TAG.length))); } catch { return null; } };

async function italicise(ctx, target, text, italics) {
  // Search inside the citation for each italic span (search is limited to 255 chars)
  const hits = italics.map(([s, e]) => text.slice(s, e).trim()).filter(seg => seg && seg.length <= 255)
    .map(seg => { const r = target.search(seg, { matchCase: true }); r.load('items'); return r; });
  await ctx.sync();
  for (const r of hits) if (r.items[0]) r.items[0].font.italic = true;
}

export async function createHost() {
  await new Promise(resolve => Office.onReady(resolve));
  const footnotes = Office.context.requirements.isSetSupported('WordApi', '1.5');
  return {
    name: 'Word',
    supportsFootnotes: footnotes,
    getStoredCode: async () => Office.context.document.settings.get('citemyshiCode') || '',
    setStoredCode: code => new Promise(resolve => { Office.context.document.settings.set('citemyshiCode', code); Office.context.document.settings.saveAsync(() => resolve()); }),

    async insertCitation({ payload, text, italics, isNote }) {
      await Word.run(async ctx => {
        const sel = ctx.document.getSelection();
        let inserted;
        if (isNote && footnotes) {
          const note = sel.insertFootnote('');
          inserted = note.body.getRange('Start').insertText(text, 'Start');
        } else {
          inserted = sel.getRange('End').insertText(text, 'After'); // exactly at the cursor, like other citation tools
        }
        const cc = inserted.insertContentControl();
        cc.tag = enc(payload);
        cc.title = 'citemyshi citation';
        cc.appearance = 'Hidden';
        cc.font.italic = false;
        await ctx.sync();
        await italicise(ctx, cc, text, italics);
        await ctx.sync();
      });
    },

    // compute(payloads) -> [{ text, italics }] in the same order (or null to only read)
    async updateCitations(isNote, compute) {
      await Word.run(async ctx => {
        let controls = [];
        if (isNote && footnotes) {
          const notes = ctx.document.body.footnotes;
          notes.load('items');
          await ctx.sync();
          const perNote = notes.items.map(n => { const c = n.body.contentControls; c.load('items/tag'); return c; });
          await ctx.sync();
          controls = perNote.flatMap(c => c.items);
        } else {
          const c = ctx.document.body.contentControls;
          c.load('items/tag');
          await ctx.sync();
          controls = c.items;
        }
        const ours = controls.filter(cc => cc.tag?.startsWith(TAG));
        const results = await compute(ours.map(cc => dec(cc.tag)).map(p => p || { i: '', p: '' }));
        if (!results) return;
        ours.forEach((cc, k) => { cc.insertText(results[k].text, 'Replace'); cc.font.italic = false; });
        await ctx.sync();
        for (let k = 0; k < ours.length; k++) await italicise(ctx, ours[k], results[k].text, results[k].italics);
        await ctx.sync();
      });
    },

    async writeBibliography({ heading, entries, hanging, boldHeading }) {
      await Word.run(async ctx => {
        const existing = ctx.document.contentControls.getByTag(BIB_TAG);
        existing.load('items');
        await ctx.sync();
        let cc;
        if (existing.items.length) { cc = existing.items[0]; cc.clear(); }
        else {
          const para = ctx.document.body.insertParagraph('', 'End');
          cc = para.insertContentControl();
          cc.tag = BIB_TAG;
          cc.title = 'Bibliography (citemyshi)';
        }
        await ctx.sync();
        const first = cc.paragraphs.getFirst();
        first.insertText(heading, 'Replace');
        first.alignment = 'Centered';
        first.font.bold = boldHeading;
        first.font.italic = false;
        first.leftIndent = 0; first.firstLineIndent = 0;
        const paras = [];
        for (const e of entries) {
          const para = cc.insertParagraph(e.heading || e.text, 'End');
          para.alignment = 'Left';
          para.font.bold = !!e.heading;
          para.font.italic = false;
          para.leftIndent = !e.heading && hanging ? 36 : 0;
          para.firstLineIndent = !e.heading && hanging ? -36 : 0;
          paras.push([para, e]);
        }
        await ctx.sync();
        for (const [para, e] of paras) if (!e.heading && e.italics?.length) await italicise(ctx, para, e.text, e.italics);
        await ctx.sync();
      });
    },
  };
}
