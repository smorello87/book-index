# Index Generator

Generate a book index from a PDF. Upload the book, list the terms and names to index, and get back entries with page numbers, ready to paste into a manuscript.

**Use it:** [stefanomorello.com/book-index.html](https://stefanomorello.com/book-index.html)

The tool runs entirely in the browser with [PDF.js](https://mozilla.github.io/pdf.js/). The PDF is never uploaded anywhere: the server only delivers the page.

## Features

- **Terms with variants.** `artificial intelligence (AI, machine learning)` finds all three and lists them under one entry.
- **Names in index form.** `Bush, George W.` searches for "George W. Bush" and is listed as typed. A single name (`Madonna`) is searched as typed.
- **Real page numbers.** Uses the page numbering stored in the PDF when there is one (so front matter can be `i, ii, iii`). Or set "Book page 1 is PDF page" to skip the front matter yourself.
- **Typeset text matches what you type.** Curly apostrophes (`You’re`), ligatures (`ﬁ`), words hyphenated across lines (`intel-` / `ligence`), letter-spaced text and footnote markers (`Obama²`) are all handled.
- **Whole words only.** `help` does not match `helping`, and `1984` does not match `19845`. Punctuation in a term (`Help!`) is fine.
- Alphabetical output grouped by letter, a list of terms that were not found, and one-click copy as plain text (`term: 5, 12, 28`).

Still check the result by hand: remove entries that come from the bibliography or works cited. Scanned PDFs need OCR first.

## How it's built

```
public/            the whole site, served as static files
  index.html       page
  app.js           UI: reads the PDF, shows progress, renders the index
  extract.js       PDF.js text extraction (shared with the tests)
  indexer.js       matching rules (pure functions, shared with the tests)
  theme.js         iframe embedding: follows the parent site's theme, reports its height
  vendor/pdfjs/    PDF.js build, cmaps and standard fonts (from pdfjs-dist)
  _headers         security headers (CSP; only stefanomorello.com may embed it)
wrangler.jsonc     Cloudflare Worker config: static assets only, no server code
tests/             Node tests (npm test) and tests of the legacy Flask app
app.py, templates/, static/   legacy Flask version (PyMuPDF), kept as a reference implementation
```

## Development

```bash
npm install
npm test          # matching rules + an end-to-end run of tests/fixtures/sample.pdf through PDF.js
npm run dev       # http://localhost:8787
```

Upgrading PDF.js: change the `pdfjs-dist` version in `package.json`, then `npm install && npm run vendor`.

## Deployment

The site is a Cloudflare Worker with static assets. The Worker is connected to this GitHub repository (Workers Builds), so every push to `main` deploys automatically. There is no server to keep alive and nothing to renew.

To deploy by hand: `npx wrangler deploy`.

On stefanomorello.com, `book-index.html` embeds the Worker in an iframe. The two pages talk over `postMessage`: the site sends its light/dark theme, and the tool reports its height so the frame never scrolls on its own.

## Legacy Flask version

`app.py` is the original server version (previously hosted on PythonAnywhere). It now follows the same matching rules as `public/indexer.js`, and it is useful for checking PDF.js results against PyMuPDF:

```bash
pip install -r requirements.txt
python -m unittest discover tests
python app.py     # http://127.0.0.1:5000
```

## License

GNU General Public License v3.0. PDF.js is Apache-2.0.

Developed by [Stefano Morello](https://stefanomorello.com).
