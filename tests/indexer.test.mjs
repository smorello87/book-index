import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mupdf from 'mupdf';
import { buildIndex, pageNumbering, pageVariants, addTerms } from '../public/indexer.js';
import { extractPdf } from '../public/extract.js';

const pages = (...texts) => texts.map((text, i) => ({ number: String(i + 1), text }));
const pagesFor = (result, term) => result.entries.find((e) => e.term === term)?.pages;

test('typed apostrophe matches curly apostrophe in the PDF', () => {
  const r = buildIndex(pages('You’re welcome'), "You're");
  assert.deepEqual(pagesFor(r, "You're"), ['1']);
});

test('words hyphenated across lines match both rejoined and as compounds', () => {
  const r = buildIndex(pages('the intel-\nligence report', 'a well-\nknown fact'), 'intelligence\nwell-known');
  assert.deepEqual(pagesFor(r, 'intelligence'), ['1']);
  assert.deepEqual(pagesFor(r, 'well-known'), ['2']);
});

test('soft hyphen at a line end rejoins the word', () => {
  const r = buildIndex(pages('the intel\u00AD\nligence report'), 'intelligence');
  assert.deepEqual(pagesFor(r, 'intelligence'), ['1']);
});

test('plain line breaks never glue words together (no "sand" in "Smith\'s / and")', () => {
  const r = buildIndex(pages("at Lucie-Smith's\nand the rest of\nthe group"), 'sand\nofthe');
  assert.deepEqual(r.notFound, ['sand', 'ofthe']);
});

test('ligatures and non-breaking spaces are normalized', () => {
  const r = buildIndex(pages('the ﬁnancial crisis'), 'financial crisis');
  assert.deepEqual(pagesFor(r, 'financial crisis'), ['1']);
});

test('names: reversed when "Last, First", searched as typed otherwise', () => {
  const r = buildIndex(pages('George W. Bush and Madonna'), '', 'Bush, George W.\nMadonna');
  assert.deepEqual(pagesFor(r, 'Bush, George W.'), ['1']);
  assert.deepEqual(pagesFor(r, 'Madonna'), ['1']);
});

test('footnote marker after a word still matches; substrings and longer numbers do not', () => {
  const r = buildIndex(pages('Barack Obama2 spoke. They were helping. In 19845.'), 'Obama\nhelp\n1984');
  assert.deepEqual(pagesFor(r, 'Obama'), ['1']);
  assert.deepEqual(r.notFound, ['help', '1984']);
});

test('punctuation in terms, parenthetical variants and quote stripping', () => {
  const r = buildIndex(pages('Help! she said', 'AI is here', 'deep learning'), 'Help!\nartificial intelligence (AI)\n“deep learning”');
  assert.deepEqual(pagesFor(r, 'Help!'), ['1']);
  assert.deepEqual(pagesFor(r, 'artificial intelligence (AI)'), ['2']);
  assert.deepEqual(pagesFor(r, 'deep learning'), ['3']);
});

test('the same entry in both fields is merged, not overwritten', () => {
  const entries = new Map();
  addTerms(entries, 'Smith, John', false);
  addTerms(entries, 'Smith, John', true);
  assert.deepEqual([...entries.get('Smith, John')].sort(), ['john smith', 'smith, john']);
});

test('results sort alphabetically ignoring case and accents', () => {
  const r = buildIndex(pages('zebra Éclair apple'), 'zebra\nÉclair\napple');
  assert.deepEqual(r.entries.map((e) => e.term), ['apple', 'Éclair', 'zebra']);
});

test('page numbering: offset skips front matter, labels used when meaningful', () => {
  assert.deepEqual(pageNumbering(4, null, 3), { numbers: [null, null, '1', '2'], source: 'offset' });
  assert.deepEqual(pageNumbering(3, ['i', 'ii', '1'], null).numbers, ['i', 'ii', '1']);
  assert.equal(pageNumbering(3, ['1', '2', '3'], null).source, 'physical');
  assert.equal(pageNumbering(3, null, null).source, 'physical');
  const r = buildIndex([{ number: null, text: 'apple' }, { number: '1', text: 'apple' }], 'apple');
  assert.deepEqual(pagesFor(r, 'apple'), ['1']);
});

test('pageVariants deduplicates identical forms', () => {
  assert.deepEqual(pageVariants('plain text'), ['plain text']);
});

test('end to end: fixture PDF through MuPDF', () => {
  const data = new Uint8Array(readFileSync(new URL('./fixtures/sample.pdf', import.meta.url)));
  const { texts, labels } = extractPdf(mupdf, data);
  const { numbers, source } = pageNumbering(texts.length, labels, null);
  assert.equal(source, 'labels');
  const r = buildIndex(
    texts.map((text, i) => ({ number: numbers[i], text })),
    "You're\nintelligence\nfinancial\nMüller\nFrançois\nHelp!\nartificial intelligence (AI)\nhelp\n1984\nContents",
    'Bush, George W.\nMadonna\nObama, Barack'
  );
  assert.equal(
    r.index,
    [
      '1984: 4',
      'artificial intelligence (AI): 4',
      'Bush, George W.: 2',
      'Contents: ii',
      'financial: 3',
      'François: 2',
      'help: 4',
      'Help!: 4',
      'intelligence: 1, 4',
      'Madonna: 2',
      'Müller: 2',
      'Obama, Barack: 3',
      "You're: 1",
    ].join('\n')
  );
  assert.deepEqual(r.notFound, []);
});

test('extractPdf reports password-protected and invalid files by name', () => {
  const locked = new Uint8Array(readFileSync(new URL('./fixtures/locked.pdf', import.meta.url)));
  assert.throws(() => extractPdf(mupdf, locked), { name: 'PasswordException' });
  assert.throws(() => extractPdf(mupdf, new TextEncoder().encode('not a pdf at all')), { name: 'InvalidPDFException' });
});
