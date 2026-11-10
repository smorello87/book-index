// PDF text extraction with PDF.js. The library is passed in so the same code runs
// in the browser (public/vendor/pdfjs) and in Node tests (pdfjs-dist legacy build).

/**
 * Join PDF.js text items into page text: line breaks where PDF.js reports end-of-line,
 * and a space wherever two items are visibly apart (PDF.js doesn't always add one, e.g.
 * in OCR'd scans, which would glue "with" + "a" into "witha").
 */
export function joinTextItems(items) {
  let text = '';
  let prev = null;
  for (const item of items) {
    if (typeof item.str !== 'string' || item.str === '') {
      if (item.hasEOL && text && !text.endsWith('\n')) text += '\n';
      continue; // marked-content markers and empty items
    }
    if (prev && !prev.hasEOL && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      const size = Math.max(Math.hypot(item.transform[0], item.transform[1]), 1);
      const gap = item.transform[4] - (prev.transform[4] + prev.width);
      const sameLine = Math.abs(item.transform[5] - prev.transform[5]) < size * 0.5;
      if (!sameLine || gap > size * 0.15) text += ' ';
    }
    text += item.str;
    if (item.hasEOL) text += '\n';
    prev = item;
  }
  return text;
}

/** Text of one PDF.js page. */
export async function pageText(page) {
  const content = await page.getTextContent();
  return joinTextItems(content.items);
}

/**
 * Read every page's text plus the PDF's embedded page labels.
 * @param {import('pdfjs-dist')} pdfjsLib
 * @param {Uint8Array} data
 * @param {object} [options]  extra getDocument options (cMapUrl, standardFontDataUrl, …)
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function extractPdf(pdfjsLib, data, options = {}, onProgress = () => {}) {
  const loadingTask = pdfjsLib.getDocument({ data, isEvalSupported: false, ...options });
  const doc = await loadingTask.promise;
  try {
    const texts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      texts.push(await pageText(page));
      page.cleanup();
      onProgress(i, doc.numPages);
    }
    let labels = null;
    try {
      labels = await doc.getPageLabels();
    } catch {
      labels = null; // malformed label tree: fall back to physical page numbers
    }
    return { texts, labels };
  } finally {
    await loadingTask.destroy();
  }
}
