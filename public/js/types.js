// Source types shown in the editor, mapped onto CSL types.
// `fields` are shown by default; everything else lives under "More fields".
// `important` drives the "might be missing info" warnings.

export const FIELD_DEFS = {
  title: { label: 'Title', wide: true },
  'container-title': { label: 'Container', wide: true },
  'collection-title': { label: 'Series' },
  'collection-number': { label: 'Series number' },
  publisher: { label: 'Publisher' },
  'publisher-place': { label: 'Publisher location', placeholder: 'e.g. New York' },
  issued: { label: 'Date published', kind: 'date' },
  accessed: { label: 'Date accessed', kind: 'date', today: true },
  'original-date': { label: 'Originally published', kind: 'date' },
  URL: { label: 'URL', wide: true, placeholder: 'https://' },
  DOI: { label: 'DOI', placeholder: '10.xxxx/xxxxx' },
  ISBN: { label: 'ISBN' },
  ISSN: { label: 'ISSN' },
  volume: { label: 'Volume' },
  issue: { label: 'Issue' },
  page: { label: 'Pages', placeholder: 'e.g. 12-34' },
  'number-of-pages': { label: 'Total pages' },
  edition: { label: 'Edition', placeholder: 'e.g. 2' },
  section: { label: 'Section' },
  number: { label: 'Number' },
  genre: { label: 'Description', placeholder: 'e.g. Doctoral dissertation' },
  medium: { label: 'Medium / format', placeholder: 'e.g. Podcast, Print' },
  dimensions: { label: 'Duration', placeholder: 'e.g. 12:34' },
  'event-title': { label: 'Conference / event' },
  'event-place': { label: 'Event location' },
  authority: { label: 'Court / authority' },
  version: { label: 'Version' },
  _prompt: { label: 'Your prompt (for MLA)', kind: 'textarea', wide: true },
  _receiver: { label: 'Your name (for Harvard)' },
  archive: { label: 'Archive / database' },
  archive_location: { label: 'Archive location' },
  'archive-place': { label: 'Archive / museum location', placeholder: 'e.g. New York' },
  language: { label: 'Language', placeholder: 'e.g. en' },
  'title-short': { label: 'Short title' },
  'container-title-short': { label: 'Short container title' },
  abstract: { label: 'Abstract', kind: 'textarea', wide: true },
};

const ALL_EXTRA = ['title-short', 'collection-title', 'collection-number', 'original-date', 'language', 'archive', 'archive_location', 'abstract'];

export const SOURCE_TYPES = [
  { id: 'website', label: 'Website', icon: 'globe', csl: 'webpage', container: 'Website name', fields: ['title', 'container-title', 'publisher', 'issued', 'accessed', 'URL'], important: ['title', 'container-title', 'URL', 'issued', 'author'] },
  { id: 'book', label: 'Book', icon: 'book', csl: 'book', fields: ['title', 'edition', 'volume', 'publisher', 'publisher-place', 'issued', 'ISBN', 'URL', 'DOI'], important: ['title', 'author', 'publisher', 'issued'] },
  { id: 'chapter', label: 'Book chapter', icon: 'book', csl: 'chapter', container: 'Book title', fields: ['title', 'container-title', 'edition', 'publisher', 'publisher-place', 'issued', 'page', 'ISBN', 'DOI', 'URL'], important: ['title', 'container-title', 'author', 'publisher', 'issued'] },
  { id: 'journal', label: 'Journal article', icon: 'journal', csl: 'article-journal', container: 'Journal name', fields: ['title', 'container-title', 'volume', 'issue', 'page', 'issued', 'DOI', 'URL', 'accessed'], important: ['title', 'container-title', 'author', 'issued', 'volume'] },
  { id: 'newspaper', label: 'Newspaper article', icon: 'news', csl: 'article-newspaper', container: 'Newspaper name', fields: ['title', 'container-title', 'section', 'page', 'issued', 'URL', 'accessed'], important: ['title', 'container-title', 'issued', 'author'] },
  { id: 'magazine', label: 'Magazine article', icon: 'news', csl: 'article-magazine', container: 'Magazine name', fields: ['title', 'container-title', 'volume', 'issue', 'page', 'issued', 'URL', 'accessed'], important: ['title', 'container-title', 'issued', 'author'] },
  { id: 'video', label: 'Online video', icon: 'video', csl: 'webpage', genre: 'Video', container: 'Platform', fields: ['title', 'container-title', 'issued', 'dimensions', 'URL', 'accessed'], important: ['title', 'container-title', 'URL', 'issued', 'author'] },
  { id: 'film', label: 'Film / movie', icon: 'film', csl: 'motion_picture', preset: { genre: 'Film' }, fields: ['title', 'publisher', 'issued', 'genre', 'dimensions', 'URL'], important: ['title', 'issued', 'publisher'], labels: { publisher: 'Production company', genre: 'Description (e.g. Film, Documentary)' } },
  { id: 'tv', label: 'TV / radio episode', icon: 'film', csl: 'broadcast', preset: { medium: 'TV series episode' }, container: 'Series title', fields: ['title', 'container-title', 'number', 'publisher', 'issued', 'medium', 'URL'], important: ['title', 'container-title', 'issued'], labels: { number: 'Season and episode (e.g. Season 4, Episode 5)', publisher: 'Network / broadcaster', medium: 'Description' } },
  { id: 'podcast', label: 'Podcast episode', icon: 'mic', csl: 'broadcast', preset: { medium: 'Audio podcast episode' }, container: 'Podcast name', fields: ['title', 'container-title', 'number', 'publisher', 'issued', 'dimensions', 'URL'], important: ['title', 'container-title', 'issued', 'URL'], labels: { number: 'Episode number', publisher: 'Production company / network' } },
  { id: 'ai', label: 'AI chat (ChatGPT, Copilot…)', icon: 'chat', csl: 'webpage', genre: 'Generative AI chat', container: 'AI tool or model', fields: ['title', 'container-title', 'version', 'issued', 'URL', '_prompt', '_receiver'], important: ['title', 'container-title', 'issued', 'author'],
    labels: { title: 'Chat title', 'container-title': 'Tool or model (e.g. ChatGPT, Copilot, Gemini)', version: 'Version or model (e.g. GPT-5)', issued: 'Date of the chat', URL: 'Share link to the chat' } },
  { id: 'blog', label: 'Blog post', icon: 'pen', csl: 'post-weblog', container: 'Blog name', fields: ['title', 'container-title', 'issued', 'URL', 'accessed'], important: ['title', 'container-title', 'URL', 'issued', 'author'] },
  { id: 'social', label: 'Social media post', icon: 'chat', csl: 'post', container: 'Platform', fields: ['title', 'container-title', 'issued', 'URL', 'accessed'], important: ['title', 'URL', 'issued', 'author'] },
  { id: 'encyclopedia', label: 'Encyclopedia entry', icon: 'book', csl: 'entry-encyclopedia', container: 'Encyclopedia', fields: ['title', 'container-title', 'edition', 'publisher', 'issued', 'URL', 'accessed'], important: ['title', 'container-title'] },
  { id: 'dictionary', label: 'Dictionary entry', icon: 'book', csl: 'entry-dictionary', container: 'Dictionary', fields: ['title', 'container-title', 'edition', 'publisher', 'issued', 'URL', 'accessed'], important: ['title', 'container-title'] },
  { id: 'report', label: 'Report', icon: 'doc', csl: 'report', container: 'Series', fields: ['title', 'number', 'publisher', 'publisher-place', 'issued', 'URL', 'DOI'], important: ['title', 'publisher', 'issued'] },
  { id: 'thesis', label: 'Thesis / dissertation', icon: 'grad', csl: 'thesis', fields: ['title', 'genre', 'publisher', 'publisher-place', 'issued', 'URL', 'DOI'], important: ['title', 'author', 'publisher', 'issued', 'genre'], labels: { publisher: 'University' } },
  { id: 'conference', label: 'Conference paper', icon: 'doc', csl: 'paper-conference', container: 'Proceedings title', fields: ['title', 'container-title', 'event-title', 'event-place', 'publisher', 'issued', 'page', 'DOI', 'URL'], important: ['title', 'author', 'issued'] },
  { id: 'preprint', label: 'Preprint', icon: 'doc', csl: 'article', fields: ['title', 'publisher', 'number', 'issued', 'DOI', 'URL'], important: ['title', 'author', 'issued', 'publisher'], labels: { publisher: 'Repository', number: 'Identifier' } },
  { id: 'dataset', label: 'Dataset', icon: 'data', csl: 'dataset', fields: ['title', 'version', 'publisher', 'issued', 'DOI', 'URL'], important: ['title', 'publisher', 'issued'] },
  { id: 'software', label: 'Software / app', icon: 'code', csl: 'software', fields: ['title', 'version', 'publisher', 'issued', 'URL'], important: ['title', 'issued'] },
  { id: 'image', label: 'Image / artwork', icon: 'image', csl: 'graphic', container: 'Website (if seen online)', fields: ['title', 'genre', 'medium', 'issued', 'archive', 'archive-place', 'container-title', 'URL'], important: ['title', 'issued'], labels: { genre: 'Type of work (e.g. Painting, Photograph)', medium: 'Materials (e.g. Oil on canvas)', archive: 'Museum / gallery / collection', dimensions: 'Dimensions' } },
  { id: 'song', label: 'Song / album', icon: 'music', csl: 'song', preset: { genre: 'Song' }, container: 'Album', fields: ['title', 'container-title', 'publisher', 'genre', 'issued', 'URL'], important: ['title', 'issued'], labels: { publisher: 'Record label', genre: 'Description (e.g. Song, Album)' } },
  { id: 'interview', label: 'Interview', icon: 'mic', csl: 'interview', container: 'Published in', fields: ['title', 'container-title', 'medium', 'issued', 'URL'], important: ['title', 'issued'] },
  { id: 'speech', label: 'Speech / lecture', icon: 'mic', csl: 'speech', fields: ['title', 'genre', 'event-title', 'event-place', 'issued', 'URL'], important: ['title', 'issued'] },
  { id: 'letter', label: 'Letter / email', icon: 'mail', csl: 'personal_communication', fields: ['title', 'genre', 'issued'], important: ['issued'] },
  { id: 'legislation', label: 'Legislation (Act)', icon: 'law', csl: 'legislation', container: 'Jurisdiction', fields: ['title', 'issued', 'container-title', 'number', 'URL'], important: ['title', 'issued', 'container-title'],
    labels: { title: 'Name of the Act (without the year)', issued: 'Year', 'container-title': 'Jurisdiction (e.g. Cth, NSW, Vic, UK)', number: 'Act number (optional)' } },
  { id: 'bill', label: 'Bill', icon: 'law', csl: 'bill', container: 'Jurisdiction', fields: ['title', 'issued', 'container-title', 'URL'], important: ['title', 'issued'],
    labels: { title: 'Name of the Bill (without the year)', issued: 'Year', 'container-title': 'Jurisdiction (e.g. Cth, NSW)' } },
  { id: 'case', label: 'Court case', icon: 'law', csl: 'legal_case', container: 'Law report series', fields: ['title', 'issued', 'authority', 'number', 'volume', 'container-title-short', 'container-title', 'page', 'URL'], important: ['title', 'issued'],
    labels: { title: 'Case name (e.g. Mabo v Queensland (No 2))', issued: 'Year', authority: 'Court abbreviation (e.g. HCA, NSWCA)', number: 'Judgment number (neutral citation)', volume: 'Report volume', 'container-title-short': 'Report abbreviation (e.g. CLR)', 'container-title': 'Report series (full name)', page: 'Starting page' } },
  { id: 'patent', label: 'Patent', icon: 'doc', csl: 'patent', fields: ['title', 'number', 'authority', 'issued', 'URL'], important: ['title', 'number', 'issued'] },
  { id: 'map', label: 'Map', icon: 'map', csl: 'map', fields: ['title', 'genre', 'publisher', 'publisher-place', 'issued', 'URL'], important: ['title', 'issued'] },
  { id: 'manuscript', label: 'Manuscript / archival', icon: 'doc', csl: 'manuscript', fields: ['title', 'genre', 'archive', 'archive_location', 'issued', 'URL'], important: ['title', 'archive'] },
  { id: 'document', label: 'Other document', icon: 'doc', csl: 'document', fields: ['title', 'container-title', 'publisher', 'issued', 'URL', 'accessed'], important: ['title'] },
].map(t => ({ ...t, extra: ALL_EXTRA.filter(f => !t.fields.includes(f)) }));

// Quick-pick tabs on the cite box (like MyBib)
export const CITE_TABS = [
  { id: 'website', label: 'Website', placeholder: 'Paste a link, e.g. https://www.bbc.com/news/…', kind: 'website' },
  { id: 'book', label: 'Book', placeholder: 'Search by title, author, or ISBN', kind: 'book' },
  { id: 'journal', label: 'Journal', placeholder: 'Search by title, author, or paste a DOI', kind: 'journal' },
  { id: 'video', label: 'Video', placeholder: 'Paste a YouTube, Vimeo or TED link', kind: 'video' },
  { id: 'law', label: 'Law', placeholder: 'e.g. Corporations Act 2001 (Cth), or an AustLII link', kind: 'all' },
  { id: 'all', label: 'Search all', placeholder: 'Search, or paste a link, DOI or ISBN', kind: 'all' },
];

export const ROLES = [
  ['author', 'Author'], ['editor', 'Editor'], ['translator', 'Translator'], ['director', 'Director'],
  ['performer', 'Performer'], ['producer', 'Producer'], ['composer', 'Composer'], ['interviewer', 'Interviewer'],
  ['illustrator', 'Illustrator'], ['container-author', 'Book author'], ['collection-editor', 'Series editor'],
  ['recipient', 'Recipient'], ['contributor', 'Contributor'],
];
export const ROLE_KEYS = ROLES.map(r => r[0]);

export function sourceTypeFor(item) {
  if (item.type === 'webpage' && /video/i.test(item.genre || '')) return SOURCE_TYPES.find(t => t.id === 'video');
  if (/generative ai|large language model/i.test(item.genre || '')) return SOURCE_TYPES.find(t => t.id === 'ai');
  if (item.type === 'broadcast') return SOURCE_TYPES.find(t => t.id === (/podcast/i.test(`${item.genre || ''} ${item.medium || ''}`) ? 'podcast' : 'tv'));
  if (item.type === 'bill') return SOURCE_TYPES.find(t => t.id === 'bill');
  return SOURCE_TYPES.find(t => t.csl === item.type && !t.genre) || SOURCE_TYPES.find(t => t.csl === item.type) || SOURCE_TYPES.find(t => t.id === 'document');
}

export function missingInfo(item) {
  const t = sourceTypeFor(item);
  const missing = [];
  for (const f of t.important) {
    if (f === 'author') {
      if (!ROLE_KEYS.some(r => item[r]?.length)) missing.push('author');
      continue;
    }
    const v = item[f];
    if (v == null || v === '' || (f === 'issued' && !v['date-parts']?.[0]?.[0] && !v.literal)) missing.push(f);
  }
  return missing.map(f => f === 'author' ? 'Author' : (t.labels?.[f] || (f === 'container-title' ? t.container : null) || FIELD_DEFS[f]?.label || f));
}

// Details that are present but probably incomplete — the things markers notice
const TEXTBOOK_PUBLISHERS = /pearson|cengage|mcgraw|wiley|elsevier|oxford university press|cambridge university press|sage|routledge|palgrave|macmillan|thomson|prentice|addison|jones (&|and) bartlett|lippincott|wolters|mosby|saunders|churchill|w\. ?w\. ?norton|freeman/i;
export function checkInfo(item) {
  const out = [];
  const page = String(item.page || '').trim();
  if (['article-journal', 'article-magazine', 'chapter', 'paper-conference'].includes(item.type) && /^\d+$/.test(page) && !item.number) out.push('Only the first page is listed. Add the last page.');
  if (item.type === 'book' && !item.edition && (TEXTBOOK_PUBLISHERS.test(item.publisher || '') || +item['number-of-pages'] >= 500)) out.push('Check the edition');
  if (item.title && item.title.length > 12 && item.title === item.title.toUpperCase() && /[A-Z]{4}/.test(item.title)) out.push('Title is in capitals');
  for (const n of item.author || []) if (n.family && !n.given && !n.literal) { out.push(`Add ${n.family}’s first name`); break; }
  return out;
}

// One line of advice in the editor, only where students commonly get it wrong
const TYPE_TIPS = {
  website: 'No person named? Use the organisation as author. Use the “last updated” date if there is one.',
  book: 'Only add an edition if it isn’t the first.',
  chapter: 'Chapter author as Author, book editors as Editor.',
  journal: 'Add the DOI if there is one.',
  newspaper: 'Print edition: add the page number.',
  video: 'The author is the channel that uploaded it.',
  film: 'Add the director (role: Director).',
  tv: 'Season and episode, e.g. Season 4, Episode 5.',
  podcast: 'Add the host (role: Host).',
  ai: 'Author is the company. APA uses the chat title, MLA the prompt, Harvard your name. Check your unit’s AI rules.',
  social: 'Title: the first 20 words of the post.',
  report: 'Add the report number if it has one.',
  preprint: 'If it has since been published, cite that version.',
  software: 'Add the version you used.',
  image: 'Add the museum or gallery.',
  interview: 'Your own interview: APA and Chicago cite it in-text only.',
  letter: 'APA and Chicago cite these in-text only.',
  legislation: 'Name without the year, then the year and jurisdiction (Cth, NSW).',
  bill: 'Name without the year, then the year and jurisdiction.',
  case: 'Reported: (1992) 175 CLR 1. Unreported: [1992] HCA 23.',
  manuscript: 'Add the archive and its reference number.',
};

export function tipsFor(item, styleName = '') {
  const t = sourceTypeFor(item);
  const tips = [];
  if (TYPE_TIPS[t.id]) tips.push(TYPE_TIPS[t.id]);
  return tips;
}
