// Rules from the style manuals that the official CSL files leave to the writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatter, ITEMS } from './helpers.mjs';

const plain = h => h.replace(/<[^>]+>/g, '').replace(/&#38;/g, '&').replace(/&#60;/g, '<').replace(/&#62;/g, '>');
const one = async (style, item) => (await formatter.format({ items: [{ id: 'x', ...item }], style })).entries[0];
const d = (...p) => ({ 'date-parts': [p] });

test('narrative citations say "and", parentheses keep "&" (APA 8.17)', async () => {
  const e = (await formatter.format({ items: [ITEMS.two], style: 'apa' })).entries[0];
  assert.equal(plain(e.intext.paren), '(Ladds & Keating, 2017)');
  assert.equal(plain(e.intext.narrative), 'Ladds and Keating (2017)');
  const org = await one('apa', { type: 'report', title: 'Annual report', author: [{ literal: 'Johnson & Johnson' }], issued: d(2020) });
  assert.equal(plain(org.intext.narrative), 'Johnson & Johnson (2020)');
});

test('a title standing in for the author keeps its quotes or italics in narrative citations', async () => {
  const e = await one('apa', { type: 'entry-encyclopedia', title: 'Photosynthesis', 'container-title': 'Encyclopaedia Britannica', issued: d(2024) });
  assert.equal(plain(e.intext.narrative), '“Photosynthesis” (2024)');
  const w = await one('apa', { type: 'webpage', title: 'Climate change', 'container-title': 'Some site', URL: 'https://example.org' });
  assert.equal(w.intext.narrative, '<i>Climate Change</i> (n.d.)');
  const m = await one('modern-language-association', { type: 'webpage', title: 'Assessment guidelines', 'container-title': 'Monash University', issued: d(2024) });
  assert.equal(plain(m.intext.narrative), '“Assessment Guidelines”');
});

test('an organisation that is author and publisher is printed once', async () => {
  const data = { type: 'dataset', title: 'Australian rainfall observations', author: [{ literal: 'Bureau of Meteorology' }], publisher: 'Bureau of Meteorology', issued: d(2021), URL: 'http://www.bom.gov.au/climate/data' };
  assert.equal((await one('apa', data)).text, 'Bureau of Meteorology. (2021). Australian rainfall observations [Data set]. http://www.bom.gov.au/climate/data');
  // MLA 9 skips the author instead
  assert.equal((await one('modern-language-association', data)).text, '“Australian Rainfall Observations.” Bureau of Meteorology, 2021, www.bom.gov.au/climate/data.');
  // Acronyms count: AIHW is the Australian Institute of Health and Welfare
  const report = { type: 'report', title: 'Mental health of young Australians', author: [{ literal: 'Australian Institute of Health and Welfare' }], publisher: 'AIHW', issued: d(2023) };
  assert.equal((await one('apa', report)).text, 'Australian Institute of Health and Welfare. (2023). Mental health of young Australians.');
  const page = { type: 'webpage', title: 'Climate change', author: [{ literal: 'World Health Organization' }], 'container-title': 'World Health Organization', issued: d(2023, 10, 12), URL: 'https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health' };
  assert.equal((await one('apa', page)).text, 'World Health Organization. (2023, October 12). Climate change. https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health');
  assert.equal((await one('modern-language-association', page)).text, '“Climate Change.” World Health Organization, 12 Oct. 2023, www.who.int/news-room/fact-sheets/detail/climate-change-and-health.');
});

test('MLA 9: URLs without https://, DOIs as https://doi.org/, “UP” for university presses', async () => {
  const j = (await formatter.format({ items: [ITEMS.journal, ITEMS.web], style: 'modern-language-association' })).entries;
  assert.match(j.find(e => e.id === 'j').text, /https:\/\/doi\.org\/10\.1038\/nature14539\.$/);
  assert.match(j.find(e => e.id === 'w').text, /, www\.healthline\.com\//);
  const b = await one('modern-language-association', { type: 'book', title: 'The structure of scientific revolutions', author: [{ given: 'Thomas S.', family: 'Kuhn' }], publisher: 'University of Chicago Press', 'publisher-place': 'Chicago', issued: d(1962) });
  assert.equal(b.text, 'Kuhn, Thomas S. The Structure of Scientific Revolutions. U of Chicago P, 1962.');
  const o = await one('modern-language-association', { type: 'book', title: 'Pride and prejudice', author: [{ given: 'Jane', family: 'Austen' }], publisher: 'Oxford University Press', issued: d(2008) });
  assert.match(o.text, /Oxford UP, 2008\.$/);
});

test('MLA 9 leaves out media labels and article numbers', async () => {
  const v = await one('modern-language-association', { type: 'webpage', genre: 'Video', title: 'The power of vulnerability', author: [{ literal: 'TED' }], 'container-title': 'YouTube', issued: d(2011, 1, 3), URL: 'https://www.youtube.com/watch?v=iCvmsMzlF7o' });
  assert.equal(v.text, 'TED. “The Power of Vulnerability.” YouTube, 3 Jan. 2011, www.youtube.com/watch?v=iCvmsMzlF7o.');
  const f = await one('modern-language-association', { type: 'motion_picture', genre: 'Film', title: 'Parasite', director: [{ given: 'Joon-ho', family: 'Bong' }], publisher: 'CJ Entertainment', issued: d(2019) });
  assert.equal(f.text, 'Parasite. Directed by Joon-ho Bong, CJ Entertainment, 2019.');
  const plos = { type: 'article-journal', title: 'Body ownership increases the interference between observed and executed movements', author: [{ given: 'Dalila', family: 'Burin' }], editor: [{ given: 'Cosimo', family: 'Urgesi' }], 'container-title': 'PLOS ONE', volume: '14', issue: '1', page: 'e0209899', issued: d(2019, 1, 3), DOI: '10.1371/journal.pone.0209899' };
  const m = await one('modern-language-association', plos);
  assert.equal(m.text, 'Burin, Dalila. “Body Ownership Increases the Interference between Observed and Executed Movements.” PLOS ONE, vol. 14, no. 1, Jan. 2019, https://doi.org/10.1371/journal.pone.0209899.');
  // APA 7: "Article e0209899"; nobody prints the journal's handling editor
  assert.equal((await one('apa', plos)).text, 'Burin, D. (2019). Body ownership increases the interference between observed and executed movements. PLOS ONE, 14(1), Article e0209899. https://doi.org/10.1371/journal.pone.0209899');
});

test('APA 7 labels for social media posts and podcast hosts', async () => {
  const x = await one('apa', { type: 'post', title: 'We are excited to announce new findings', author: [{ literal: 'CSIRO [@CSIRO]' }], 'container-title': 'X', issued: d(2024, 2, 1), URL: 'https://x.com/CSIRO/status/1' });
  assert.match(x.text, /\[Post\]\. X\. https/);
  const fb = await one('apa', { type: 'post', title: 'Big news today', author: [{ literal: 'NASA' }], 'container-title': 'Facebook', issued: d(2024, 2, 1), URL: 'https://facebook.com/x' });
  assert.match(fb.text, /\[Status update\]\. Facebook\./);
  const pod = await one('apa', { type: 'broadcast', medium: 'Audio podcast episode', title: 'Amusement park', author: [{ given: 'Ira', family: 'Glass' }], 'container-title': 'This American Life', number: '443', publisher: 'WBEZ Chicago', issued: d(2011, 8, 12) });
  assert.equal(pod.text, 'Glass, I. (Host). (2011, August 12). Amusement park (No. 443) [Audio podcast episode]. In This American Life. WBEZ Chicago.');
});

test('APA 7 theses: university inside the brackets when published, "Unpublished" otherwise', async () => {
  const t = { type: 'thesis', title: 'Coastal erosion under changing climates', author: [{ given: 'Priya', family: 'Nair' }], genre: 'Doctoral dissertation', publisher: 'University of Melbourne', issued: d(2021) };
  assert.equal((await one('apa', { ...t, URL: 'https://minerva-access.unimelb.edu.au/items/1' })).text, 'Nair, P. (2021). Coastal erosion under changing climates [Doctoral dissertation, University of Melbourne]. https://minerva-access.unimelb.edu.au/items/1');
  assert.equal((await one('apa', t)).text, 'Nair, P. (2021). Coastal erosion under changing climates [Unpublished doctoral dissertation]. University of Melbourne.');
});

test('APA 7 Wikipedia entries: full date and the permanent link', async () => {
  const w = await one('apa', { type: 'entry-encyclopedia', title: 'Oil painting', 'container-title': 'Wikipedia', issued: d(2019, 12, 4), URL: 'https://en.wikipedia.org/wiki/Oil_painting', _permalink: 'https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398' });
  assert.equal(w.text, 'Oil painting. (2019, December 4). In Wikipedia. https://en.wikipedia.org/w/index.php?title=Oil_painting&oldid=929802398');
  const m = await one('modern-language-association', { type: 'entry-encyclopedia', title: 'Oil painting', 'container-title': 'Wikipedia', issued: d(2019, 12, 4), URL: 'https://en.wikipedia.org/wiki/Oil_painting' });
  assert.equal(m.text, '“Oil Painting.” Wikipedia, Wikimedia Foundation, 4 Dec. 2019, en.wikipedia.org/wiki/Oil_painting.');
});

test('AGLC 4: (Web Page, …), (Blog Post, …) and social media posts as written', async () => {
  const w = await one('australian-guide-to-legal-citation', ITEMS.web);
  assert.match(w.text, /\(Web Page, 12 May 2023\)/);
  const b = await one('australian-guide-to-legal-citation', { type: 'post-weblog', title: 'Software 2.0', author: [{ given: 'Andrej', family: 'Karpathy' }], 'container-title': 'Medium', issued: d(2017, 11, 11), URL: 'https://karpathy.medium.com/software-2-0' });
  assert.match(b.text, /\(Blog Post, 11 November 2017\)/);
  const x = await one('australian-guide-to-legal-citation', { type: 'post', title: 'We are excited to announce new findings', author: [{ literal: 'CSIRO' }], 'container-title': 'X', issued: d(2024, 2, 1), URL: 'https://x.com/CSIRO/status/1' });
  assert.equal(x.text, 'CSIRO, ‘We are excited to announce new findings’ (X, 1 February 2024) <https://x.com/CSIRO/status/1>');
});

test('in-text citations match the reference list: 2020a/2020b and IEEE numbers', async () => {
  const s = (id, title) => ({ id, type: 'article-journal', title, author: [{ family: 'Smith', given: 'Jane' }], 'container-title': 'Journal of Tests', issued: d(2020) });
  const items = [ITEMS.journal, ITEMS.book, s('s1', 'First study'), s('s2', 'Second study')];
  const apa = await formatter.intext({ item: items[3], items, style: 'apa', locator: '12' });
  assert.equal(apa.paren, '(Smith, 2020b, p. 12)');
  const ieee = await formatter.intext({ item: items[3], items, style: 'ieee', locator: '12' });
  assert.equal(ieee.paren, '[4, p. 12]');
});

test('a source the style cannot print never shows a processor error', async () => {
  for (const style of ['apa', 'modern-language-association', 'harvard-cite-them-right']) {
    const e = await one(style, { type: 'legal_case', number: '23', authority: 'HCA', issued: d(1992), URL: 'https://www.austlii.edu.au/x' });
    assert.doesNotMatch(`${e.text} ${e.intext.paren}`, /CSL STYLE ERROR/, style);
  }
});
