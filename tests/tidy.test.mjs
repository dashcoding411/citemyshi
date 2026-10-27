// Cleaning up what databases send us, before it reaches a reference list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidyItem, tidyEdition, tidyPublisher, tidyPlace, capitaliseSubtitle, tidyNames } from '../server/tidy.js';
import { crossrefToCsl } from '../server/lookup.js';
import { toSentenceCase } from '../server/casing.js';

test('editions: just the number, or the words plus "ed."', () => {
  const cases = { 'Eleventh edition': '11', 'Eighth Edition': '8', '3rd ed.': '3', 'Edition 2': '2', '4. Aufl.': '4', '1st ed.': undefined, 'Revised edition': 'Rev. ed.',
    'Global edition': 'Global ed.', '20th Anniversary Edition': '20th anniversary ed.', 'Tanner introduction (3)': undefined, 'Reprint 2005': undefined, 'Penguin Classics': undefined };
  for (const [raw, want] of Object.entries(cases)) assert.equal(tidyEdition(raw), want, raw);
});

test('publishers lose business designations (APA 9.29, MLA, Chicago)', () => {
  const cases = { 'Pearson Education, Inc.': 'Pearson Education', 'SAGE Publications Ltd': 'SAGE Publications', 'Elsevier BV': 'Elsevier', 'Allen & Unwin Pty Ltd': 'Allen & Unwin',
    'American Psychological Association (APA)': 'American Psychological Association', 'John Wiley & Sons': 'John Wiley & Sons', 'Springer Science and Business Media LLC': 'Springer Science and Business Media' };
  for (const [raw, want] of Object.entries(cases)) assert.equal(tidyPublisher(raw), want);
});

test('a postal address becomes the city', () => {
  assert.equal(tidyPlace("1 Oliver's Yard, 55 City Road, London EC1Y 1SP United Kingdom "), 'London');
  assert.equal(tidyPlace('Thousand Oaks, California 91320'), 'Thousand Oaks');
  assert.equal(tidyPlace('New Haven'), 'New Haven');
});

test('subtitles start with a capital; trailing full stops go', () => {
  assert.equal(capitaliseSubtitle('Context and contact: a comparison of patient and family engagement'), 'Context and contact: A comparison of patient and family engagement');
  assert.equal(capitaliseSubtitle('Effect of X: mRNA vaccines'), 'Effect of X: mRNA vaccines');
  const t = tidyItem({ type: 'article-journal', title: 'Emotions in storybooks: A comparison of storybooks that represent ethnic and racial groups in the United States.' });
  assert.equal(t.title, 'Emotions in storybooks: A comparison of storybooks that represent ethnic and racial groups in the United States');
  assert.equal(tidyItem({ type: 'book', title: 'Living in the U.S.' }).title, 'Living in the U.S.');
});

test('names in capitals or lowercase, duplicates and junk', () => {
  const n = tidyNames([{ family: 'COULARDEAU', given: 'JACQUES' }, { family: 'MCDONALD', given: 'J. S.' }, { family: 'smith', given: 'jane' }, { family: 'Smith', given: 'Jane' }, { literal: 'View all' }, { literal: 'scheme=AGLSTERMS.AglsAgent; corporateName=X' }]);
  assert.deepEqual(n, [{ family: 'Coulardeau', given: 'Jacques' }, { family: 'McDonald', given: 'J. S.' }, { family: 'Smith', given: 'Jane' }]);
});

test('Crossref: article numbers, book series, handling editors, Cochrane reviews', () => {
  const plos = crossrefToCsl({ type: 'journal-article', DOI: '10.1371/journal.pone.0209899', title: ['Body ownership'], 'container-title': ['PLOS ONE'], page: 'e0209899', volume: '14', issue: '1', editor: [{ given: 'Cosimo', family: 'Urgesi' }], issued: { 'date-parts': [[2019, 1, 3]] } });
  assert.equal(plos.number, 'e0209899');
  assert.equal(plos.page, undefined);
  assert.equal(plos.editor, undefined);
  const mdpi = crossrefToCsl({ type: 'journal-article', DOI: '10.3390/ijerph17051729', title: ['X'], 'container-title': ['IJERPH'], page: '1729', issued: { 'date-parts': [[2020]] } });
  assert.equal(mdpi.number, '1729');
  const jstor = crossrefToCsl({ type: 'journal-article', DOI: '10.2307/1914185', title: ['Prospect theory'], 'container-title': ['Econometrica'], page: '263', issued: { 'date-parts': [[1979]] } });
  assert.equal(jstor.page, '263');
  const lncs = crossrefToCsl({ type: 'book-chapter', DOI: '10.1007/978-3-030-58452-8_13', title: ['End-to-end object detection with transformers'], 'container-title': ['Lecture Notes in Computer Science', 'Computer Vision – ECCV 2020'], issued: { 'date-parts': [[2020]] } });
  assert.equal(lncs['container-title'], 'Computer Vision – ECCV 2020');
  assert.equal(lncs['collection-title'], 'Lecture Notes in Computer Science');
  const cochrane = crossrefToCsl({ type: 'journal-article', DOI: '10.1002/14651858.CD001871.pub3', title: ['Interventions for preventing obesity in children'], 'container-title': ['Cochrane Database of Systematic Reviews'], issued: { 'date-parts': [[2011, 12, 7]] } });
  assert.equal(cochrane.number, 'CD001871');
  assert.equal(cochrane.issue, '12');
});

test('sentence case keeps people and regions', () => {
  const cases = {
    'The Pen Is Mightier Than the Keyboard: Advantages of Longhand Over Laptop Note Taking': 'The pen is mightier than the keyboard: Advantages of longhand over laptop note taking',
    'The Power of Vulnerability | Brené Brown | TED': 'The power of vulnerability | Brené Brown | TED',
    'Theresa May Resigns as Prime Minister of the United Kingdom': 'Theresa May resigns as prime minister of the United Kingdom',
    'Gordon Brown and the Global Financial Crisis': 'Gordon Brown and the global financial crisis',
    'Arab Gulf States and the West': 'Arab Gulf States and the West',
    'The Great Gatsby': 'The great Gatsby',
    'The Great Barrier Reef Is Dying': 'The Great Barrier Reef is dying',
    'Mark Zuckerberg Testifies Before Congress': 'Mark Zuckerberg testifies before Congress',
    'Europe Will Face a Hotter Future': 'Europe will face a hotter future',
    'Australia Day and Its Critics': 'Australia Day and its critics',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(toSentenceCase(t), want);
});
