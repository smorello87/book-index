"""Flask version of the Book Index Generator (legacy; the live app is the static site in public/).

The matching rules mirror public/indexer.js so both versions produce the same index.
"""
import logging
import re
import unicodedata

import pymupdf
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

QUOTES = '\u0022\u0027\u0060\u00B4\u2018\u2019\u201C\u201D\u201E\u201F\u2039\u203A\u00AB\u00BB'
EDGE_QUOTES = re.compile(f'^[{QUOTES}]+|[{QUOTES}]+$')
LETTER = r'[^\W\d_]'
LINE_END_HYPHEN = re.compile(rf'({LETTER})[-\u2010\u2011][^\S\n]*\n\s*(?={LETTER})')
SOFT_HYPHEN_AT_EOL = re.compile(r'\u00AD(?=[^\S\n]*\n)')
_TRANSLATE = str.maketrans({
    '\u00AD': None,  # soft hyphen
    **{c: "'" for c in '\u2018\u2019\u201A\u201B\u2032\u02BC\u0060\u00B4'},
    **{c: '"' for c in '\u201C\u201D\u201E\u201F\u2033'},
    '\u2010': '-', '\u2011': '-',
})


def normalize_text(s):
    """Normalize apostrophes, hyphens, ligatures and case so typed terms match typeset text."""
    return unicodedata.normalize('NFKC', s.translate(_TRANSLATE)).lower()


def collapse(s):
    return re.sub(r'\s+', ' ', s).strip()


def page_variants(raw_text):
    """Searchable forms of a page: as-is, and with line-end hyphenation rejoined or kept."""
    t = SOFT_HYPHEN_AT_EOL.sub('-', raw_text)
    forms = (t, LINE_END_HYPHEN.sub(r'\1', t), LINE_END_HYPHEN.sub(r'\1-', t))
    return list(dict.fromkeys(collapse(normalize_text(f)) for f in forms))


def variant_regex(variant):
    """Letters must not run into letters, digits into digits ("Obama2" still matches "Obama")."""
    first, last = variant[0], variant[-1]
    before = rf'(?<!{LETTER})' if first.isalpha() else r'(?<!\d)' if first.isdigit() else ''
    after = rf'(?!{LETTER})' if last.isalpha() else r'(?!\d)' if last.isdigit() else ''
    return re.compile(before + re.escape(variant) + after)


NAME_SUFFIX = re.compile(r'^(jr|sr|ii|iii|iv|v)\.?$', re.IGNORECASE)


def reverse_name(base):
    """Search forms for "Last, First[, Suffix]" (see reverseName in indexer.js)."""
    parts = [p.strip() for p in base.split(',')]
    if len(parts) < 2 or not parts[0] or not parts[1]:
        return [base]
    last, rest = parts[0], parts[1:]
    if len(rest) >= 2 and NAME_SUFFIX.match(rest[-1]):
        suffix = rest.pop()
        first = ', '.join(rest)
        return [f'{first} {last} {suffix}', f'{first} {last}, {suffix}']
    return [f"{', '.join(rest)} {last}"]


def process_terms(terms_text, reverse_names=False, entries=None):
    """Parse one textarea into {display_term: set(search variants)}.

    `term (v1, v2)` searches for all three. With reverse_names, "Last, First" searches for
    "First Last"; a name without a comma is searched as typed.
    """
    entries = {} if entries is None else entries
    for raw_line in (terms_text or '').splitlines():
        line = EDGE_QUOTES.sub('', raw_line.strip()).strip()
        if not line:
            continue

        variants = []
        parens = re.findall(r'\(([^)]+)\)', line)
        for group in parens:
            variants.extend(group.split(','))

        base = collapse(re.sub(r'\([^)]*\)', ' ', line))
        variants.extend(reverse_name(base) if reverse_names else [base])

        display = line if parens else base
        if not display:
            continue
        bucket = entries.setdefault(display, set())
        bucket.update(n for n in (collapse(normalize_text(v)) for v in variants) if n)
    return entries


def page_numbers(doc):
    """Use the PDF's page labels when it has meaningful ones, else physical page numbers."""
    labels = [page.get_label() or '' for page in doc]
    if any(label.strip() and label.strip() != str(i + 1) for i, label in enumerate(labels)):
        return [label.strip() or str(i + 1) for i, label in enumerate(labels)]
    return [str(i + 1) for i in range(len(labels))]


# Letters that Unicode does not decompose into a base letter plus an accent (see indexer.js).
_FOLD = str.maketrans({'ł': 'l', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ß': 'ss', 'ı': 'i'})


def sort_key(term):
    """Case, accents and leading punctuation ignored, as in indexer.js sortKey."""
    key = ''.join(c for c in unicodedata.normalize('NFD', normalize_text(term)) if not unicodedata.combining(c))
    key = re.sub(r'^[\W_]+', '', key.translate(_FOLD))
    return (key, term)


def build_index(pages, terms_text, names_text=''):
    """pages: list of (number, text). Returns {index, not_found}."""
    entries = process_terms(terms_text, reverse_names=False)
    process_terms(names_text, reverse_names=True, entries=entries)
    matchers = [(term, [variant_regex(v) for v in variants], []) for term, variants in entries.items() if variants]

    for number, text in pages:
        forms = page_variants(text)
        for _term, regexes, found in matchers:
            if number not in found and any(r.search(f) for r in regexes for f in forms):
                found.append(number)

    found = sorted(((t, p) for t, _, p in matchers if p), key=lambda tp: sort_key(tp[0]))
    return {
        'index': '\n'.join(f"{term}: {', '.join(pages)}" for term, pages in found),
        'not_found': [t for t, _, p in matchers if not p],
    }


def create_index_from_pdf(pdf_file, terms_text, names_text):
    """Create an index from an uploaded PDF (processed in memory, never written to disk)."""
    with pymupdf.open(stream=pdf_file.read(), filetype='pdf') as doc:
        if doc.needs_pass:
            raise ValueError('This PDF is password-protected. Remove the password and try again.')
        texts = [page.get_text('text') for page in doc]
        numbers = page_numbers(doc)
    if not any(t.strip() for t in texts):
        raise ValueError('No selectable text was found in this PDF. It is probably a scan; run OCR on it first.')
    return build_index(list(zip(numbers, texts)), terms_text, names_text)


@app.route('/')
def index():
    return render_template('index.html')


@app.errorhandler(413)
def too_large(_e):
    return jsonify({'error': 'File too large: the maximum is 50MB.'}), 413


@app.route('/generate-index', methods=['POST'])
def generate_index():
    pdf_file = request.files.get('pdf')
    if pdf_file is None or pdf_file.filename == '':
        return jsonify({'error': 'No PDF file uploaded'}), 400

    terms_text = request.form.get('terms', '')
    names_text = request.form.get('names', '')
    if not terms_text.strip() and not names_text.strip():
        return jsonify({'error': 'No terms or names provided'}), 400

    try:
        result = create_index_from_pdf(pdf_file, terms_text, names_text)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception:
        logging.exception('Failed to process PDF')
        return jsonify({'error': "Could not read this PDF. Make sure it's a valid, unencrypted PDF."}), 500

    if not result['index'] and not result['not_found']:
        return jsonify({'error': 'No matching terms found in the PDF'}), 404
    return jsonify(result)


if __name__ == '__main__':
    app.run(host='127.0.0.1', debug=True, port=5000, use_reloader=False)
