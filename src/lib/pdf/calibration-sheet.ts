import PDFDocument from 'pdfkit';
import {
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  MARGIN_PT,
  CARD_WIDTH_PT,
  CARD_HEIGHT_PT,
  CUT_VERTICAL_X,
  CUT_HORIZONTAL_Y,
  getCardQuadrantBounds,
  getCardInternalLayout,
} from './a4-geometry';

/**
 * Generates an A4 Print Alignment & Calibration Test Sheet PDF buffer.
 * Used by event production teams to verify printer scale, guillotine cutlines,
 * and stub perforation alignments before running high-volume card batches.
 */
export async function generateCalibrationPdfBuffer(): Promise<Buffer> {

  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: 'Itechtivity 2027 - Print Calibration Sheet',
      Author: 'Itechtivity 2027 Production System',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  doc.addPage({ size: 'A4', margin: 0 });

  // 1. Draw outer page margin boundary (0.2 in / 14.4 pt)
  const m = MARGIN_PT;
  const pw = A4_WIDTH_PT;
  const ph = A4_HEIGHT_PT;

  doc.save();
  doc.strokeColor('#cccccc').lineWidth(0.5);
  doc.rect(m, m, pw - 2 * m, ph - 2 * m).stroke();
  doc.restore();

  // 2. Center guillotine cutting guidelines (Vertical and Horizontal)
  doc.save();
  doc.strokeColor('#777777').lineWidth(0.5).dash(4, { space: 4 });
  doc.moveTo(CUT_VERTICAL_X, 0).lineTo(CUT_VERTICAL_X, ph).stroke();
  doc.moveTo(0, CUT_HORIZONTAL_Y).lineTo(pw, CUT_HORIZONTAL_Y).stroke();
  doc.restore();

  // Primary cut labels
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#555555');
  doc.text('PRIMARY VERTICAL CUT (GUILLOTINE 50%)', CUT_VERTICAL_X + 4, m + 4);
  doc.text('PRIMARY HORIZONTAL CUT (GUILLOTINE 50%)', m + 4, CUT_HORIZONTAL_Y - 8);

  // 3. Physical ruler calibration check blocks
  // 50 mm check block (50mm * 72 / 25.4 = 141.732 pt)
  const fiftyMmPt = (50 * 72) / 25.4;
  const rulerY = m + 14;

  doc.save();
  doc.strokeColor('#000000').lineWidth(0.75);
  doc.rect(m + 4, rulerY, fiftyMmPt, 12).stroke();
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#000000');
  doc.text(`RULER CHECK: EXACTLY 50.0 MM (${fiftyMmPt.toFixed(1)} pt)`, m + 8, rulerY + 3);
  doc.restore();

  // 2.0 inch check block (144 pt)
  const twoInchesPt = 144;
  const twoInchX = CUT_VERTICAL_X + 4;

  doc.save();
  doc.strokeColor('#000000').lineWidth(0.75);
  doc.rect(twoInchX, rulerY, twoInchesPt, 12).stroke();
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#000000');
  doc.text('RULER CHECK: EXACTLY 2.00 INCHES (144 pt)', twoInchX + 4, rulerY + 3);
  doc.restore();

  // 4. Corner crosshairs and center bullseye target
  const crosshairLen = 14;
  const drawCrosshair = (cx: number, cy: number, label?: string) => {
    doc.save();
    doc.strokeColor('#000000').lineWidth(0.75);
    doc.moveTo(cx - crosshairLen, cy).lineTo(cx + crosshairLen, cy).stroke();
    doc.moveTo(cx, cy - crosshairLen).lineTo(cx, cy + crosshairLen).stroke();
    doc.circle(cx, cy, 4).stroke();
    if (label) {
      doc.fontSize(5).font('Helvetica').fillColor('#666666');
      doc.text(label, cx + 6, cy + 2);
    }
    doc.restore();
  };

  drawCrosshair(m, m, 'Top-Left Margin');
  drawCrosshair(pw - m, m, 'Top-Right Margin');
  drawCrosshair(m, ph - m, 'Bottom-Left Margin');
  drawCrosshair(pw - m, ph - m, 'Bottom-Right Margin');
  drawCrosshair(CUT_VERTICAL_X, CUT_HORIZONTAL_Y, 'Sheet Center');

  // 5. Quadrant Bounding Boxes and Internal Elements
  const quadrantNames = [
    'CARD 1 (Top-Left)',
    'CARD 2 (Top-Right)',
    'CARD 3 (Bottom-Left)',
    'CARD 4 (Bottom-Right)',
  ];

  for (let q = 0; q < 4; q++) {
    const bounds = getCardQuadrantBounds(q);
    const layout = getCardInternalLayout(bounds.y);

    // Card outer border
    doc.save();
    doc.strokeColor('#333333').lineWidth(0.75);
    doc.rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke();
    doc.restore();

    // Quadrant label
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#111111');
    doc.text(
      `${quadrantNames[q]} — ${bounds.width.toFixed(1)}pt x ${bounds.height.toFixed(1)}pt`,
      bounds.x + 6,
      bounds.y + 4
    );

    // Header region box
    doc.save();
    doc.strokeColor('#aaaaaa').lineWidth(0.5);
    doc.rect(bounds.x + 4, bounds.y + 14, bounds.width - 8, layout.headerHeight - 16).stroke();
    doc.fontSize(6).font('Helvetica').fillColor('#555555');
    doc.text('Header & Master QR Zone (42pt)', bounds.x + 8, bounds.y + 20);
    doc.restore();

    // 5x5 Bingo Grid calibration zone
    const gridY = bounds.y + layout.headerHeight;
    const gridSide = 220;
    const gridX = bounds.x + (bounds.width - gridSide) / 2;
    const cellSize = gridSide / 5;

    doc.save();
    doc.strokeColor('#000000').lineWidth(0.75);
    doc.rect(gridX, gridY, gridSide, gridSide).stroke();

    doc.strokeColor('#cccccc').lineWidth(0.25);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = gridX + col * cellSize;
        const cy = gridY + row * cellSize;
        doc.rect(cx, cy, cellSize, cellSize).stroke();
      }
    }
    doc.fontSize(6).font('Helvetica').fillColor('#777777');
    doc.text('5x5 Bingo Grid (220pt x 220pt, 44pt cells)', gridX + 4, gridY + 4);
    doc.restore();

    // Demographic data stripe
    const demoY = gridY + layout.gridHeight;
    doc.save();
    doc.strokeColor('#999999').lineWidth(0.5);
    doc.rect(bounds.x + 4, demoY, bounds.width - 8, layout.demographicHeight).stroke();
    doc.fontSize(5).font('Helvetica').fillColor('#666666');
    doc.text('Demographic Data Stripe (Serial, Buyer Name, Student ID)', bounds.x + 8, demoY + 5);
    doc.restore();

    // Stub Tear Perforation Line (Dashed)
    doc.save();
    doc.strokeColor('#e11d48').lineWidth(0.75).dash(2, { space: 2 });
    doc.moveTo(bounds.x, layout.perforationY).lineTo(bounds.x + bounds.width, layout.perforationY).stroke();
    doc.fontSize(5).font('Helvetica-Bold').fillColor('#e11d48');
    doc.text('--- PERFORATION TEAR LINE (TEAR STUBS HERE) ---', bounds.x + 12, layout.perforationY - 6);
    doc.restore();

    // 6 Stubs outlines
    for (let s = 0; s < layout.stubCount; s++) {
      const sx = bounds.x + s * layout.stubWidth;
      const sy = layout.perforationY;

      doc.save();
      doc.strokeColor('#666666').lineWidth(0.5);
      doc.rect(sx, sy, layout.stubWidth, layout.stubHeight).stroke();

      // Stub QR zone box
      const qrSide = 32;
      const qrX = sx + (layout.stubWidth - qrSide) / 2;
      const qrY = sy + 18;
      doc.rect(qrX, qrY, qrSide, qrSide).stroke();

      doc.fontSize(5).font('Helvetica-Bold').fillColor('#111111');
      doc.text(`STUB ${s + 1}`, sx + 4, sy + 6);
      doc.fontSize(4).font('Helvetica').fillColor('#777777');
      doc.text('QR (32pt)', qrX + 3, qrY + 12);
      doc.restore();
    }
  }

  // Footer instructions banner
  doc.fontSize(6).font('Helvetica-Bold').fillColor('#222222');
  doc.text(
    'INSTRUCTIONS: Print at 100% scale (no page scaling). Measure the 50mm and 2-inch calibration check boxes with a physical ruler. Verify guillotine cuts bisect the page exactly in half and that perforation lines match the card stub tears.',
    m + 4,
    ph - m - 14,
    { width: pw - 2 * m - 8, align: 'center' }
  );

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);
  });
}
