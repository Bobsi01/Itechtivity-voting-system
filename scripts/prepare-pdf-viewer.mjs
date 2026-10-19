import { copyFile, cp, mkdir } from 'node:fs/promises';

await mkdir('public/pdf-viewer', { recursive: true });
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'public/pdf-viewer/pdf.worker.min.mjs');
await cp('node_modules/pdfjs-dist/standard_fonts', 'public/pdf-viewer/standard_fonts', { recursive: true });
