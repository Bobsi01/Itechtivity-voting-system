---
name: streaming-pdf-ticket
description: >-
  Procedures for low-memory, high-speed streaming PDF generation of Bingo Cards and perforated
  ticket stubs with vector QR codes using pdfkit. Use when implementing, debugging, or optimizing
  ticket sheet generation, printing layouts, or memory usage on Heroku.
---

# Streaming PDF Ticket & Bingo Card Generator Skill

## 1. Core Principles
* **Never Buffer 1,000 Cards in RAM:** Building a massive document in memory exceeds Heroku's 512MB dyno RAM.
* **Chunked Batching:** Break generation jobs into 50-card sub-batches.
* **Vector or Low-Res Data URLs:** Generate crisp vector QR codes or optimized PNG buffers.

## 2. Low-Memory Generator Implementation
```typescript
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export async function renderCardSheet(
  doc: PDFKit.PDFDocument,
  cardSerial: string,
  stubs: Array<{ serial: string; slot: number; qrPayload: string }>
) {
  doc.addPage({ size: 'A4', margin: 20 });

  // 1. Render Bingo Grid & Master QR
  doc.fontSize(16).text('ITECHTIVITY 2027 — BINGO CARD', { align: 'center' });
  doc.fontSize(10).text(`Serial: ${cardSerial}`, { align: 'center' });
  
  // 2. Render Perforation Guideline
  doc.moveTo(20, 500).lineTo(575, 500).dash(5, { space: 3 }).stroke();

  // 3. Render 6 Stubs in a 3x2 Grid
  for (let i = 0; i < stubs.length; i++) {
    const stub = stubs[i];
    const x = 25 + (i % 3) * 185;
    const y = 520 + Math.floor(i / 3) * 130;

    const qrDataUrl = await QRCode.toDataURL(stub.qrPayload, {
      errorCorrectionLevel: 'Q',
      margin: 1,
      width: 100,
    });

    doc.image(qrDataUrl, x + 35, y + 20, { width: 70, height: 70 });
    doc.fontSize(8).text(`Stub: ${stub.serial}`, x, y + 95, { width: 140, align: 'center' });
  }
}
```

## 3. Worker Execution Loop
* Stream chunks directly to Appwrite Cloud Storage.
* Explicitly trigger garbage collection between batches if `global.gc` is enabled, or allow V8 `--max-old-space-size=384` to reclaim memory automatically.
