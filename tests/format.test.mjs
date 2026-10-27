// Exact output for the styles students use most, checked against each manual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from './helpers.mjs';

const text = async (style, key) => (await render(style, [key]))[{ journal: 'j', book: 'b', web: 'w', two: 't' }[key]];

const CASES = {
  apa: {
    journal: ['LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539', '(LeCun et al., 2015)', 'LeCun et al. (2015)'],
    book: ['Austen, J. (2003). Pride and prejudice. Penguin Books.', '(Austen, 2003)', 'Austen (2003)'],
    web: ['Gunnars, K. (2023, May 12). How green tea can help you lose weight. Healthline. https://www.healthline.com/nutrition/green-tea-and-weight-loss', '(Gunnars, 2023)'],
    two: ['Ladds, M., & Keating, A. (2017). How much do disasters cost? A comparison of disaster cost estimates in Australia. International Journal of Disaster Risk Reduction, 21, 419–429. https://doi.org/10.1016/j.ijdrr.2017.01.004', '(Ladds & Keating, 2017)', 'Ladds and Keating (2017)'],
  },
  'modern-language-association': {
    journal: ['LeCun, Yann, et al. “Deep Learning.” Nature, vol. 521, no. 7553, May 2015, pp. 436–44, https://doi.org/10.1038/nature14539.', '(LeCun et al.)'],
    book: ['Austen, Jane. Pride and Prejudice. Penguin Books, 2003.', '(Austen)'],
    web: ['Gunnars, Kris. “How Green Tea Can Help You Lose Weight.” Healthline, 12 May 2023, www.healthline.com/nutrition/green-tea-and-weight-loss.'],
  },
  'chicago-author-date': {
    journal: ['LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. “Deep Learning.” Nature 521 (7553): 436–44. https://doi.org/10.1038/nature14539.', '(LeCun et al. 2015)'],
    book: ['Austen, Jane. 2003. Pride and Prejudice. Penguin Books.', '(Austen 2003)'],
  },
  'chicago-notes-bibliography': {
    journal: ['LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. “Deep Learning.” Nature 521, no. 7553 (2015): 436–44. https://doi.org/10.1038/nature14539.', 'Yann LeCun et al., “Deep Learning,” Nature 521, no. 7553 (2015): 436–44, https://doi.org/10.1038/nature14539.'],
  },
  'harvard-cite-them-right': {
    journal: ['LeCun, Y., Bengio, Y. and Hinton, G. (2015) ‘Deep learning’, Nature, 521(7553), pp. 436–444. Available at: https://doi.org/10.1038/nature14539.', '(LeCun, Bengio and Hinton, 2015)'],
    book: ['Austen, J. (2003) Pride and prejudice. London: Penguin Books.', '(Austen, 2003)'],
    web: ['Gunnars, K. (2023) How green tea can help you lose weight, Healthline. Available at: https://www.healthline.com/nutrition/green-tea-and-weight-loss (Accessed: 26 October 2026).'],
  },
  'australian-guide-to-legal-citation': {
    journal: ['LeCun, Yann, Yoshua Bengio and Geoffrey Hinton, ‘Deep Learning’ (2015) 521(7553) Nature 436'],
    book: ['Austen, Jane, Pride and Prejudice (Penguin Books, 2003)', 'Jane Austen, Pride and Prejudice (Penguin Books, 2003).'],
    web: ['Gunnars, Kris, ‘How Green Tea Can Help You Lose Weight’, Healthline (Web Page, 12 May 2023) <https://www.healthline.com/nutrition/green-tea-and-weight-loss>'],
  },
  ieee: {
    journal: ['[1] Y. LeCun, Y. Bengio, and G. Hinton, “Deep learning,” Nature, vol. 521, no. 7553, pp. 436–444, May 2015, doi: 10.1038/nature14539.', '[1]'],
    book: ['[1] J. Austen, Pride and Prejudice. London: Penguin Books, 2003.'],
  },
  'nlm-citation-sequence': {
    journal: ['1. LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015 May 28;521(7553):436–44. doi:10.1038/nature14539'],
    book: ['1. Austen J. Pride and prejudice. London: Penguin Books; 2003.'],
  },
  'american-medical-association': {
    journal: ['1. LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-444. doi:10.1038/nature14539'],
  },
};

const plain = h => h.replace(/<[^>]+>/g, '').replace(/&#38;/g, '&').replace(/&#60;/g, '<').replace(/&#62;/g, '>');

for (const [style, cases] of Object.entries(CASES)) {
  for (const [key, [bib, paren, narrative]] of Object.entries(cases)) {
    test(`${style} · ${key}`, async () => {
      const e = await text(style, key);
      assert.equal(e.text, bib);
      if (paren) assert.equal(plain(e.intext.paren), paren);
      if (narrative) assert.equal(plain(e.intext.narrative), narrative);
    });
  }
}

test('APA italicises the journal name and volume', async () => {
  const e = await text('apa', 'journal');
  assert.match(e.html, /<i>Nature<\/i>, <i>521<\/i>\(7553\)/);
});

test('annotated styles print the note as the annotation', async () => {
  const { formatter } = await import('./helpers.mjs');
  const r = await formatter.format({ items: [{ id: 'a', type: 'book', title: 'Pride and prejudice', author: [{ given: 'Jane', family: 'Austen' }], publisher: 'Penguin', issued: { 'date-parts': [[2003]] }, _note: 'A novel about manners.' }], style: 'apa-annotated-bibliography' });
  assert.match(r.entries[0].text, /A novel about manners\./);
});

test('AGLC pinpoint footnote', async () => {
  const { formatter, ITEMS } = await import('./helpers.mjs');
  const r = await formatter.intext({ item: ITEMS.two, style: 'australian-guide-to-legal-citation', locator: '421' });
  assert.match(plain(r.paren), /\(2017\) 21 International Journal of Disaster Risk Reduction 419, 421/);
});

test('APA page locator', async () => {
  const { formatter, ITEMS } = await import('./helpers.mjs');
  const r = await formatter.intext({ item: ITEMS.journal, style: 'apa', locator: '437' });
  assert.equal(plain(r.paren), '(LeCun et al., 2015, p. 437)');
  assert.equal(plain(r.narrative), 'LeCun et al. (2015, p. 437)');
});

test('a style not bundled with the site is fetched and formats', async () => {
  const { formatter, ITEMS } = await import('./helpers.mjs');
  const r = await formatter.format({ items: [ITEMS.book], style: 'harvard-the-university-of-melbourne' });
  assert.equal(r.entries[0].text, 'Austen J (2003) Pride and prejudice, Penguin Books, London.');
});
