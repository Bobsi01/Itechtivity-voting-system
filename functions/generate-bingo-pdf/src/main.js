import crypto from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import pg from 'pg';
import { Client, Storage, Databases, ID } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

const { Pool } = pg;

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_MM = 5.0;
const MARGIN_PT = (MARGIN_MM * 72) / 25.4;
const PRINTABLE_WIDTH_PT = A4_WIDTH_PT - 2 * MARGIN_PT;
const PRINTABLE_HEIGHT_PT = A4_HEIGHT_PT - 2 * MARGIN_PT;
const CARDS_PER_ROW = 2;
const CARDS_PER_COL = 2;
const CARDS_PER_SHEET = 4;
const CARD_WIDTH_PT = PRINTABLE_WIDTH_PT / CARDS_PER_ROW;
const CARD_HEIGHT_PT = PRINTABLE_HEIGHT_PT / CARDS_PER_COL;
const CUT_VERTICAL_X = A4_WIDTH_PT / 2;
const CUT_HORIZONTAL_Y = A4_HEIGHT_PT / 2;

function getBoothCode(row, column) {
  // Center 2x2 Master QR Block occupies columns 3 & 4 and rows 2 & 3
  if ((column === 3 || column === 4) && (row === 2 || row === 3)) {
    return null;
  }

  const cell = row * 8 + column;
  let skipped = 0;
  if (cell > 18) skipped += 2;
  if (cell > 26) skipped += 2;

  return `CS-${String(cell + 1 - skipped).padStart(2, '0')}`;
}

function generateStubSignature(stubSerial, slotNumber, secretKey) {

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(`${stubSerial}:${slotNumber}`);
  return hmac.digest('base64url').slice(0, 24);
}

function generateStubVerificationCode(stubSerial, slotNumber, secretKey) {

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(`${stubSerial}:${slotNumber}:PIN`);
  return hmac.digest('hex').slice(0, 8).toUpperCase();
}

function encodeStubPayload(stubSerial, slotNumber, secretKey) {

  const signature = generateStubSignature(stubSerial, slotNumber, secretKey);
  const rawString = `${stubSerial}|${slotNumber}|${signature}`;
  return Buffer.from(rawString, 'utf8').toString('base64url');
}

function renderVectorQr(doc, text, x, y, size) {

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

function drawSheetGuidelines(doc) {

  doc.save();
  doc.strokeColor('#999999').lineWidth(0.5).dash(4, { space: 4 });
  doc.moveTo(CUT_VERTICAL_X, 0).lineTo(CUT_VERTICAL_X, A4_HEIGHT_PT).stroke();
  doc.moveTo(0, CUT_HORIZONTAL_Y).lineTo(A4_WIDTH_PT, CUT_HORIZONTAL_Y).stroke();

  const m = MARGIN_PT;
  const tick = 10;
  doc.undash().strokeColor('#bbbbbb').lineWidth(0.4);
  doc.moveTo(m - tick, m).lineTo(m, m).lineTo(m, m - tick).stroke();
  doc.moveTo(A4_WIDTH_PT - m + tick, m).lineTo(A4_WIDTH_PT - m, m).lineTo(A4_WIDTH_PT - m, m - tick).stroke();
  doc.moveTo(m - tick, A4_HEIGHT_PT - m).lineTo(m, A4_HEIGHT_PT - m).lineTo(m, A4_HEIGHT_PT - m + tick).stroke();
  doc.moveTo(A4_WIDTH_PT - m + tick, A4_HEIGHT_PT - m).lineTo(A4_WIDTH_PT - m, A4_HEIGHT_PT - m).lineTo(A4_WIDTH_PT - m, A4_HEIGHT_PT - m + tick).stroke();
  doc.restore();
}

function renderSingleCardQuadrant(doc, bounds, card) {

  const { x, y, width } = bounds;
  const headerHeight = 42;
  const gridHeight = 240;
  const demographicHeight = 18;
  const perforationY = y + headerHeight + gridHeight + demographicHeight;
  const stubHeight = CARD_HEIGHT_PT - (headerHeight + gridHeight + demographicHeight);
  const stubWidth = CARD_WIDTH_PT / 6;

  doc.save();

  // Outer card frame and header title
  doc.strokeColor('#000000').lineWidth(0.75).undash();
  doc.rect(x + 1, y + 1, width - 2, CARD_HEIGHT_PT - 2).stroke();

  doc.strokeColor('#666666').lineWidth(0.5);
  doc.moveTo(x + 4, y + 5).lineTo(x + width - 4, y + 5).stroke();
  doc.moveTo(x + 4, y + 8).lineTo(x + 40, y + 8).stroke();
  doc.moveTo(x + width - 40, y + 8).lineTo(x + width - 4, y + 8).stroke();

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
  doc.text('ITECHTIVITY 2027', x + 4, y + 12, { width: width - 8, align: 'center' });

  doc.font('Helvetica').fontSize(6).fillColor('#333333');
  doc.text('UNIVERSITY OF CALOOCAN CITY - CSD CAPSTONE', x + 4, y + 25, { width: width - 8, align: 'center' });

  doc.font('Courier-Bold').fontSize(6.5).fillColor('#000000');
  doc.text(`CARD SERIAL: #${card.cardSerial}`, x + 4, y + 34, { width: width - 8, align: 'center' });

  // 8x7 Booth Grid with central Master QR block (52 booths + 4-cell Master QR)
  const gridX = x + 3;
  const gridY = y + headerHeight;
  const gridW = width - 6;
  const cols = 8;
  const rows = 7;
  const cellW = gridW / cols;
  const cellH = gridHeight / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = gridX + c * cellW;
      const cy = gridY + r * cellH;
      const isCenterBlock = (c === 3 || c === 4) && (r === 2 || r === 3);

      if (isCenterBlock) {
        if (r === 2 && c === 3) {
          const masterW = cellW * 2;
          const masterH = cellH * 2;
          doc.strokeColor('#000000').lineWidth(0.65);
          doc.rect(cx + 0.5, cy + 0.5, masterW - 1, masterH - 1).stroke();

          // 1. "CSD" label enlarged by 30% (7.8pt) prominently on top
          const csdY = cy + 2.5;
          doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#000000');
          doc.text('CSD', cx + 1, csdY, { width: masterW - 2, align: 'center' });

          // 2. Vector QR Code sized for scannability (~44.5pt / 1.57cm)
          const qrSize = 44.5;
          const qrX = cx + (masterW - qrSize) / 2;
          const qrY = csdY + 10.5;
          renderVectorQr(doc, `MASTER:${card.cardSerial}`, qrX, qrY, qrSize);

          // 3. Card serial code directly below the QR
          const serialY = qrY + qrSize + 2.5;
          doc.font('Courier-Bold').fontSize(4.8).fillColor('#000000');
          doc.text(`#${card.cardSerial}`, cx + 1, serialY, {
            width: masterW - 2,
            align: 'center',
            lineBreak: false,
          });
        }
        continue;
      }

      doc.strokeColor('#888888').lineWidth(0.35);
      doc.rect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1).stroke();

      const boothCode = getBoothCode(r, c);
      if (!boothCode) continue;

      doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#000000');
      doc.text(boothCode, cx + 1, cy + 2.5, { width: cellW - 2, align: 'center' });

      doc.strokeColor('#bbbbbb').lineWidth(0.25);
      doc.rect(cx + 3, cy + 9.5, cellW - 6, cellH - 12.5).stroke();
      doc.font('Helvetica').fontSize(4.5).fillColor('#666666');
      doc.text('STAMP', cx + 3, cy + 15, { width: cellW - 6, align: 'center' });
    }
  }

  // Demographic fields and perforation divider
  const demoY = gridY + gridHeight + 3;
  doc.font('Helvetica').fontSize(6).fillColor('#000000');
  doc.text('Name: ______________________', x + 5, demoY);
  doc.text('Program/Yr/Sec: ________________', x + width / 2, demoY);

  doc.strokeColor('#000000').lineWidth(0.6).dash(3, { space: 2 });
  doc.moveTo(x + 1, perforationY).lineTo(x + width - 1, perforationY).stroke();

  // Render 6 detachable voting stubs with vector QR codes
  const stubY = perforationY + 1;
  const innerStubH = stubHeight - 2;

  for (let s = 0; s < card.stubs.length; s++) {
    const stub = card.stubs[s];
    const sx = x + s * stubWidth;

    if (s > 0) {
      doc.strokeColor('#555555').lineWidth(0.4).dash(2, { space: 2 });
      doc.moveTo(sx, stubY).lineTo(sx, stubY + innerStubH).stroke();
    }

    const qrSize = 32;
    const qrX = sx + (stubWidth - qrSize) / 2;
    const qrY = stubY + 3;

    renderVectorQr(doc, stub.qrPayload, qrX, qrY, qrSize);

    doc.undash();
    doc.font('Courier-Bold').fontSize(4.2).fillColor('#000000');
    doc.text(`#${stub.stubSerial}`, sx + 1, qrY + qrSize + 1.5, { width: stubWidth - 2, align: 'center' });

    if (stub.verificationCode) {
      doc.font('Courier-Bold').fontSize(4).fillColor('#222222');
      doc.text(`PIN:${stub.verificationCode}`, sx + 1, qrY + qrSize + 6.5, { width: stubWidth - 2, align: 'center' });
    }

    doc.font('Helvetica-Bold').fontSize(4.8).fillColor('#000000');
    doc.text(`SLOT ${stub.slotNumber}`, sx + 1, qrY + qrSize + 12, { width: stubWidth - 2, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(4.3).fillColor('#222222');
    doc.text(stub.awardTitle.toUpperCase(), sx + 1, qrY + qrSize + 18.5, {
      width: stubWidth - 2,
      align: 'center',
      lineGap: 0.5,
    });

    doc.font('Helvetica-Bold').fontSize(7).fillColor('#bbbbbb');
    doc.text('VOTE', sx + 1, stubY + innerStubH - 10, { width: stubWidth - 2, align: 'center' });
  }

  doc.restore();
}

export default async ({ req, res, log, error }) => {

  let payload = {};
  try {
    if (typeof req.body === 'string' && req.body.trim().length > 0) {
      payload = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body;
    }
  } catch (parseErr) {
    error(`Invalid JSON payload: ${parseErr.message}`);
    return res.json({ success: false, error: 'INVALID_JSON_PAYLOAD' }, 400);
  }

  const batchId = payload.batchId || null;
  const batchNumber = Number(payload.batchNumber || 1);
  const totalCards = Number(payload.totalCards || 20);
  const totalSheets = Math.ceil(totalCards / CARDS_PER_SHEET);
  const secretKey = process.env.EVENT_HMAC_SECRET;
  const fileName = payload.fileName || `bingo-batch-${batchNumber.toString().padStart(3, '0')}-cards-1-${totalCards}.pdf`;

  if (!secretKey || secretKey.length < 32) {
    error('Missing or weak EVENT_HMAC_SECRET');
    return res.json({ success: false, error: 'INVALID_HMAC_SECRET' }, 500);
  }

  const awardsList = Array.isArray(payload.awardsList) && payload.awardsList.length > 0
    ? payload.awardsList
    : [
        { slotNumber: 1, title: "People's Choice" },
        { slotNumber: 2, title: "Dream Team" },
        { slotNumber: 3, title: "Most Aesthetic Booth" },
        { slotNumber: 4, title: "Best Interactive Demonstration" },
        { slotNumber: 5, title: "Best Software Product" },
        { slotNumber: 6, title: "Best Innovation" },
      ];

  const appwriteEndpoint = process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1';
  const appwriteProjectId = process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027';
  const appwriteApiKey = process.env.APPWRITE_API_KEY;
  const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'bingo-cards-pdf';
  const databaseId = process.env.APPWRITE_DATABASE_ID || 'itech2027-db';
  const batchesCollectionId = process.env.APPWRITE_PDF_BATCHES_COLLECTION_ID || 'pdf_batches';
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

  try {
    log(`Starting vector PDF generation for Batch #${batchNumber} (${totalCards} cards, ${totalSheets} sheets)...`);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    let cardSequence = 1;

    for (let sheetIndex = 0; sheetIndex < totalSheets; sheetIndex++) {
      doc.addPage({ size: 'A4', margin: 0 });
      drawSheetGuidelines(doc);

      for (let quadIndex = 0; quadIndex < CARDS_PER_SHEET; quadIndex++) {
        if (cardSequence > totalCards) break;

        const colIndex = quadIndex % CARDS_PER_ROW;
        const rowIndex = Math.floor(quadIndex / CARDS_PER_ROW);
        const bounds = {
          x: MARGIN_PT + colIndex * CARD_WIDTH_PT,
          y: MARGIN_PT + rowIndex * CARD_HEIGHT_PT,
          width: CARD_WIDTH_PT,
          height: CARD_HEIGHT_PT,
        };

        const cardSerial = `B27-B${batchNumber.toString().padStart(2, '0')}-${cardSequence.toString().padStart(4, '0')}`;
        const stubs = awardsList.slice(0, 6).map((award) => {
          const stubSerial = `${cardSerial}-S${award.slotNumber}`;
          return {
            slotNumber: award.slotNumber,
            stubSerial,
            awardTitle: award.title,
            qrPayload: encodeStubPayload(stubSerial, award.slotNumber, secretKey),
            verificationCode: generateStubVerificationCode(stubSerial, award.slotNumber, secretKey),
          };
        });

        renderSingleCardQuadrant(doc, bounds, { cardSerial, stubs });
        cardSequence++;
      }
    }

    doc.end();

    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    let uploadedFileId = ID.unique();

    if (appwriteApiKey) {
      const client = new Client()
        .setEndpoint(appwriteEndpoint)
        .setProject(appwriteProjectId)
        .setKey(appwriteApiKey);

      const storage = new Storage(client);
      const databases = new Databases(client);

      const inputFile = InputFile.fromBuffer(pdfBuffer, fileName);
      const uploaded = await storage.createFile(bucketId, uploadedFileId, inputFile);
      uploadedFileId = uploaded.$id;
      log(`Uploaded PDF to Appwrite Storage bucket ${bucketId}: ${uploadedFileId} (${pdfBuffer.length} bytes)`);

      // Update Supabase PdfBatch record to COMPLETED
      if (databaseUrl && batchId) {
        const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
        try {
          await pool.query(
            `UPDATE "PdfBatch" SET "status" = 'COMPLETED', "fileId" = $1, "fileSize" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
            [uploadedFileId, pdfBuffer.length, batchId]
          );
          log(`Updated Supabase PdfBatch ${batchId} to COMPLETED`);
        } finally {
          await pool.end();
        }
      }

      // Broadcast batch completion event over Appwrite Realtime WebSockets
      await databases.createDocument(databaseId, batchesCollectionId, ID.unique(), {
        batchId: batchId || uploadedFileId,
        batchNumber,
        status: 'COMPLETED',
        fileId: uploadedFileId,
        fileName,
        totalCards,
        totalSheets,
        fileSize: pdfBuffer.length,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      batchId,
      batchNumber,
      fileId: uploadedFileId,
      fileName,
      totalCards,
      totalSheets,
      fileSize: pdfBuffer.length,
    });
  } catch (err) {
    error(`Async PDF Generation Failed: ${err.message}`);

    if (databaseUrl && batchId) {
      const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
      try {
        await pool.query(
          `UPDATE "PdfBatch" SET "status" = 'FAILED', "updatedAt" = NOW() WHERE "id" = $1`,
          [batchId]
        );
      } catch (dbErr) {
        error(`Failed to mark batch as FAILED in DB: ${dbErr.message}`);
      } finally {
        await pool.end();
      }
    }

    return res.json({ success: false, error: 'PDF_GENERATION_FAILED' }, 500);
  }
};
