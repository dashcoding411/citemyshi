# citemyshi

A free, modern citation generator inspired by MyBib. Paste a link, DOI, ISBN, PubMed ID or arXiv ID (or search by title) and it pulls in the author, date, publisher and everything else. It then formats the result in APA, MLA, Chicago, Harvard, or any of 10,000+ other styles.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000.

The style catalog and popular styles are already in `data/`. Run `npm run setup` to refresh them. Any other style is downloaded the first time you pick it, then cached.

## What it does

**Citing**
- **Websites:** reads every metadata source a page has: Google Scholar `citation_*` tags, Dublin Core, PRISM, Open Graph, Twitter cards, JSON-LD/schema.org, microdata, bylines and `<time>` tags. It strips site names from titles, removes credentials from author names ("Kris Gunnars, BSc" becomes Gunnars, K.), and tells people apart from organisations.
- **Sites with their own APIs:** YouTube and Vimeo (oEmbed), Wikipedia, arXiv, PubMed/PMC, Amazon book links (via ISBN), Google Books, and nature.com and other publisher pages (via DOI).
- **Blocked or broken pages:** if a site blocks bots, it retries as a link-preview crawler. If that also fails, it guesses from the URL and tells you to check the details.
- **Academic sources:** DOIs go through Crossref, with DataCite/mEDRA as a fallback. ISBNs go through OpenLibrary and Google Books.
- **Search:** finds books (OpenLibrary and Google Books) and articles (Crossref), using real edition data.
- **Editor:** 31 source types, contributor roles, a live preview, warnings for missing info, and a manual entry option.

**Checking quality**
- Every citation shows where its details came from: **Verified** (DOI, ISBN, PubMed, arXiv, YouTube…), **Scanned from page**, **Guessed from link**, imported, or entered manually. Saving a scanned citation after reviewing it marks it **Checked by you**.
- **Fix all** looks up every incomplete citation again by its DOI, ISBN, PubMed ID or link and fills in only the empty fields. It never overwrites what you typed.
- **Check paper**: paste your essay and it flags in-text citations with no matching bibliography entry, and sources you never cited. It understands APA/Harvard `(Smith, 2020)`, narrative `Smith (2020)`, MLA `(Smith 23)` and numbered `[1]` styles, and runs entirely in your browser.

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

## Turning on cloud sync (one-time Firebase setup)

The app already has the Firebase config in `public/js/firebase-config.js`. In the [Firebase console](https://console.firebase.google.com/project/citemyshi):

1. **Authentication** → Get started → Sign-in method → **Google** → Enable → Save.
2. **Firestore Database** → Create database (production mode, any region).
3. Firestore → **Rules** → paste the contents of [`firestore.rules`](firestore.rules) → Publish.

Then click **Sign in to sync** in the bottom-left of the app. Your local projects merge with your account and stay in sync live across devices.

If you host the app on another domain, add that domain under Authentication → Settings → Authorized domains.

## Optional

- `GOOGLE_BOOKS_API_KEY=... npm start` gives more reliable book search. The anonymous Google Books quota is small, and OpenLibrary is used either way.
- `PORT=8080 npm start` runs the app on a different port.
- `TRANSLATION_SERVER_URL=http://…` points at a self-hosted [Zotero translation-server](https://github.com/zotero/translation-server), used as a fallback for sites the scanner can't read well (JSTOR, IEEE, ScienceDirect…). Run it with `docker run -p 1969:1969 zotero/translation-server` and set the variable to `http://localhost:1969`.
