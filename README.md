# citemyshi

A free, modern citation generator inspired by MyBib. Paste a link, DOI, ISBN, PubMed ID or arXiv ID (or search by title) and it pulls in the author, date, publisher and everything else. It then formats the result in APA, MLA, Chicago, Harvard, AGLC, or any of the 10,869 styles in the official CSL catalog.

**Live:** https://citemyshi.web.app

## How it's built

- **Website** (`public/`) is hosted on **Firebase Hosting**. Citations are formatted *in the browser* by a background worker running citeproc-js (`public/js/format-worker.js`), so formatting is instant and works even while the server sleeps. The 65 most-used styles for every degree and all 63 citation languages ship with the site.
- **Server** (`server/`) runs on **Render**. It reads web pages, resolves DOIs, ISBNs, PubMed, arXiv and ScienceDirect IDs, searches for books and articles, serves any of the other ~10,800 styles, and builds Word/BibTeX/RIS exports. It uses about 130MB of memory, so it fits Render's free plan.
- **Accounts and sync** use Firebase Authentication (Google) and Firestore.

## Run it locally

```bash
npm install
npm start
```

Then open http://localhost:3000. Locally, the server also serves the website.

The style catalog, bundled styles and languages are already in the repo. Run `npm run setup` to refresh them. Any other style is downloaded the first time someone picks it, then cached.

## Deploy

- **Server:** Render deploys automatically from GitHub on every push (see `render.yaml`).
- **Website:** run `firebase deploy --only hosting --project citemyshi`. Always pin `--project`, because this machine's Firebase CLI defaults to a different project.

## What it does

**Citing**
- **Websites:** reads every metadata source a page has: Google Scholar `citation_*` tags, Dublin Core, PRISM, Open Graph, Twitter cards, JSON-LD/schema.org, microdata, bylines and `<time>` tags. It strips site names from titles, removes credentials from author names ("Kris Gunnars, BSc" becomes Gunnars, K.), and tells people apart from organisations.
- **Sites with their own APIs:** YouTube and Vimeo (oEmbed), Wikipedia, arXiv, PubMed/PMC, Amazon book links (via ISBN), Google Books, and nature.com and other publisher pages (via DOI).
- **Blocked or broken pages:** it makes one honest request per page, identifying itself as citemyshi. If a site blocks automated access, it uses official sources instead: the DOI or article ID in the link (ScienceDirect, JSTOR, Springer, Wiley…) or a Crossref title lookup (ResearchGate, Academia…). If none of those work, it guesses from the link and asks you to check the details.
- **Academic sources:** DOIs go through Crossref, with DataCite/mEDRA as a fallback. ISBNs go through OpenLibrary and Google Books.
- **Search:** finds books (OpenLibrary and Google Books) and articles (Crossref), using real edition data.
- **Editor:** 31 source types, contributor roles, a live preview, warnings for missing info, and a manual entry option.

**Checking quality**
- Every citation shows where its details came from: **Verified** (DOI, ISBN, PubMed, arXiv, YouTube…), **Scanned from page**, **Guessed from link**, imported, or entered manually. Saving a scanned citation after reviewing it marks it **Checked by you**.
- **Fix all** looks up every incomplete citation again by its DOI, ISBN, PubMed ID or link and fills in only the empty fields. It never overwrites what you typed.
- **Check paper**: paste your essay and it flags in-text citations with no matching bibliography entry, and sources you never cited. It understands APA/Harvard `(Smith, 2020)`, narrative `Smith (2020)`, MLA `(Smith 23)` and numbered `[1]` styles, and runs entirely in your browser.

**Every degree**
- The style picker has tabs for Law, Medicine & Health, Nursing, Psychology, Engineering & IT, Science, Business, Education, Arts & Humanities, History, Social Sciences, Theology and Government. Each tab shows the most-used styles first, then every catalog style in that subject.
- A Universities tab lists 380 university house styles (Melbourne, Monash, Sydney, UTS, Deakin, RMIT, King's College, Imperial…).
- Typing searches all 10,869 styles and understands abbreviations (AGLC, OSCOLA, MHRA, APA7, Vancouver…).
- 63 citation languages. By default each style uses its own language, so AGLC and OSCOLA get British quotes.

**Writing your essay**
- **Saved quotes** on each source with page/paragraph numbers, copied already cited in your style (block quotes for long ones).
- **The Cite button** (a bookmark): cites the page you're looking at, read in your own browser — works on sites that block citation tools (NYT, Mayo Clinic, Medium…) and on journal pages behind your uni login.
- **Drop a PDF** onto the cite box: it's read in your browser (never uploaded) and matched by DOI, arXiv ID, ISBN or title.
- **Footnote planner**: list your citations in essay order and get every footnote right — Ibid, (n 3), short forms — or IEEE/Vancouver numbering by first citation.
- **Word and Google Docs add-ins** (see `/addins.html`): insert citations and footnotes, renumber everything with Update citations, insert the bibliography. They read a project through a private 12-character connection code.
- **Group projects**: share a project with a join link; everyone can add and edit sources, notes and quotes live. Simultaneous edits are merged per source; the owner can remove people or stop sharing (everyone keeps a copy).

**Organising**
- Projects grouped into coloured **folders**. Drag projects into folders.
- **Notes** on each citation. They also appear as annotations when you pick an "annotated bibliography" style.
- **Tags** with filter chips. Group the list by tag or source type.
- Sort by style order, date added, title, author or year. You can also filter the list as you type.
- Select several citations to copy, move or copy them to another project, tag, export or delete them. You can also drag citations onto a project in the sidebar (hold Alt to copy).
- Project-level notes, duplicate detection, and undo for deletes.

**Output**
- In-text citations (parenthetical and narrative) with page, chapter and timestamp locators.
- Copy as rich text, which keeps italics and hanging indents when pasted into Word or Google Docs.
- Export to Word (.docx), plain text, HTML, print/PDF, BibTeX, BibLaTeX, RIS and CSL-JSON.
- Import BibTeX, RIS, CSL-JSON or a list of DOIs.
- 8 citation languages, dark mode, and a phone layout.

**Saving**
- Everything is saved in your browser automatically. You can download a backup or restore one from the archive button in the sidebar.
- Optional **Google sign-in with cloud sync** (Firebase). See below.

## Cloud sync

Already set up on the `citemyshi` Firebase project: Google sign-in is enabled, the Firestore database exists, and `firestore.rules` is deployed, so each person can only read and write their own projects. `citemyshi.web.app` is authorised for sign-in automatically. If you add another domain, add it under Authentication → Settings → Authorized domains.

To change the rules, run `firebase deploy --only firestore:rules --project citemyshi`.

## Tests

- `npm test` — citation output in 9 styles and every source type, legal citations and footnotes, sentence casing, parsing, the paper checker, group-project merging.
- `npm run test:rules` — the Firestore security rules (personal data, add-in codes, group projects), checked in the Firebase emulator (needs Java).

## Optional

- `GOOGLE_BOOKS_API_KEY=...` gives more reliable book search. The anonymous Google Books quota is small, and OpenLibrary is used either way.
- `YOUTUBE_API_KEY=...` (YouTube Data API v3, free) gets exact upload dates for every YouTube video. Without it, dates come from the video page when YouTube serves it to the server.
- `PORT=8080 npm start` runs the app on a different port.
- `TRANSLATION_SERVER_URL=http://…` points at a self-hosted [Zotero translation-server](https://github.com/zotero/translation-server), used as a fallback for sites the scanner can't read well (JSTOR, IEEE, ScienceDirect…). Run it with `docker run -p 1969:1969 zotero/translation-server` and set the variable to `http://localhost:1969`.
