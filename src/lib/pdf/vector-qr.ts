import QRCode from 'qrcode';

/**
 * Draws crisp, low-memory vector rectangles directly onto the PDFKit canvas stream.
 * Prevents V8 garbage collection churn and memory bloat caused by raster Base64 data URLs.
 */
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
