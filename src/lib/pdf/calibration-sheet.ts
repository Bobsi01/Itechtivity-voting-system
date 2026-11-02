import PDFDocument from 'pdfkit';
import {
  A4_WIDTH_PT, A4_HEIGHT_PT, MARGIN_PT, CUT_VERTICAL_X, CUT_HORIZONTAL_Y,
  getCardQuadrantBounds, getCardInternalLayout,
} from './a4-geometry';
import { getBoothCode } from './booth-grid';

export async function generateCalibrationPdfBuffer(): Promise<Buffer> {

  const doc = new PDFDocument({ autoFirstPage: false, info: { Title: 'Itechtivity 2027 - Print Calibration Sheet' } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.addPage({ size: 'A4', margin: 0 });

  // Every label has a bounded box: PDFKit must never flow edge text onto another page.
  const label = (text: string, x: number, y: number, width: number, size = 6) => {

    doc.font('Helvetica').fontSize(size).fillColor('#111111')
      .text(text, x, y, { width, height: 12, lineBreak: false });
  };

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const bounds = getCardQuadrantBounds(quadrant);
    const layout = getCardInternalLayout(bounds.y);
    doc.strokeColor('#777777').lineWidth(0.5).rect(bounds.x, bounds.y, bounds.width, bounds.height).stroke();
    label(`CARD ${quadrant + 1} - Print at 100% (Actual size)`, bounds.x + 4, bounds.y + 4, bounds.width - 8, 7);

    const rulerWidth = quadrant % 2 === 0 ? 50 * 72 / 25.4 : 144;
    doc.rect(bounds.x + 6, bounds.y + 17, rulerWidth, 12).stroke();
    label(quadrant % 2 === 0 ? 'Ruler: exactly 50 mm' : 'Ruler: exactly 2 inches', bounds.x + 9, bounds.y + 20, rulerWidth - 6);

    const gridX = bounds.x + 3;
    const gridY = bounds.y + layout.headerHeight;
    const cellWidth = (bounds.width - 6) / 8;
    const cellHeight = layout.gridHeight / 7;
    for (let row = 0; row < 7; row++) {
      for (let column = 0; column < 8; column++) {
        if (getBoothCode(row, column) === null) continue;
        const x = gridX + column * cellWidth;
        const y = gridY + row * cellHeight;
        doc.rect(x, y, cellWidth, cellHeight).stroke();
        label(getBoothCode(row, column)!, x + 2, y + 3, cellWidth - 4, 5);
      }
    }
    doc.rect(gridX + 3 * cellWidth, gridY + 2 * cellHeight, 2 * cellWidth, 2 * cellHeight).stroke();
    label('Master QR zone', gridX + 3 * cellWidth + 2, gridY + 2 * cellHeight + 4, 2 * cellWidth - 4, 5);
    label('8 columns x 7 rows - 52 booth cells', gridX + 4, gridY + layout.gridHeight + 5, bounds.width - 14);

    doc.save().dash(2, { space: 2 });
    doc.moveTo(bounds.x, layout.perforationY).lineTo(bounds.x + bounds.width, layout.perforationY).stroke();
    doc.restore();
    for (let stub = 0; stub < layout.stubCount; stub++) {
      const x = bounds.x + stub * layout.stubWidth;
      doc.rect(x, layout.perforationY, layout.stubWidth, layout.stubHeight).stroke();
      const qrX = x + (layout.stubWidth - 32) / 2;
      doc.rect(qrX, layout.perforationY + 3, 32, 32).stroke();
      label(`Stub ${stub + 1}`, x + 2, layout.perforationY + 40, layout.stubWidth - 4, 5);
      label('QR: 32 pt', x + 2, layout.perforationY + 51, layout.stubWidth - 4, 5);
    }
    label('Check tear line and QR boxes before printing batches.', bounds.x + 4, bounds.y + bounds.height - 12, bounds.width - 8, 5);
  }

  doc.save().strokeColor('#111111').lineWidth(0.5).dash(4, { space: 4 });
  doc.moveTo(CUT_VERTICAL_X, 0).lineTo(CUT_VERTICAL_X, A4_HEIGHT_PT).stroke();
  doc.moveTo(0, CUT_HORIZONTAL_Y).lineTo(A4_WIDTH_PT, CUT_HORIZONTAL_Y).stroke();
  doc.restore();
  label('Measure ruler boxes. Disable fit-to-page. Center dashed lines are guillotine cuts.', MARGIN_PT, 2, A4_WIDTH_PT - 2 * MARGIN_PT, 5);
  doc.end();
  return result;
}
