// Matching logic for the Book Index Generator.
// Pure functions, no DOM or PDF code, so the browser app and the Node tests share it.

// Quotation marks stripped from the start and end of each term (never from the middle,
// so "You're" keeps its apostrophe).
const EDGE_QUOTES = /^["'`\u00B4\u2018\u2019\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB]+|["'`\u00B4\u2018\u2019\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB]+$/gu;

/**
 * Normalize text so a term typed on a keyboard matches typeset PDF text.
 * Applied identically to PDF text and to search terms.
 */
export function normalizeText(s) {
  return s
    .replace(/\u00AD/g, '') // soft hyphens
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC`\u00B4]/g, "'") // curly/typographic apostrophes
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010\u2011]/g, '-') // Unicode hyphens
    .normalize('NFKC') // ligatures (ﬁ → fi), non-breaking spaces, composed accents
    .toLowerCase();
}

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// A hyphen at the end of a line, between two letters.
const LINE_END_HYPHEN = /(\p{L})[-\u2010\u2011][^\S\n]*\n\s*(?=\p{L})/gu;

/**
 * Return the searchable forms of one page's text. A word split across lines with a
 * hyphen is searchable both rejoined ("intelligence") and as a compound ("well-known").
 */
export function pageVariants(rawText) {
  const t = rawText.replace(/\u00AD(?=[^\S\n]*\n)/g, '-'); // soft hyphen at a line end
  const forms = [t, t.replace(LINE_END_HYPHEN, '$1'), t.replace(LINE_END_HYPHEN, '$1-')];
  return [...new Set(forms.map((s) => collapse(normalizeText(s))))];
}

const escapeRegExp = (s) => s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/**
 * Regex for one search variant. A term must not run into another letter (so "help"
 * does not match "helping"), and a number must not run into another digit. A
 * footnote marker right after a word ("Obama2") still matches "Obama".
 */
export function variantRegExp(variant) {
  const first = variant[0];
  const last = variant[variant.length - 1];
  const before = /\p{L}/u.test(first) ? '(?<![\\p{L}\\p{M}])' : /\p{N}/u.test(first) ? '(?<!\\p{N})' : '';
  const after = /[\p{L}\p{M}]/u.test(last) ? '(?![\\p{L}\\p{M}])' : /\p{N}/u.test(last) ? '(?!\\p{N})' : '';
  return new RegExp(before + escapeRegExp(variant) + after, 'u');
}

const NAME_SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

/**
 * Search forms for a name typed in index order. "Obama, Barack" → "Barack Obama";
 * "King, Martin Luther, Jr." → "Martin Luther King Jr." and "Martin Luther King, Jr.";
 * a name without a comma ("Madonna") is searched as typed.
 */
export function reverseName(base) {
  const parts = base.split(',').map((p) => p.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) return [base];
  const [last, ...rest] = parts;
  if (rest.length >= 2 && NAME_SUFFIX.test(rest.at(-1))) {
    const suffix = rest.pop();
    const first = rest.join(', ');
    return [`${first} ${last} ${suffix}`, `${first} ${last}, ${suffix}`];
  }
  return [`${rest.join(', ')} ${last}`];
}

/**
 * Parse one textarea into index entries, merging into `entries` (Map display → Set of variants).
 *
 * - `term (variant1, variant2)` searches for all three.
 * - With `reverseNames`, names are reversed as described in `reverseName`.
 *   Parenthetical variants are searched as typed.
 */
export function addTerms(entries, text, reverseNames = false) {
  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trim().replace(EDGE_QUOTES, '').trim();
    if (!line) continue;

    const variants = [];
    const parens = [...line.matchAll(/\(([^)]+)\)/g)];
    for (const m of parens) variants.push(...m[1].split(','));

    const base = collapse(line.replace(/\([^)]*\)/g, ' '));
    variants.push(...(reverseNames ? reverseName(base) : [base]));

    const display = parens.length ? line : base;
    if (!display) continue;
    if (!entries.has(display)) entries.set(display, new Set());
    const set = entries.get(display);
    for (const v of variants) {
      const norm = collapse(normalizeText(v));
      if (norm) set.add(norm);
    }
  }
  return entries;
}

/**
 * Decide the page number shown for each PDF page (null = page skipped).
 *
 * @param {number} numPages
 * @param {string[]|null} labels  page labels embedded in the PDF, if any
 * @param {number|null} bookPageOneAt  physical PDF page that is book page 1 (user override)
 * @returns {{numbers: (string|null)[], source: 'offset'|'labels'|'physical'}}
 */
export function pageNumbering(numPages, labels = null, bookPageOneAt = null) {
  const start = Number.parseInt(bookPageOneAt, 10);
  if (Number.isInteger(start) && start >= 1) {
    // Any value the user typed wins over the PDF's labels; 1 means plain physical pages.
    const numbers = Array.from({ length: numPages }, (_, i) => (i + 1 < start ? null : String(i + 2 - start)));
    return { numbers, source: 'offset' };
  }
  const usable =
    Array.isArray(labels) &&
    labels.length === numPages &&
    labels.some((l, i) => l && String(l).trim() !== String(i + 1));
  if (usable) {
    return { numbers: labels.map((l, i) => (l && String(l).trim()) || String(i + 1)), source: 'labels' };
  }
  return { numbers: Array.from({ length: numPages }, (_, i) => String(i + 1)), source: 'physical' };
}

/**
 * Build the index.
 *
 * @param {{number: string|null, text: string}[]} pages  in document order; number null = skip
 * @returns {{index: string, entries: {term: string, pages: string[]}[], notFound: string[]}}
 */
export function buildIndex(pages, termsText, namesText = '') {
  const entries = new Map();
  addTerms(entries, termsText, false);
  addTerms(entries, namesText, true);

  const matchers = [...entries]
    .filter(([, variants]) => variants.size)
    .map(([term, variants]) => ({
      term,
      variants: [...variants].map((text) => ({ text, re: variantRegExp(text) })),
      pages: [],
      seen: new Set(),
    }));

  for (const page of pages) {
    if (page.number == null) continue;
    const forms = pageVariants(page.text);
    for (const m of matchers) {
      if (m.seen.has(page.number)) continue;
      // The substring check is fast and rules out most pages before the regex runs.
      if (m.variants.some((v) => forms.some((f) => f.includes(v.text) && v.re.test(f)))) {
        m.seen.add(page.number);
        m.pages.push(page.number);
      }
    }
  }

  const found = matchers.filter((m) => m.pages.length).map((m) => ({ ...m, key: sortKey(m.term) }));
  found.sort((a, b) => COLLATOR.compare(a.key, b.key) || COLLATOR.compare(a.term, b.term) || (a.term < b.term ? -1 : 1));
  const notFound = matchers.filter((m) => !m.pages.length).map((m) => m.term);

  return {
    index: found.map((m) => `${m.term}: ${m.pages.join(', ')}`).join('\n'),
    entries: found.map((m) => ({ term: m.term, pages: m.pages, letter: letterFor(m.key) })),
    notFound,
  };
}

// --- Alphabetical order and letter groups, from one shared key ---

// Letters that Unicode does not decompose into a base letter plus an accent.
const FOLD = { ł: 'l', ø: 'o', æ: 'ae', œ: 'oe', đ: 'd', ð: 'd', þ: 'th', ß: 'ss', ı: 'i' };
// A fixed locale, so the order doesn't change with the visitor's browser language.
const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Key an index sorts on: case, accents and leading punctuation ignored ("#MeToo" files under M). */
export function sortKey(term) {
  return normalizeText(term)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łøæœđðþßı]/g, (c) => FOLD[c])
    .replace(/^[^\p{L}\p{N}]+/u, '');
}

/** Letter group for a sort key: its first letter, or "0–9" for numbers and symbols. */
export function letterFor(key) {
  const first = key.charAt(0);
  return /\p{L}/u.test(first) ? first.toUpperCase() : '0–9';
}
