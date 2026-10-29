/**
 * citemyshi for Google Docs.
 * Citations are text with a hidden link (https://citemyshi.web.app/c#…) that
 * records which source and pinpoint they are, so "Update citations" can find
 * them all in order and rewrite them (Ibid, short forms, numbering).
 * @OnlyCurrentDoc
 */
var PREFIX = 'https://citemyshi.web.app/c#';
var BIB = 'citemyshi-bibliography';

function onOpen() {
  DocumentApp.getUi().createMenu('citemyshi').addItem('Open citemyshi', 'showSidebar').addToUi();
}
function onInstall() { onOpen(); }

function showSidebar() {
  DocumentApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('citemyshi'));
}

function getStoredCode() {
  return PropertiesService.getDocumentProperties().getProperty('citemyshiCode') || '';
}
function setStoredCode(code) {
  PropertiesService.getDocumentProperties().setProperty('citemyshiCode', code || '');
  return true;
}

function inFootnote_(el) {
  while (el) {
    if (el.getType() === DocumentApp.ElementType.FOOTNOTE_SECTION) return true;
    el = el.getParent();
  }
  return false;
}

// Make [start, end] (inclusive) look like normal text but carry the link
function styleRun_(text, start, end, url, italics) {
  if (end < start) return;
  var color = null;
  try { color = start > 0 ? text.getForegroundColor(start - 1) : null; } catch (e) {}
  text.setLinkUrl(start, end, url);
  text.setUnderline(start, end, false);
  text.setForegroundColor(start, end, color || '#000000');
  text.setItalic(start, end, false);
  (italics || []).forEach(function (r) {
    var s = start + r[0], e = Math.min(end, start + r[1] - 1);
    if (e >= s) text.setItalic(s, e, true);
  });
}

function insertAtCursor(args) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();
  if (!cursor) throw new Error('Click where the citation should go, then try again.');
  var inNote = inFootnote_(cursor.getElement());
  if (args.isNote && !inNote) throw new Error('Add a footnote first (Ctrl+Alt+F), then click Insert inside it.');
  var url = PREFIX + encodeURIComponent(JSON.stringify(args.payload));
  var surrounding = cursor.getSurroundingText();
  if (surrounding) {
    var off = cursor.getSurroundingTextOffset();
    var t = surrounding.editAsText();
    t.insertText(off, args.text);
    styleRun_(t, off, off + args.text.length - 1, url, args.italics);
  } else {
    var inserted = cursor.insertText(args.text);
    if (!inserted) throw new Error('Click inside a paragraph and try again.');
    styleRun_(inserted, 0, args.text.length - 1, url, args.italics);
  }
  return true;
}

// All citemyshi citations, in document order (footnotes for note styles, body otherwise)
function collect_(isNote) {
  var doc = DocumentApp.getActiveDocument();
  var found = [];
  function scan(el) {
    var type = el.getType();
    if (type === DocumentApp.ElementType.TEXT) {
      var t = el.asText();
      var idx = t.getTextAttributeIndices();
      var len = t.getText().length;
      for (var i = 0; i < idx.length; i++) {
        var url = t.getLinkUrl(idx[i]);
        if (!url || url.indexOf(PREFIX) !== 0) continue;
        var start = idx[i], end = (i + 1 < idx.length ? idx[i + 1] : len) - 1;
        var last = found[found.length - 1];
        // italics split one citation into several runs: join them back up
        if (last && last.text === t && last.url === url && last.end === start - 1) last.end = end;
        else found.push({ text: t, start: start, end: end, url: url });
      }
      return;
    }
    if (el.getNumChildren) for (var c = 0; c < el.getNumChildren(); c++) scan(el.getChild(c));
  }
  if (isNote) doc.getFootnotes().forEach(function (fn) { var s = fn.getFootnoteContents(); if (s) scan(s); });
  else scan(doc.getBody());
  return found;
}

function readCitations(isNote) {
  return collect_(isNote).map(function (c) {
    try { return JSON.parse(decodeURIComponent(c.url.slice(PREFIX.length))); } catch (e) { return { i: '', p: '' }; }
  });
}

function updateCitations(isNote, results) {
  var found = collect_(isNote);
  if (found.length !== results.length) throw new Error('The document changed. Click Update citations again.');
  // Work backwards so earlier positions in the same paragraph stay valid
  for (var k = found.length - 1; k >= 0; k--) {
    var c = found[k], r = results[k];
    // Insert the new text after the old, then remove the old: never leaves an empty element
    c.text.insertText(c.end + 1, r.text);
    c.text.deleteText(c.start, c.end);
    styleRun_(c.text, c.start, c.start + r.text.length - 1, c.url, r.italics);
  }
  return found.length;
}

function writeBibliography(args) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  doc.getNamedRanges(BIB).forEach(function (nr) {
    nr.getRange().getRangeElements().forEach(function (re) {
      var e = re.getElement();
      if (e.getType() === DocumentApp.ElementType.PARAGRAPH) {
        try { e.removeFromParent(); } catch (err) { e.asParagraph().clear(); }
      }
    });
    nr.remove();
  });
  var rb = doc.newRange();
  var h = body.appendParagraph(args.heading);
  h.setAlignment(DocumentApp.HorizontalAlignment.CENTER).setIndentStart(0).setIndentFirstLine(0);
  h.editAsText().setBold(!!args.boldHeading).setItalic(false);
  rb.addElement(h);
  args.entries.forEach(function (en) {
    var p = body.appendParagraph(en.heading || en.text);
    p.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
    var t = p.editAsText();
    t.setBold(!!en.heading).setItalic(false);
    if (!en.heading && args.hanging) { p.setIndentStart(36); p.setIndentFirstLine(0); }
    else { p.setIndentStart(0); p.setIndentFirstLine(0); }
    (en.italics || []).forEach(function (r) { if (r[1] > r[0]) t.setItalic(r[0], r[1] - 1, true); });
    rb.addElement(p);
  });
  doc.addNamedRange(BIB, rb.build());
  return true;
}
