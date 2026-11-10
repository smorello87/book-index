// Copy the PDF.js files the browser app needs from node_modules into public/vendor/pdfjs.
// Run after changing the pdfjs-dist version: npm install && npm run vendor
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = 'node_modules/pdfjs-dist';
const dest = 'public/vendor/pdfjs';
const { version } = JSON.parse(readFileSync(`${src}/package.json`, 'utf8'));

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) cpSync(`${src}/build/${f}`, `${dest}/${f}`);
for (const d of ['cmaps', 'standard_fonts']) cpSync(`${src}/${d}`, `${dest}/${d}`, { recursive: true });
cpSync(`${src}/LICENSE`, `${dest}/LICENSE`);
writeFileSync(`${dest}/VERSION`, `${version}\n`);
console.log(`Vendored pdfjs-dist ${version} into ${dest}`);
