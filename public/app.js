import * as pdfjsLib from './vendor/pdfjs/pdf.min.mjs';
import { extractPdf } from './extract.js';
import { buildIndex, pageNumbering } from './indexer.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const PDF_OPTIONS = {
  cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
};

const $ = (id) => document.getElementById(id);
const form = $('indexForm');
const fileInput = $('pdfFile');
const dropzone = $('dropzone');
const dropzoneText = $('dropzoneText');
const dropzoneFile = $('dropzoneFile');
const submitBtn = $('submitBtn');
const progress = $('progress');
const progressBar = $('progressBar');
const progressText = $('progressText');
const error = $('error');
const results = $('results');
const resultsMeta = $('resultsMeta');
const indexOutput = $('indexOutput');
const copyBtn = $('copyBtn');
const notFound = $('notFound');
const notFoundTitle = $('notFoundTitle');
const notFoundList = $('notFoundList');

let plainIndex = '';

// --- File selection, including drag and drop ---
function showFile() {
  const file = fileInput.files[0];
  dropzoneText.textContent = file ? 'Choose a different PDF' : 'Choose a PDF, or drop it here';
  dropzoneFile.textContent = file ? file.name : '';
}
fileInput.addEventListener('change', showFile);
for (const type of ['dragenter', 'dragover']) {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop']) {
  dropzone.addEventListener(type, () => dropzone.classList.remove('dragging'));
}
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!file) return showError('That file is not a PDF. Drop a .pdf file.');
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  showFile();
});

// --- Messages ---
function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function setProgress(done, total) {
  progressBar.style.width = `${total ? (100 * done) / total : 0}%`;
  progressText.textContent = total ? `Reading page ${done} of ${total}` : 'Opening the PDF';
}

function describeNumbering(source, pageOne) {
  if (source === 'offset') return `PDF page ${pageOne} counted as page 1; the ${pageOne - 1} pages before it were skipped.`;
  if (source === 'labels') return 'Page numbers come from the numbering stored in the PDF.';
  return 'Page numbers are counted from the first page of the PDF. If the book has front matter, fill in "Book page 1 is PDF page" and generate again.';
}

function friendlyPdfError(err) {
  if (err?.name === 'PasswordException') return 'This PDF is password-protected. Remove the password and try again.';
  if (err?.name === 'InvalidPDFException') return 'This file is not a valid PDF. Export the book as a PDF again and retry.';
  return `This PDF could not be read (${err?.message || err}).`;
}

// --- Rendering the index like the back of a book ---
function letterOf(term) {
  const first = term
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .normalize('NFD')
    .charAt(0)
    .toLocaleUpperCase();
  return /\p{L}/u.test(first) ? first : '0–9';
}

function renderIndex(entries) {
  const groups = [];
  for (const entry of entries) {
    const letter = letterOf(entry.term);
    if (groups.at(-1)?.letter !== letter) groups.push({ letter, entries: [] });
    groups.at(-1).entries.push(entry);
  }
  indexOutput.replaceChildren(
    ...groups.map((group) => {
      const section = document.createElement('div');
      section.className = 'letter-group';
      const heading = document.createElement('h3');
      heading.textContent = group.letter;
      const list = document.createElement('ul');
      for (const { term, pages } of group.entries) {
        const li = document.createElement('li');
        const pagesSpan = document.createElement('span');
        pagesSpan.className = 'entry-pages';
        pagesSpan.textContent = pages.join(', ');
        li.append(`${term}: `, pagesSpan);
        list.append(li);
      }
      section.append(heading, list);
      return section;
    })
  );
}

// --- Generate ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.hidden = true;
  results.hidden = true;
  notFound.hidden = true;

  const file = fileInput.files[0];
  const terms = $('terms').value;
  const names = $('names').value;
  const pageOneRaw = $('pageOne').value.trim();
  const pageOne = pageOneRaw ? Number.parseInt(pageOneRaw, 10) : null;

  if (!file) return showError('Choose a PDF first.');
  if (!terms.trim() && !names.trim()) return showError('Enter at least one term or name.');
  if (pageOneRaw && !(pageOne >= 1)) return showError('"Book page 1 is PDF page" must be a whole number, 1 or more.');

  submitBtn.disabled = true;
  progress.hidden = false;
  setProgress(0, 0);

  try {
    let extracted;
    try {
      extracted = await extractPdf(pdfjsLib, new Uint8Array(await file.arrayBuffer()), PDF_OPTIONS, setProgress);
    } catch (err) {
      console.error(err);
      return showError(friendlyPdfError(err));
    }

    const { texts, labels } = extracted;
    if (pageOne && pageOne > texts.length) {
      return showError(`This PDF has ${texts.length} pages, so PDF page ${pageOne} can't be book page 1.`);
    }
    if (!texts.some((t) => t.trim())) {
      return showError(
        'This PDF has no selectable text, so it is probably a scan. Run OCR on it first ' +
          '(for example, Scan & OCR in Adobe Acrobat), then try again.'
      );
    }

    const { numbers, source } = pageNumbering(texts.length, labels, pageOne);
    const result = buildIndex(texts.map((text, i) => ({ number: numbers[i], text })), terms, names);

    if (result.entries.length) {
      plainIndex = result.index;
      renderIndex(result.entries);
      const count = result.entries.length;
      resultsMeta.textContent = `${count} ${count === 1 ? 'entry' : 'entries'} from ${texts.length} pages. ${describeNumbering(source, pageOne)}`;
      results.hidden = false;
    }

    if (result.notFound.length) {
      const n = result.notFound.length;
      notFoundTitle.textContent = `${n} ${n === 1 ? 'term was' : 'terms were'} not found`;
      notFoundList.replaceChildren(
        ...result.notFound.map((term) => {
          const li = document.createElement('li');
          li.textContent = term;
          return li;
        })
      );
      notFound.hidden = false;
    }

    (results.hidden ? notFound : results).scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    submitBtn.disabled = false;
    progress.hidden = true;
  }
});

// --- Copy as plain text ("term: 1, 2, 3" per line) ---
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (e.g. iframe without clipboard permission): use a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

copyBtn.addEventListener('click', async () => {
  const ok = await copyText(plainIndex);
  copyBtn.textContent = ok ? 'Copied' : 'Copy failed: select the index and copy it';
  setTimeout(() => {
    copyBtn.textContent = 'Copy index';
  }, 2500);
});
