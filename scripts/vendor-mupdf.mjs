// Copy the MuPDF.js files the browser needs from node_modules into public/vendor/mupdf.
// Run after changing the mupdf version: npm install && npm run vendor
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = 'node_modules/mupdf';
const dest = 'public/vendor/mupdf';
const { version } = JSON.parse(readFileSync(`${src}/package.json`, 'utf8'));

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const f of ['mupdf.js', 'mupdf-wasm.js', 'mupdf-wasm.wasm']) cpSync(`${src}/dist/${f}`, `${dest}/${f}`);
cpSync(`${src}/LICENSE`, `${dest}/LICENSE`);
writeFileSync(`${dest}/VERSION`, `${version}\n`);
console.log(`Vendored mupdf ${version} into ${dest}`);
