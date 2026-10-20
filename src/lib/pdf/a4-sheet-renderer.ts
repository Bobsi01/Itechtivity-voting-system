import PDFDocument from 'pdfkit';
import { getBoothCode } from './booth-grid';
import { renderVectorQR } from './vector-qr';
import {
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  MARGIN_PT,
  CARD_WIDTH_PT,
  CARD_HEIGHT_PT,
  CARDS_PER_ROW,
  CARDS_PER_SHEET,
  CUT_VERTICAL_X,
  CUT_HORIZONTAL_Y,
  getCardQuadrantBounds,
  getCardInternalLayout,
} from './a4-geometry';
import { encodeStubPayload, generateStubVerificationCode } from '@/lib/crypto/stub-tokens';

export interface CardStubData {
  slotNumber: number;
  stubSerial: string;
  awardTitle: string;
  qrPayload: string;
  verificationCode?: string;
}

export interface CardRenderData {
  cardSerial: string;
  stubs: CardStubData[];
}

export interface SheetRenderOptions {
  batchNumber: number;
  startCardNumber: number;
  totalCards: number;
  awardsList: Array<{ slotNumber: number; title: string }>;
  secretKey: string;
  boothLogos?: Record<string, Buffer>;
}

/**
 * Draws the cutting guidelines and sheet crop marks on the A4 page.
 */
export function drawSheetGuidelines(doc: PDFKit.PDFDocument): void {
  doc.save();
  doc.strokeColor('#999999').lineWidth(0.5).dash(4, { space: 4 });

  // Vertical center dividing guideline
  doc.moveTo(CUT_VERTICAL_X, 0).lineTo(CUT_VERTICAL_X, A4_HEIGHT_PT).stroke();

  // Horizontal center dividing guideline
  doc.moveTo(0, CUT_HORIZONTAL_Y).lineTo(A4_WIDTH_PT, CUT_HORIZONTAL_Y).stroke();

  // Outer margin corner marks
  const m = MARGIN_PT;
  const tick = 10;
  doc.undash().strokeColor('#bbbbbb').lineWidth(0.4);

  // Top-Left corner
  doc.moveTo(m - tick, m).lineTo(m, m).lineTo(m, m - tick).stroke();
  // Top-Right corner
  doc.moveTo(A4_WIDTH_PT - m + tick, m).lineTo(A4_WIDTH_PT - m, m).lineTo(A4_WIDTH_PT - m, m - tick).stroke();
  // Bottom-Left corner
  doc.moveTo(m - tick, A4_HEIGHT_PT - m).lineTo(m, A4_HEIGHT_PT - m).lineTo(m, A4_HEIGHT_PT - m + tick).stroke();
  // Bottom-Right corner
  doc.moveTo(A4_WIDTH_PT - m + tick, A4_HEIGHT_PT - m).lineTo(A4_WIDTH_PT - m, A4_HEIGHT_PT - m).lineTo(A4_WIDTH_PT - m, A4_HEIGHT_PT - m + tick).stroke();

  doc.restore();
}

/**
 * Renders a single Bingo Card into a specific quadrant of the A4 sheet.
 * Quadrant geometry: 283.24pt wide x 406.55pt high.
 */
export function renderSingleCardQuadrant(
  doc: PDFKit.PDFDocument,
  bounds: { x: number; y: number; width: number; height: number },
  card: CardRenderData,
  boothLogos?: Record<string, Buffer>
): void {
  const { x, y, width, height } = bounds;
  const internal = getCardInternalLayout(y);

  doc.save();

  // 1. Outer Card Border
  doc.strokeColor('#000000').lineWidth(0.75).undash();
  doc.rect(x + 1, y + 1, width - 2, height - 2).stroke();

  // 2. Header Section (~42pt)
  // Circuit decorative accent bar
  doc.strokeColor('#666666').lineWidth(0.5);
  doc.moveTo(x + 4, y + 5).lineTo(x + width - 4, y + 5).stroke();
  doc.moveTo(x + 4, y + 8).lineTo(x + 40, y + 8).stroke();
  doc.moveTo(x + width - 40, y + 8).lineTo(x + width - 4, y + 8).stroke();

  // Header Title & Emblems
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
  doc.text('ITECHTIVITY 2027', x + 4, y + 12, { width: width - 8, align: 'center' });

  doc.font('Helvetica').fontSize(6).fillColor('#333333');
  doc.text('UNIVERSITY OF CALOOCAN CITY - CSD CAPSTONE', x + 4, y + 25, {
    width: width - 8,
    align: 'center',
  });

  doc.font('Courier-Bold').fontSize(6.5).fillColor('#000000');
  doc.text(`CARD SERIAL: #${card.cardSerial}`, x + 4, y + 34, {
    width: width - 8,
    align: 'center',
  });

  // 3. Interactive Bingo Grid (8 cols x 7 rows = 56 cells, 52 booths + 4-cell Master QR)
  const gridX = x + 3;
  const gridY = y + internal.headerHeight;
  const gridW = width - 6; // 277.24pt
  const gridH = internal.gridHeight; // 240pt

  const cols = 8;
  const rows = 7;
  const cellW = gridW / cols; // ~34.655pt
  const cellH = gridH / rows; // ~34.286pt

  // Draw cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = gridX + c * cellW;
      const cy = gridY + r * cellH;

      // Center 2x2 Master QR Block (Cols 3 & 4, Rows 2 & 3)
      const isCenterBlock = (c === 3 || c === 4) && (r === 2 || r === 3);

      if (isCenterBlock) {
        // We render center Master QR when at r === 2 and c === 3 (top-left of 2x2 block)
        if (r === 2 && c === 3) {
          const masterX = gridX + 3 * cellW;
          const masterY = gridY + 2 * cellH;
          const masterW = cellW * 2;
          const masterH = cellH * 2;

          // Outer frame matching the 2-cell boundary
          doc.strokeColor('#000000').lineWidth(0.65);
          doc.rect(cx + 0.5, cy + 0.5, masterW - 1, masterH - 1).stroke();

          // 1. "CSD" label enlarged by 30% (7.8pt) prominently on top
          const csdY = masterY + 2.5;
          doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#000000');
          doc.text('CSD', masterX + 1, csdY, { width: masterW - 2, align: 'center' });

          // 2. Vector QR Code sized for scannability (~44.5pt / 1.57cm)
          const qrSize = 44.5;
          const qrX = masterX + (masterW - qrSize) / 2;
          const qrY = csdY + 10.5;

          renderVectorQR(
            doc,
            `MASTER:${card.cardSerial}`,
            qrX,
            qrY,
            qrSize
          );

          // 3. Card serial code directly below the QR
          const serialY = qrY + qrSize + 2.5;
          doc.font('Courier-Bold').fontSize(4.8).fillColor('#000000');
          doc.text(`#${card.cardSerial}`, masterX + 1, serialY, {
            width: masterW - 2,
            align: 'center',
            lineBreak: false,
          });
        }
        continue;
      }

      // Booth Project Cells (52 booths)
      doc.strokeColor('#888888').lineWidth(0.35);
      doc.rect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1).stroke();

      const boothCode = getBoothCode(r, c);
      if (!boothCode) continue;

      doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#000000');
      doc.text(boothCode, cx + 1, cy + 2.5, { width: cellW - 2, align: 'center' });

      // Clean monogram square or Booth Logo
      const logoBuffer = boothLogos?.[boothCode];
      let logoRendered = false;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, cx + 3, cy + 9.5, {
            fit: [cellW - 6, cellH - 12.5],
            align: 'center',
            valign: 'center',
          });
          logoRendered = true;
        } catch {
          logoRendered = false;
        }
      }

      if (!logoRendered) {
        doc.strokeColor('#bbbbbb').lineWidth(0.25);
        doc.rect(cx + 3, cy + 9.5, cellW - 6, cellH - 12.5).stroke();
        doc.font('Helvetica').fontSize(4.5).fillColor('#666666');
        doc.text('STAMP', cx + 3, cy + 15, { width: cellW - 6, align: 'center' });
      }
    }
  }

  // 4. Demographic Info Line
  const demoY = gridY + gridH + 3;
  doc.font('Helvetica').fontSize(6).fillColor('#000000');
  doc.text('Name: ______________________', x + 5, demoY);
  doc.text('Program/Yr/Sec: ________________', x + width / 2, demoY);

  // 5. Perforation Cut Guideline
  const perfY = internal.perforationY;
  doc.strokeColor('#000000').lineWidth(0.6).dash(3, { space: 2 });
  doc.moveTo(x + 1, perfY).lineTo(x + width - 1, perfY).stroke();

  // 6. Detachable Voting Stubs (6 vertical columns)
  const stubY = perfY + 1;
  const stubH = internal.stubHeight - 2;
  const stubW = internal.stubWidth;

  for (let s = 0; s < card.stubs.length; s++) {
    const stub = card.stubs[s];
    const sx = x + s * stubW;

    // Perforation line between stubs
    if (s > 0) {
      doc.strokeColor('#555555').lineWidth(0.4).dash(2, { space: 2 });
      doc.moveTo(sx, stubY).lineTo(sx, stubY + stubH).stroke();
    }

    // Top: Vector QR code (32x32pt)
    const qrSize = 32;
    const qrX = sx + (stubW - qrSize) / 2;
    const qrY = stubY + 3;

    renderVectorQR(doc, stub.qrPayload, qrX, qrY, qrSize);

    // Below QR: Serial, Cryptographic PIN, and Award Slot Title
    doc.undash();
    doc.font('Courier-Bold').fontSize(4.2).fillColor('#000000');
    doc.text(`#${stub.stubSerial}`, sx + 1, qrY + qrSize + 1.5, {
      width: stubW - 2,
      align: 'center',
    });

    if (stub.verificationCode) {
      doc.font('Courier-Bold').fontSize(4).fillColor('#222222');
      doc.text(`PIN:${stub.verificationCode}`, sx + 1, qrY + qrSize + 6.5, {
        width: stubW - 2,
        align: 'center',
      });
    }

    // Award Slot & Title (fits vertically in remaining ~55pt)
    doc.font('Helvetica-Bold').fontSize(4.8).fillColor('#000000');
    doc.text(`SLOT ${stub.slotNumber}`, sx + 1, qrY + qrSize + 12, {
      width: stubW - 2,
      align: 'center',
    });

    doc.font('Helvetica-Bold').fontSize(4.3).fillColor('#222222');
    doc.text(stub.awardTitle.toUpperCase(), sx + 1, qrY + qrSize + 18.5, {
      width: stubW - 2,
      align: 'center',
      lineGap: 0.5,
    });

    // Faded VOTE watermark at bottom
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#bbbbbb');
    doc.text('VOTE', sx + 1, stubY + stubH - 10, {
      width: stubW - 2,
      align: 'center',
    });
  }

  doc.restore();
}

/**
 * Generates an entire multi-page A4 PDF document containing cards (4 per A4 sheet).
 * Returns a Buffer of the generated PDF.
 */
export async function generateA4BingoPdfBuffer(
  options: SheetRenderOptions
): Promise<{ buffer: Buffer; totalSheets: number; totalCards: number }> {

  const { batchNumber, totalCards, awardsList, secretKey, boothLogos } = options;
  const totalSheets = Math.ceil(totalCards / CARDS_PER_SHEET);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0, // Zero document margin; internal geometry calculates exact 0.2" margins
    autoFirstPage: false,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  let cardSequence = 1;

  for (let sheetIndex = 0; sheetIndex < totalSheets; sheetIndex++) {
    doc.addPage({ size: 'A4', margin: 0 });

    // Draw Guillotine cutting guidelines on sheet
    drawSheetGuidelines(doc);

    // Render up to 4 cards on this sheet
    for (let quadIndex = 0; quadIndex < CARDS_PER_SHEET; quadIndex++) {
      if (cardSequence > totalCards) {
        break;
      }

      const cardSerial = `B27-B${batchNumber.toString().padStart(2, '0')}-${cardSequence.toString().padStart(4, '0')}`;
      const bounds = getCardQuadrantBounds(quadIndex);

      // Generate 6 stubs for this card
      const stubs: CardStubData[] = awardsList.slice(0, 6).map((award) => {
        const stubSerial = `${cardSerial}-S${award.slotNumber}`;
        const qrPayload = encodeStubPayload(stubSerial, award.slotNumber, secretKey);
        const verificationCode = generateStubVerificationCode(stubSerial, award.slotNumber, secretKey);
        return {
          slotNumber: award.slotNumber,
          stubSerial,
          awardTitle: award.title,
          qrPayload,
          verificationCode,
        };
      });

      renderSingleCardQuadrant(doc, bounds, { cardSerial, stubs }, boothLogos);
      cardSequence++;
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({ buffer, totalSheets, totalCards });
    });
    doc.on('error', reject);
  });
}
