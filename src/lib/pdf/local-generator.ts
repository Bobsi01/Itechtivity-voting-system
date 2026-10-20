import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import prisma from '@/lib/db/prisma';
import { generateA4BingoPdfBuffer } from './a4-sheet-renderer';
import { generateStubSignature } from '@/lib/crypto/stub-tokens';
import { triggerAppwritePdfGeneration, uploadBatchPdfToAppwrite } from '@/lib/appwrite/server';
import { CardStatus, StubStatus } from '@prisma/client';

export interface GenerateBatchParams {
  totalCards: number;
  batchNumber?: number;
}

export interface GeneratedBatchResult {
  batchId: string;
  batchNumber: number;
  fileName: string;
  totalCards: number;
  totalSheets: number;
  fileSizeBytes: number;
  publicUrl: string;
  executionId?: string;
}

/**
 * Executes a full card batch generation:
 * 1. Queries active awards from Supabase PostgreSQL.
 * 2. Records PdfBatch, BingoCard, and TicketStub entities using high-speed bulk inserts.
 * 3. Triggers the Appwrite Serverless Function (generate-bingo-pdf) asynchronously (xasync: true)
 *    to render the vector A4 PDF in the background, upload to Appwrite Storage, and broadcast via WebSocket.
 * 4. Caches a local copy when running on a writable filesystem for immediate local preview and E2E testing.
 */
export async function generateCardBatch(
  params: GenerateBatchParams
): Promise<GeneratedBatchResult> {

  const { totalCards } = params;
  const secretKey = process.env.EVENT_HMAC_SECRET;
  if (!secretKey || secretKey.length < 32) {
    throw new Error('CRITICAL_SECURITY_ERROR: EVENT_HMAC_SECRET environment variable is missing or shorter than 32 characters.');
  }

  let batchNumber = params.batchNumber;
  if (!batchNumber) {
    const latestBatch = await prisma.pdfBatch.findFirst({
      orderBy: { batchNumber: 'desc' },
    });
    batchNumber = (latestBatch?.batchNumber ?? 0) + 1;
  }

  const awards = await prisma.award.findMany({
    orderBy: { slotNumber: 'asc' },
    take: 6,
  });

  const awardsList = awards.map((a) => ({
    slotNumber: a.slotNumber,
    title: a.title,
  }));

  const { buffer, totalSheets } = await generateA4BingoPdfBuffer({
    batchNumber,
    startCardNumber: 1,
    totalCards,
    awardsList,
    secretKey,
  });

  const fileName = `bingo-batch-${batchNumber.toString().padStart(3, '0')}-cards-1-${totalCards}.pdf`;
  const fileSizeBytes = buffer.length;

  // SEC-03: Cache in private server directory outside public/ for local/hybrid access
  try {
    const storageDir = path.join(process.cwd(), 'storage', 'private-pdfs');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const filePath = path.join(storageDir, fileName);
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    console.warn('Local PDF cache write skipped (read-only or ephemeral filesystem):', err);
  }

  // Upload generated PDF to Appwrite Cloud Storage (bingo-cards-pdf bucket)
  let appwriteFileId: string | null = null;
  try {
    appwriteFileId = await uploadBatchPdfToAppwrite(buffer, fileName);
  } catch (err) {
    console.warn('Appwrite Cloud storage upload fallback:', err);
  }

  // Persist batch and card entities in Supabase PostgreSQL with bulk inserts
  const createdBatch = await prisma.$transaction(async (tx) => {

    const pdfBatch = await tx.pdfBatch.create({
      data: {
        batchNumber,
        fileName,
        fileSize: fileSizeBytes,
        fileId: appwriteFileId,
        totalCards,
        totalSheets,
        status: 'COMPLETED',
      },
    });

    const cardsToInsert: Array<{
      id: string;
      cardSerial: string;
      masterQrHash: string;
      pdfBatchId: string;
      status: CardStatus;
    }> = [];

    const stubsToInsert: Array<{
      id: string;
      bingoCardId: string;
      slotNumber: number;
      awardId: string;
      stubSerial: string;
      signatureHash: string;
      status: StubStatus;
    }> = [];

    for (let c = 1; c <= totalCards; c++) {
      const cardId = crypto.randomUUID();
      const cardSerial = `B27-B${batchNumber.toString().padStart(2, '0')}-${c.toString().padStart(4, '0')}`;
      const masterQrHash = `MASTER:${cardSerial}`;

      cardsToInsert.push({
        id: cardId,
        cardSerial,
        masterQrHash,
        pdfBatchId: pdfBatch.id,
        status: CardStatus.GENERATED,
      });

      for (const award of awards) {
        const stubSerial = `${cardSerial}-S${award.slotNumber}`;
        const signatureHash = generateStubSignature(stubSerial, award.slotNumber, secretKey);

        stubsToInsert.push({
          id: crypto.randomUUID(),
          bingoCardId: cardId,
          slotNumber: award.slotNumber,
          awardId: award.id,
          stubSerial,
          signatureHash,
          status: StubStatus.INACTIVE,
        });
      }
    }

    await tx.bingoCard.createMany({
      data: cardsToInsert,
    });

    await tx.ticketStub.createMany({
      data: stubsToInsert,
    });

    return pdfBatch;
  });

  // Trigger asynchronous Appwrite Serverless Function execution (xasync: true)
  const asyncTrigger = await triggerAppwritePdfGeneration({
    batchId: createdBatch.id,
    batchNumber: createdBatch.batchNumber,
    totalCards,
    fileName,
    awardsList,
  });

  return {
    batchId: createdBatch.id,
    batchNumber: createdBatch.batchNumber,
    fileName,
    totalCards,
    totalSheets,
    fileSizeBytes,
    publicUrl: `/api/production/files/${fileName}`,
    executionId: asyncTrigger.executionId,
  };
}
