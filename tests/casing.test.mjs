import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSentenceCase, normalizeTitleCase } from '../server/casing.js';

const CASES = [
  ['How Much Do Disasters Cost? A Comparison of Disaster Cost Estimates in Australia', 'How much do disasters cost? A comparison of disaster cost estimates in Australia'],
  ['How Green Tea Can Help You Lose Weight', 'How green tea can help you lose weight'],
  ['Attention Is All You Need', 'Attention is all you need'],
  ['The Impact of COVID-19 on Mental Health Among University Students in New South Wales', 'The impact of COVID-19 on mental health among university students in New South Wales'],
  ['Clinical Features of Patients Infected With 2019 Novel Coronavirus in Wuhan, China', 'Clinical features of patients infected with 2019 novel coronavirus in Wuhan, China'],
  ['The Effects of Social Media Use on Adolescent Wellbeing: A Systematic Review', 'The effects of social media use on adolescent wellbeing: A systematic review'],
  ['Climate Change and the Great Barrier Reef: Impacts on Coral Bleaching in Queensland', 'Climate change and the Great Barrier Reef: Impacts on coral bleaching in Queensland'],
  ['Machine Learning for iPhone Apps Using TensorFlow and PyTorch', 'Machine learning for iPhone apps using TensorFlow and PyTorch'],
  ['Indigenous Australians and the Stolen Generations', 'Indigenous Australians and the Stolen Generations'],
  ['An Introduction to the Christian Bible and God in the Middle Ages', 'An introduction to the Christian Bible and God in the Middle Ages'],
  ['Trade Policy in the United States and the European Union', 'Trade policy in the United States and the European Union'],
  ['Students at Monash University and the University of Sydney', 'Students at Monash University and the University of Sydney'],
  ['The Effect of Brexit on UK–EU Trade', 'The effect of Brexit on UK–EU trade'],
  ['Tourism in New Zealand After the Cold War', 'Tourism in New Zealand after the Cold War'],
  ['Why Gen Z Prefers TikTok Over Facebook', 'Why gen Z prefers TikTok over Facebook'],
  ['Vitamin D and Bone Health in Older Adults', 'Vitamin D and bone health in older adults'],
  ['Pride and Prejudice', 'Pride and prejudice'],
  ['Albert Einstein', 'Albert Einstein'],
  ['Already sentence case: a study of things', 'Already sentence case: a study of things'],
  ['Software 2.0', 'Software 2.0'],
];
for (const [input, want] of CASES) test(`sentence case: ${input}`, () => assert.equal(toSentenceCase(input), want));

test('legal titles and non-English titles are left alone', () => {
  assert.equal(normalizeTitleCase({ type: 'legal_case', title: 'Mabo v Queensland (No 2)' }).title, 'Mabo v Queensland (No 2)');
  assert.equal(normalizeTitleCase({ type: 'book', language: 'fr', title: 'Le Petit Prince Et Moi' }).title, 'Le Petit Prince Et Moi');
});

test('keeps the original title so it can be restored', () => {
  const r = normalizeTitleCase({ type: 'book', title: 'Pride and Prejudice' });
  assert.equal(r.title, 'Pride and prejudice');
  assert.equal(r._titleAsPublished, 'Pride and Prejudice');
});
