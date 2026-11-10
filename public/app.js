// --- PDF reader: MuPDF in a Web Worker, loaded on first use (about 4.6 MB, then cached) ---
// The worker reads the PDF and builds the index; this page only shows progress and results.
let enginePromise = null;

function resetEngine(worker) {
  worker?.terminate();
  enginePromise = null;
}

function startEngine() {
  if (!enginePromise) {
    enginePromise = new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' });
      const onMessage = (e) => {
        if (e.data?.type !== 'ready') return;
        worker.removeEventListener('message', onMessage);
        resolve(worker);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener(
        'error',
        (e) => {
          console.error(e);
          resetEngine(worker);
          reject(new Error('The PDF reader failed to load. Check your connection and reload the page.'));
        },
        { once: true }
      );
    });
  }
  return enginePromise;
}

// Errors that mean "this file", not "the reader is broken". Anything else (for example a
// WebAssembly out-of-memory abort) may leave MuPDF unusable, so the worker is replaced.
const FILE_ERRORS = new Set(['PasswordException', 'InvalidPDFException', 'NoTextError', 'PageOneError']);

function runJob(worker, job, onProgress, onMatching) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    const onMessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.done, data.total);
      else if (data.type === 'matching') onMatching();
      else if (data.type === 'done') {
        cleanup();
        resolve(data);
      } else if (data.type === 'error') {
        cleanup();
        if (!FILE_ERRORS.has(data.name)) resetEngine(worker);
        reject(Object.assign(new Error(data.message), { name: data.name, pageCount: data.pageCount }));
      }
    };
    const onError = (e) => {
      // The worker itself crashed (for example, out of memory on a huge file).
      cleanup();
      resetEngine(worker);
      reject(new Error(e.message || 'the PDF reader stopped unexpectedly'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(job, [job.pdf]);
  });
}

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
const srStatus = $('srStatus');
const error = $('error');
const results = $('results');
const resultsTitle = $('resultsTitle');
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
  if (file) startEngine().catch(() => {}); // start downloading the reader while terms are typed
}
fileInput.addEventListener('change', showFile);

// A file dropped anywhere else on the page must not replace the page (and the typed terms).
for (const type of ['dragover', 'drop']) window.addEventListener(type, (e) => e.preventDefault());

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

// The visible progress line updates on every page; screen readers get only the start
// and the outcome, through the separate status region.
function announce(message) {
  srStatus.textContent = message;
}

function setProgress(done, total) {
  progressBar.style.width = `${total ? (100 * done) / total : 0}%`;
  progressText.textContent = total ? `Reading page ${done} of ${total}` : 'Loading the PDF reader';
}

function describeNumbering(source, pageOne) {
  if (source === 'offset' && pageOne === 1) return 'Page numbers are counted from the first page of the PDF, as you set.';
  if (source === 'offset') return `PDF page ${pageOne} counted as page 1; the ${pageOne - 1} pages before it were skipped.`;
  if (source === 'labels') return 'Page numbers come from the numbering stored in the PDF.';
  return 'Page numbers are counted from the first page of the PDF. If the book has front matter, fill in "Book page 1 is PDF page" and generate again.';
}

function friendlyPdfError(err, pageOne) {
  switch (err?.name) {
    case 'PasswordException':
      return 'This PDF is password-protected. Remove the password and try again.';
    case 'InvalidPDFException':
      return 'This file is not a readable PDF. Export the book as a PDF again and retry.';
    case 'NoTextError':
      return (
        'This PDF has no selectable text, so it is probably a scan. Run OCR on it first ' +
        '(for example, Scan & OCR in Adobe Acrobat), then try again.'
      );
    case 'PageOneError':
      return `This PDF has ${err.pageCount} pages, so PDF page ${pageOne} can't be book page 1.`;
    default:
      return `This PDF could not be read (${err?.message || err}).`;
  }
}

// --- Rendering the index like the back of a book ---
function renderIndex(entries) {
  const groups = [];
  for (const entry of entries) {
    if (groups.at(-1)?.letter !== entry.letter) groups.push({ letter: entry.letter, entries: [] });
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
  if (submitBtn.disabled) return;
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
  announce('Reading the PDF.');

  try {
    let worker;
    try {
      worker = await startEngine();
    } catch (err) {
      announce('');
      return showError(err.message);
    }

    let outcome;
    try {
      const job = { pdf: await file.arrayBuffer(), terms, names, pageOne };
      outcome = await runJob(worker, job, setProgress, () => {
        progressText.textContent = 'Matching terms';
      });
    } catch (err) {
      console.error(err);
      announce('');
      return showError(friendlyPdfError(err, pageOne));
    }

    const { result, source, pageCount } = outcome;
    if (!result.entries.length && !result.notFound.length) {
      announce('');
      return showError('None of the lines contain a term to search for. Enter one term or name per line.');
    }

    if (result.entries.length) {
      plainIndex = result.index;
      renderIndex(result.entries);
      const count = result.entries.length;
      resultsMeta.textContent = `${count} ${count === 1 ? 'entry' : 'entries'} from ${pageCount} pages. ${describeNumbering(source, pageOne)}`;
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

    announce(
      `Index ready: ${result.entries.length} ${result.entries.length === 1 ? 'entry' : 'entries'}` +
        (result.notFound.length ? `, ${result.notFound.length} not found.` : '.')
    );

    // When embedded, the parent page grows the iframe after it hears the new height, so
    // wait a moment; scrolling right away stops short of the results.
    const target = results.hidden ? notFound : results;
    const heading = results.hidden ? notFoundTitle : resultsTitle;
    const delay = document.documentElement.classList.contains('embedded') ? 250 : 0;
    setTimeout(() => {
      heading.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, delay);
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
