// Web Worker that reads the PDF with MuPDF and builds the index, off the main thread so
// the page stays responsive even for long books and long term lists.
//
// Protocol: posts {type: 'ready'} once MuPDF has loaded. For each job
// {pdf: ArrayBuffer, terms, names, pageOne} it posts {type: 'progress', done, total} per
// page, {type: 'matching'} when reading is done, and finally either
// {type: 'done', result, source, pageCount} or {type: 'error', name, message, pageCount?}.
import * as mupdf from './vendor/mupdf/mupdf.js';
import { extractPdf } from './extract.js';
import { buildIndex, pageNumbering } from './indexer.js';

function fail(name, message, extra = {}) {
  return Object.assign(new Error(message), { name, ...extra });
}

self.addEventListener('message', ({ data: job }) => {
  try {
    const { texts, labels } = extractPdf(mupdf, new Uint8Array(job.pdf), (done, total) => {
      self.postMessage({ type: 'progress', done, total });
    });
    if (texts.length === 0) throw fail('InvalidPDFException', 'The PDF has no pages.');
    if (job.pageOne && job.pageOne > texts.length) {
      throw fail('PageOneError', 'Book page 1 is past the end of the PDF.', { pageCount: texts.length });
    }
    if (!texts.some((t) => t.trim())) throw fail('NoTextError', 'The PDF has no selectable text.');

    self.postMessage({ type: 'matching' });
    const { numbers, source } = pageNumbering(texts.length, labels, job.pageOne);
    const result = buildIndex(texts.map((text, i) => ({ number: numbers[i], text })), job.terms, job.names);
    self.postMessage({ type: 'done', result, source, pageCount: texts.length });
  } catch (err) {
    self.postMessage({
      type: 'error',
      name: err?.name || 'Error',
      message: err?.message || String(err),
      pageCount: err?.pageCount,
    });
  }
});

self.postMessage({ type: 'ready' });
