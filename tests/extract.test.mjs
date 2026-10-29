// What we read from web pages, checked on small pages built like the real ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromHtml } from '../server/extract.js';
import { legalFromPage } from '../server/legal.js';

const page = (head, body = '') => `<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`;

test('an organisation page is authored by the organisation (WHO, dated by its timestamp)', () => {
  const { item } = extractFromHtml(page('<title>Climate change</title><meta property="og:title" content="Climate change">',
    '<div class="sf-item-header-wrapper"><h1>Climate change</h1><span class="timestamp">12 October 2023</span></div>'), 'https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health');
  assert.deepEqual(item.author, [{ literal: 'World Health Organization' }]);
  assert.deepEqual(item.issued, { 'date-parts': [[2023, 10, 12]] });
  assert.equal(item['container-title'], 'World Health Organization');
});

test('Australian government AGLS metadata: corporate author, no junk', () => {
  const { item } = extractFromHtml(page(`<title>Inflation and its Measurement | Explainer | Education</title>
    <meta name="DCTERMS.title" content="Inflation and its Measurement | Explainer | Education">
    <meta name="DCTERMS.creator" content="scheme=AGLSTERMS.AglsAgent; corporateName=Reserve Bank of Australia; address=65 Martin Place, Sydney">
    <meta name="DCTERMS.issued" content="2018-02-13">`), 'https://www.rba.gov.au/education/resources/explainers/inflation-and-its-measurement.html');
  assert.equal(item.title, 'Inflation and its Measurement');
  assert.deepEqual(item.author, [{ literal: 'Reserve Bank of Australia' }]);
});

test('a page reviewed since it was created is dated by the review (APA 7 9.15)', () => {
  const { item } = extractFromHtml(page(`<title>Diabetes | Better Health Channel</title><meta name="dcterms.creator" content="Department of Health &amp; Human Services">
    <meta name="dcterms.created" content="1999-05-18">`, '<main><p>Diabetes is…</p><p>Reviewed on: 17-01-2023</p></main>'), 'https://www.betterhealth.vic.gov.au/health/conditionsandtreatments/diabetes');
  assert.deepEqual(item.issued, { 'date-parts': [[2023, 1, 17]] });
  assert.deepEqual(item.author, [{ literal: 'Department of Health & Human Services' }]);
  assert.equal(item['container-title'], 'Better Health Channel');
});

test('category links are not authors; bylines keep their order', () => {
  const abs = extractFromHtml(page('<title>National, state and territory population</title><meta property="og:site_name" content="Australian Bureau of Statistics">',
    '<a href="/statistics/people">Population</a><a href="/statistics/people/population">View all releases</a><a href="/people/x">Print</a>'), 'https://www.abs.gov.au/statistics/people/population/latest-release');
  assert.deepEqual(abs.item.author, [{ literal: 'Australian Bureau of Statistics' }]);
  const hbr = extractFromHtml(page('<title>What Is Disruptive Innovation?</title>',
    '<div class="hero-byline">Twenty years after the theory, we revisit what it does—and doesn’t—explain. <span>by Clayton M. Christensen, Michael E. Raynor and Rory McDonald</span></div><div class="byline-x">by Clayton M. Christensen, Michael E. Raynor and Rory McDonald</div>'), 'https://hbr.org/2015/12/what-is-disruptive-innovation');
  assert.deepEqual(hbr.item.author.map(a => a.family), ['Christensen', 'Raynor', 'McDonald']);
  assert.equal(hbr.item.type, 'article-magazine');
});

test('desk prefixes, author names in titles, news without a byline', () => {
  const abc = extractFromHtml(page('<title>Storm hits coast - ABC News</title><meta name="author" content="ABC Tropical North: Tobi Loftus"><meta property="article:published_time" content="2021-08-10T01:00:00Z">'), 'https://www.abc.net.au/news/2021-08-10/storm/100364710');
  assert.deepEqual(abc.item.author, [{ given: 'Tobi', family: 'Loftus' }]);
  assert.equal(abc.item.type, 'article-newspaper');
  const blog = extractFromHtml(page('<title>Software 2.0 - Andrej Karpathy</title><meta name="author" content="Andrej Karpathy">'), 'https://medium.com/@karpathy/software-2-0-a64152b37c35');
  assert.equal(blog.item.title, 'Software 2.0');
  assert.equal(blog.item.type, 'post-weblog');
  const news = extractFromHtml(page('<title>Markets fall | Reuters</title><meta property="og:site_name" content="Reuters"><meta name="author" content="Reuters">'), 'https://www.reuters.com/markets/fall');
  assert.equal(news.item.author, undefined); // APA: title first, not "Reuters. (n.d.). … Reuters."
});

test('AustLII titles: the reported citation, without the nickname', () => {
  const item = legalFromPage('https://www.austlii.edu.au/cgi-bin/viewdoc/au/cases/cth/HCA/1992/23.html', 'Mabo v Queensland (No 2) ("Mabo case") [1992] HCA 23; (1992) 175 CLR 1 (3 June 1992)');
  assert.equal(item.title, 'Mabo v Queensland (No 2)');
  assert.equal(item.volume, '175');
  assert.equal(item['container-title-short'], 'CLR');
});

test('the date beside the heading, not the dates of related news above it', () => {
  const { item } = extractFromHtml(page('<title>Climate change</title>',
    '<aside><div class="date"><span class="timestamp">23 October 2026</span> News release</div></aside><div class="header"><h1>Climate change</h1><span class="timestamp">12 October 2023</span></div>'), 'https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health');
  assert.deepEqual(item.issued, { 'date-parts': [[2023, 10, 12]] });
});

test('a page read by the Cite button: the browser copy is used instead of fetching', async () => {
  const { citeUrl } = await import('../server/extract.js');
  const html = page('<title>Diabetes - Symptoms and causes - Mayo Clinic</title><meta property="og:site_name" content="Mayo Clinic"><meta name="author" content="Mayo Clinic Staff"><meta property="article:published_time" content="2026-01-21">');
  const r = await citeUrl('https://www.mayoclinic.org/diseases-conditions/diabetes/symptoms-causes/syc-20371444', { html });
  assert.equal(r.source, 'Webpage');
  assert.equal(r.item.title, 'Diabetes - Symptoms and causes');
  assert.deepEqual(r.item.issued, { 'date-parts': [[2026, 1, 21]] });
});
