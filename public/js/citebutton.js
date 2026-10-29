// The "Cite this page" button (a bookmarklet). Some sites block servers from
// reading them, and journals hide details behind logins — but the student's
// own browser can see the page. The button copies the page's metadata (head
// tags, JSON-LD, the byline and date area) and hands it to citemyshi.
import { $, esc, openModal, copyRich, toast } from './ui.js';
import { icon } from './icons.js';

// Runs on the page the student is reading. Must be self-contained: it is
// turned into a javascript: link with Function#toString.
function grabPage(app) {
  const esc = s => String(s).replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'));
  const head = document.head ? document.head.cloneNode(true) : document.createElement('head');
  head.querySelectorAll('script:not([type="application/ld+json"]),style,noscript,template,link:not([rel="canonical"])').forEach(e => e.remove());
  head.querySelectorAll('script').forEach(e => { if (e.textContent.length > 60000) e.remove(); });
  // The parts of the body that say who wrote it and when — starting with the
  // block around the main heading, which holds the page's own byline and date
  const parts = [], seen = [];
  const h1 = document.querySelector('main h1, article h1, h1');
  if (h1) {
    let box = h1;
    for (let i = 0; i < 4 && box.parentElement && box.parentElement !== document.body && box.parentElement.outerHTML.length < 12000; i++) box = box.parentElement;
    const c = box.cloneNode(true);
    c.querySelectorAll('script,style,svg,img,picture,video,iframe,button,nav').forEach(x => x.remove());
    parts.push(c.outerHTML);
    seen.push(box);
  }
  document.querySelectorAll('h1,time,[rel="author"],[itemprop="author"],[itemprop="datePublished"],[itemprop="dateModified"],[class*="byline" i],[class*="author" i],[class*="date" i],[class*="timestamp" i],[class*="updated" i],[class*="publish" i],body script[type="application/ld+json"]').forEach(e => {
    if (parts.length > 80 || seen.some(s => s.contains(e))) return;
    seen.push(e);
    const c = e.cloneNode(true);
    c.querySelectorAll('script:not([type="application/ld+json"]),style,svg,img,picture,video,iframe,button,nav').forEach(x => x.remove());
    const h = c.outerHTML;
    if (h.length < (e.tagName === 'SCRIPT' ? 60000 : 5000)) parts.push(h);
  });
  // The top of the page as read: bylines like "Updated on 19 October 2026" sit outside <main> on many sites
  const text = ((document.body && document.body.innerText) || '').slice(0, 12000);
  let html = `<!doctype html><html lang="${esc(document.documentElement.lang || '')}">${head.outerHTML}<body>${parts.join('\n')}<main><p>${esc(text)}</p></main></body></html>`;
  if (html.length > 900000) html = html.slice(0, 900000);
  // A small copy travels in the link itself, for sites that cut the connection between windows
  const small = `<!doctype html><html lang="${esc(document.documentElement.lang || '')}"><head>${[...head.querySelectorAll('title,meta,link[rel="canonical"]')].map(e => e.outerHTML).join('').slice(0, 12000)}</head><body>${parts.filter(p => !/^<script/.test(p)).slice(0, 12).join('').slice(0, 6000)}</body></html>`;
  const w = window.open(`${app}/?cite-page=1#${encodeURIComponent(JSON.stringify({ url: location.href, html: small }))}`, '_blank');
  if (!w) { alert('Allow pop-ups for this site, then try again.'); return; }
  const msg = { type: 'citemyshi-page', url: location.href, html };
  let n = 0;
  const t = setInterval(() => { try { w.postMessage(msg, app); } catch (e) { /* not ready yet */ } if (++n > 80) clearInterval(t); }, 250);
  window.addEventListener('message', e => { if (e.origin === app && e.data === 'citemyshi-got-page') clearInterval(t); });
}

const APP = location.origin;
export const BOOKMARKLET = `javascript:${encodeURIComponent(`(${grabPage.toString()})(${JSON.stringify(APP)})`)}`;

// citemyshi opened by the button: take the page (full copy by message, small copy from the link)
export function listenForPage(onPage) {
  if (!new URLSearchParams(location.search).has('cite-page')) return;
  let fromLink = null;
  try { fromLink = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch {}
  history.replaceState(null, '', location.pathname);
  let done = false;
  const finish = page => {
    if (done || !page || typeof page.url !== 'string' || typeof page.html !== 'string' || !/^https?:\/\//.test(page.url)) return;
    done = true;
    removeEventListener('message', onMessage);
    onPage({ url: page.url, html: page.html });
  };
  function onMessage(e) {
    if (e.data?.type !== 'citemyshi-page') return;
    try { e.source?.postMessage('citemyshi-got-page', e.origin); } catch {}
    finish(e.data);
  }
  addEventListener('message', onMessage);
  setTimeout(() => finish(fromLink), 2500);
}

export function openCiteButton() {
  const m = openModal({
    title: 'The Cite button',
    body: `
      <p style="margin:0 0 12px;color:var(--text-2)">Cites the page you’re on. Works on sites that block citation tools and on journal pages behind your uni login.</p>
      <div class="cite-button-row" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:16px 0">
        <a class="btn btn-primary" href="${esc(BOOKMARKLET)}" data-bookmarklet draggable="true" style="text-decoration:none">${icon('quote')} Cite with citemyshi</a>
        <span style="color:var(--muted);font-size:13px">← drag to your bookmarks bar</span>
      </div>
      <ol style="padding-left:20px;margin:0 0 12px;color:var(--text-2);font-size:14px">
        <li>Show the bookmarks bar: <span class="kbd">Ctrl/⌘ + Shift + B</span></li>
        <li>Drag the button onto it</li>
        <li>Click it on any page you want to cite</li>
      </ol>
      <details style="font-size:13px;color:var(--text-2)"><summary style="cursor:pointer">On a phone or iPad</summary>
        <p>Bookmark any page, then edit the bookmark and replace its address with this code.</p>
        <button class="btn btn-sm" data-copy-code>${icon('copy')} Copy the code</button>
      </details>`,
    foot: '<span class="spacer"></span><button class="btn" data-done>Done</button>',
  });
  $('[data-bookmarklet]', m.el).onclick = e => { e.preventDefault(); toast('Drag it to your bookmarks bar'); };
  $('[data-copy-code]', m.el).onclick = async () => { await copyRich(esc(BOOKMARKLET), BOOKMARKLET); toast('Code copied'); };
  $('[data-done]', m.el).onclick = () => m.close();
}
