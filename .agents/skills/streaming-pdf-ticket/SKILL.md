---
name: streaming-pdf-ticket
description: >-
  Procedures for low-memory vector PDF generation of 4-up A4 Bingo Card quadrant sheets and
  perforated voting stubs with vector QR codes using pdfkit and qrcode. Use when implementing,
  debugging, or optimizing ticket sheet generation, printing layouts, or memory usage. Do not use
  for ticket redemption transactions, QR cryptographic signing, or real-time vote broadcasting.
---

# Vector PDF Ticket & Bingo Card Generator Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Core Principles & A4 Quadrant Geometry

* **Bounded Batch Sizes:** Production batches are restricted to multiples of 4 between 4 and 200 cards per `PdfBatch` (`GenerateBatchSchema` in `src/app/api/production/generate/route.ts` and `generateCardBatch` in `src/lib/pdf/local-generator.ts`), with batch numbers reserved atomically via `pg_advisory_xact_lock(2027, 1)`.
* **4-Up A4 Sheet Geometry (`src/lib/pdf/a4-geometry.ts`):** Render 4 cards per A4 page (`595.28 x 841.89 pt`, `margin: 0` with `5.0mm` / `14.1732pt` computed margins), arranged in 2x2 quadrants (`~283.47 x 406.77 pt` per card), with dashed guillotine cut lines (`CUT_VERTICAL_X`, `CUT_HORIZONTAL_Y`) and corner crop ticks.
* **Card Internal Structure (`src/lib/pdf/a4-sheet-renderer.ts` & `functions/generate-bingo-pdf/src/main.js`):**
  - Header (`42pt`): title, department subtitle, and `#cardSerial` (`B27-B<batch>-<seq>`).
  - Booth Grid (`240pt`): 8 columns x 7 rows (52 booths `CS-01`..`CS-52` via `getBoothCode(r, c)` in `src/lib/pdf/booth-grid.ts`), enclosing a central 2x2 Master QR block (columns 3-4, rows 2-3) containing `CSD`, a `44.5pt` vector QR encoding `MASTER:${cardSerial}`, and `#${cardSerial}`.
  - Demographic Line (`18pt`): `Name` and `Program/Yr/Sec` lines above the horizontal perforation line.
  - Detachable Stubs: 6 vertical columns (`stubWidth = CARD_WIDTH_PT / 6`), each containing a `32x32pt` vector QR (`encodeStubPayload`), `#stubSerial`, `PIN:<8-char>` (`generateStubVerificationCode`), `SLOT <n>`, `awardTitle`, and a `VOTE` watermark.
* **True Vector QRs (Zero Base64 PNG Overhead):** Draw QR modules directly onto the PDFKit canvas using `doc.rect(...).fill()` with `errorCorrectionLevel: 'M'`, wrapped in `doc.save()` / `doc.restore()`.

## 2. Vector QR & Quadrant Renderers

### 2.1 Vector QR Module Renderer (`src/lib/pdf/vector-qr.ts`)

```typescript
import QRCode from 'qrcode';

export function renderVectorQR(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  size: number
): void {

  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const cellSize = size / modules.size;

  doc.save();
  doc.fillColor('#000000');

  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) {
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize).fill();
      }
    }
  }

  doc.restore();
}
```

### 2.2 4-Up A4 Sheet Renderer (`src/lib/pdf/a4-sheet-renderer.ts`)

```typescript
import PDFDocument from 'pdfkit';
import {
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  CARDS_PER_SHEET,
  CUT_VERTICAL_X,
  CUT_HORIZONTAL_Y,
  getCardQuadrantBounds,
  getCardInternalLayout,
  type CardQuadrantBounds,
} from './a4-geometry';
import { renderVectorQR } from './vector-qr';
import { encodeStubPayload, generateStubVerificationCode } from '@/lib/crypto/stub-tokens';

export interface CardStubData {
  slotNumber: number;
  stubSerial: string;
  awardTitle: string;
  qrPayload: string;
  verificationCode?: string;
}

export interface SheetRenderOptions {
  batchNumber: number;
  startCardNumber: number;
  totalCards: number;
  awardsList: Array<{ slotNumber: number; title: string }>;
  secretKey: string;
  boothLogos?: Record<string, Buffer>;
}

function drawSheetGuidelines(doc: PDFKit.PDFDocument): void {

  doc.save();
  doc.strokeColor('#999999').lineWidth(0.5).dash(4, { space: 4 });
  doc.moveTo(CUT_VERTICAL_X, 0).lineTo(CUT_VERTICAL_X, A4_HEIGHT_PT).stroke();
  doc.moveTo(0, CUT_HORIZONTAL_Y).lineTo(A4_WIDTH_PT, CUT_HORIZONTAL_Y).stroke();
  doc.restore();
}

function renderSingleCardQuadrant(
  doc: PDFKit.PDFDocument,
  bounds: CardQuadrantBounds,
  card: { cardSerial: string; stubs: CardStubData[] },
  boothLogos?: Record<string, Buffer>
): void {

  const internal = getCardInternalLayout(bounds.y);
  const logoCount = boothLogos ? Object.keys(boothLogos).length : 0;

  // Condensed excerpt; see src/lib/pdf/a4-sheet-renderer.ts for full 8x7 booth grid, crop marks, and labels
  renderVectorQR(doc, `MASTER:${card.cardSerial}`, bounds.x + 120, bounds.y + internal.headerHeight + 70, 44.5);
  for (let s = 0; s < card.stubs.length; s++) {
    const stubX = bounds.x + s * internal.stubWidth;
    renderVectorQR(doc, card.stubs[s].qrPayload, stubX + (internal.stubWidth - 32) / 2, internal.perforationY + 4, 32);
  }
  doc.fontSize(6).text(`${card.cardSerial} (${logoCount} logos)`, bounds.x + 4, bounds.y + 34);
}

export async function generateA4BingoPdfBuffer(
  options: SheetRenderOptions
): Promise<{ buffer: Buffer; totalSheets: number; totalCards: number }> {

  const { batchNumber, startCardNumber, totalCards, awardsList, secretKey, boothLogos } = options;
  const totalSheets = Math.ceil(totalCards / CARDS_PER_SHEET);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: false,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => {

    chunks.push(chunk);
  });

  let cardSequence = startCardNumber;

  for (let sheetIndex = 0; sheetIndex < totalSheets; sheetIndex++) {
    doc.addPage({ size: 'A4', margin: 0 });
    drawSheetGuidelines(doc);

    for (let quadIndex = 0; quadIndex < CARDS_PER_SHEET; quadIndex++) {
      if (cardSequence - startCardNumber >= totalCards) {
        break;
      }

      const cardSerial = `B27-B${batchNumber.toString().padStart(2, '0')}-${cardSequence.toString().padStart(4, '0')}`;
      const bounds = getCardQuadrantBounds(quadIndex);
      const stubs: CardStubData[] = awardsList.slice(0, 6).map((award) => {

        const stubSerial = `${cardSerial}-S${award.slotNumber}`;
        return {
          slotNumber: award.slotNumber,
          stubSerial,
          awardTitle: award.title,
          qrPayload: encodeStubPayload(stubSerial, award.slotNumber, secretKey),
          verificationCode: generateStubVerificationCode(stubSerial, award.slotNumber, secretKey),
        };
      });

      renderSingleCardQuadrant(doc, bounds, { cardSerial, stubs }, boothLogos);
      cardSequence++;
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {

    doc.on('end', () => {

      resolve({ buffer: Buffer.concat(chunks), totalSheets, totalCards });
    });
    doc.on('error', reject);
  });
}
```

## 3. Persistence, Appwrite Storage & 3-Tier Delivery Fallback

* **Atomic Inventory Persistence (`src/lib/pdf/local-generator.ts`):** Reserve a `PdfBatch` row (`status: 'GENERATING'`), render the PDF buffer, upload to Appwrite Cloud Storage (`uploadBatchPdfToAppwrite`, mandatory outside `NODE_ENV === 'development'`), bulk-insert cards and stubs inside `prisma.$transaction` via `tx.bingoCard.createMany` and `tx.ticketStub.createMany`, and mark the batch `COMPLETED` (or `FAILED` in `catch`).
* **Serverless Sync (`functions/generate-bingo-pdf/src/main.js`):** Keep geometry, `getBoothCode`, QR level `'M'`, and `generateStubSignature` / `generateStubVerificationCode` synchronized with `src/lib/pdf/`.
* **Resilient File Download (`src/app/api/production/files/[filename]/route.ts`):** Enforce `PRODUCTION`/`ADMIN` RBAC and safe-filename path guards, then serve from: (1) local private cache (`storage/private-pdfs`) in dev, (2) Appwrite Cloud Storage (`downloadBatchPdfFromAppwrite`), or (3) deterministic HMAC vector PDF regeneration from database batch parameters.
