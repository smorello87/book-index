# Index Generator

Generate a book index from a PDF. Upload the book, list the terms and names to index, and get back entries with page numbers, ready to paste into a manuscript.

**Use it:** [stefanomorello.com/book-index.html](https://stefanomorello.com/book-index.html)

The tool runs entirely in the browser with [MuPDF](https://mupdf.com/) (the same engine as PyMuPDF), compiled to WebAssembly. The PDF is never uploaded anywhere: the server only delivers the page. The PDF reader (about 3.6 MB compressed) is downloaded the first time a visitor chooses a file, then cached.

## Features

- **Terms with variants.** `artificial intelligence (AI, machine learning)` finds all three and lists them under one entry.
- **Names in index form.** `Bush, George W.` searches for "George W. Bush" and is listed as typed. `King, Martin Luther, Jr.` finds both "Martin Luther King Jr." and "Martin Luther King, Jr.". A single name (`Madonna`) is searched as typed.
- **Real page numbers.** Uses the page numbering stored in the PDF when there is one (so front matter can be `i, ii, iii`). Or set "Book page 1 is PDF page" to skip the front matter yourself.
- **Typeset text matches what you type.** Curly apostrophes (`You’re`), ligatures (`ﬁ`), words hyphenated across lines (`intel-` / `ligence`), letter-spaced text and footnote markers (`Obama²`) are all handled.
- **Optional case matching.** Tick "Match capitalization" so `US` finds "US" but not "us", and `Bush` finds the name but not the shrub. Off by default.
- **Whole words only.** `help` does not match `helping`, and `1984` does not match `19845`. Punctuation in a term (`Help!`) is fine.
- Alphabetical output grouped by letter (accents and leading punctuation ignored, so `#MeToo` files under M), a list of terms that were not found, and one-click copy as plain text (`term: 5, 12, 28`).

Still check the result by hand: remove entries that come from the bibliography or works cited. Scanned PDFs need OCR first.

## How it's built

```
public/            the whole site, served as static files
  index.html       page
  app.js           UI: sends the PDF to the worker, shows progress, renders the index
  pdf-worker.js    Web Worker that reads the PDF with MuPDF and builds the index, off the main thread
  extract.js       MuPDF text extraction (shared with the tests)
  indexer.js       matching rules (pure functions, shared with the tests)
  theme.js         iframe embedding: follows the parent site's theme, reports its height
  vendor/mupdf/    MuPDF.js and its WebAssembly binary (from the mupdf npm package)
  _headers         security headers (CSP; only stefanomorello.com may embed it)
wrangler.jsonc     Cloudflare Worker config: static assets only, no server code
tests/             Node tests (npm test) and tests of the legacy Flask app
app.py, templates/, static/   legacy Flask version (PyMuPDF), kept as a reference implementation
```

## Development

```bash
npm install
npm test          # matching rules + an end-to-end run of tests/fixtures/sample.pdf through MuPDF
npm run dev       # http://localhost:8787
```

Upgrading MuPDF: change the `mupdf` version in `package.json`, then `npm install && npm run vendor`.

## Deployment

The site is a Cloudflare Worker with static assets. The Worker is connected to this GitHub repository (Workers Builds), so every push to `main` deploys automatically. There is no server to keep alive and nothing to renew.

To deploy by hand: `npx wrangler deploy`.

On stefanomorello.com, `book-index.html` embeds the Worker in an iframe. The two pages talk over `postMessage`: the site sends its light/dark theme, and the tool reports its height so the frame never scrolls on its own.

## Legacy Flask version

`app.py` is the original server version (previously hosted on PythonAnywhere). It follows the same matching rules as `public/indexer.js` and is kept as a reference:

```bash
pip install -r requirements.txt
python -m unittest discover tests
python app.py     # http://127.0.0.1:5000
```

## License

GNU General Public License v3.0. MuPDF.js is AGPL-3.0 (© Artifex); the complete source of this site is in this repository.

Developed by [Stefano Morello](https://stefanomorello.com).
