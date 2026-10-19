---
name: streaming-pdf-ticket
description: >-
  Procedures for low-memory, high-speed streaming PDF generation of Bingo Cards and perforated
  ticket stubs with vector QR codes using pdfkit. Use when implementing, debugging, or optimizing
  ticket sheet generation, printing layouts, or memory usage on Heroku. Do not use for ticket
  redemption transactions, QR cryptographic signing, or real-time vote broadcasting.
author: Daniel Bobis (GitHub: @ItsMeYourNightmare)
assisted_by:
  - OpenAI Codex
  - Google Gemini
---

# Streaming PDF Ticket & Bingo Card Generator Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Core Principles
* **Never Buffer 1,000 Cards in RAM:** Building a massive document tree in memory exceeds Heroku's 512MB dyno RAM.
* **Chunked Batching:** Generate and stream in 50-card sub-batches.
* **True Vector QRs (Zero Base64 PNG Overhead):** Draw vector rectangles directly onto the PDF canvas instead of generating raster Base64 PNG data URLs. This prevents V8 memory churn and guarantees 100% crisp printing at any resolution.

## 2. Low-Memory True Vector Generator Implementation
```typescript
import type PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export function renderVectorQR(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  size: number
): void {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const modules = qr.modules;
  const cellSize = size / modules.size;

  // Draw vector rectangles directly into PDF stream
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) {
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize).fill('#000000');
      }
    }
  }
}

export function renderCardSheet(
  doc: PDFKit.PDFDocument,
  cardSerial: string,
  stubs: Array<{ serial: string; slot: number; qrPayload: string }>
): void {
  doc.addPage({ size: 'A4', margin: 20 });

  // 1. Render Bingo Header & Master Serial
  doc.fontSize(16).text('ITECHTIVITY 2027 — BINGO CARD', { align: 'center' });
  doc.fontSize(10).text(`Serial: ${cardSerial}`, { align: 'center' });
  
  // 2. Render Perforation Guideline
  doc.moveTo(20, 500).lineTo(575, 500).dash(5, { space: 3 }).stroke();

  // 3. Render 6 Stubs in a 3x2 Grid using pure vector rectangles
  for (let i = 0; i < stubs.length; i++) {
    const stub = stubs[i];
    const x = 25 + (i % 3) * 185;
    const y = 520 + Math.floor(i / 3) * 130;

    // Draw crisp vector QR code (70x70 points)
    renderVectorQR(doc, stub.qrPayload, x + 35, y + 20, 70);

    doc.fontSize(8).fillColor('#000000').text(`Stub: ${stub.serial}`, x, y + 95, { width: 140, align: 'center' });
  }
}
```

## 3. Worker Execution Loop & Memory Discipline
* Stream each 50-card sub-batch directly to Appwrite Cloud Storage via `node-appwrite`.
* Close and dereference each `PDFDocument` instance after the upload finishes so V8 garbage collector reclaims heap memory prior to the next batch.
* Enforce `--max-old-space-size=384` in the Heroku worker dyno launch script.
