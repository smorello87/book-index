// Web Worker that reads PDFs with MuPDF, off the main thread so the page stays responsive.
// Protocol: posts {type: 'ready'} once MuPDF has loaded; then for each PDF (an ArrayBuffer)
// posts {type: 'progress', done, total}, and finally {type: 'done', texts, labels} or
// {type: 'error', name, message}.
import * as mupdf from './vendor/mupdf/mupdf.js';
import { extractPdf } from './extract.js';

self.addEventListener('message', (event) => {
  try {
    const result = extractPdf(mupdf, new Uint8Array(event.data), (done, total) => {
      self.postMessage({ type: 'progress', done, total });
    });
    self.postMessage({ type: 'done', ...result });
  } catch (err) {
    self.postMessage({ type: 'error', name: err?.name || 'Error', message: err?.message || String(err) });
  }
});

self.postMessage({ type: 'ready' });
