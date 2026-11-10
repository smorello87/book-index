// PDF text extraction with MuPDF (the engine behind PyMuPDF). The library is passed in
// so the same code runs in the browser worker (public/vendor/mupdf) and in Node tests.

// Same text settings as PyMuPDF's page.get_text("text"): keep ligatures and whitespace
// as found (indexer.js normalizes them) and ignore text outside the page.
export const TEXT_OPTIONS = 'preserve-whitespace,preserve-ligatures,clip';

function named(name, message) {
  const err = new Error(message);
  err.name = name;
  return err;
}

/**
 * Read every page's text and page label.
 * @param {typeof import('mupdf')} mupdf
 * @param {Uint8Array|ArrayBuffer} data
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {{texts: string[], labels: string[]}}
 */
export function extractPdf(mupdf, data, onProgress = () => {}) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(data, 'application/pdf');
  } catch (err) {
    throw named('InvalidPDFException', err?.message || String(err));
  }
  try {
    if (doc.needsPassword()) throw named('PasswordException', 'The PDF is password-protected.');
    const total = doc.countPages();
    const texts = [];
    const labels = [];
    for (let i = 0; i < total; i++) {
      const page = doc.loadPage(i);
      try {
        const stext = page.toStructuredText(TEXT_OPTIONS);
        texts.push(stext.asText());
        stext.destroy();
        let label = '';
        try {
          label = page.getLabel() || '';
        } catch {
          label = ''; // malformed label tree: fall back to physical numbers
        }
        labels.push(label);
      } finally {
        page.destroy();
      }
      onProgress(i + 1, total);
    }
    return { texts, labels };
  } finally {
    doc.destroy();
  }
}
