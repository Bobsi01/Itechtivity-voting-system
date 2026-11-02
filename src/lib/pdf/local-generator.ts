import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import prisma from '@/lib/db/prisma';
import { generateA4BingoPdfBuffer } from './a4-sheet-renderer';
import { generateStubSignature } from '@/lib/crypto/stub-tokens';
import { uploadBatchPdfToAppwrite } from '@/lib/appwrite/server';
import { CardStatus, StubStatus } from '@prisma/client';
import { loadPrintableBoothLogos } from './booth-logos';

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
 * Reserves a batch number before rendering, then publishes its inventory atomically.
 */
export async function generateCardBatch(
  params: GenerateBatchParams
): Promise<GeneratedBatchResult> {

  const { totalCards } = params;
  if (!Number.isInteger(totalCards) || totalCards < 4 || totalCards > 200 || totalCards % 4 !== 0) {
    throw new Error('INVALID_BATCH_SIZE: Use a multiple of four between 4 and 200 cards.');
  }

  if (params.batchNumber !== undefined
    && (!Number.isSafeInteger(params.batchNumber) || params.batchNumber < 1 || params.batchNumber > 2147483647)) {
    throw new Error('INVALID_BATCH_NUMBER: Use a positive safe integer.');
  }

  const secretKey = process.env.EVENT_HMAC_SECRET;
  if (!secretKey || secretKey.length < 32) {
    throw new Error('CRITICAL_SECURITY_ERROR: EVENT_HMAC_SECRET environment variable is missing or shorter than 32 characters.');
  }

  const reservedBatch = await prisma.$transaction(async (tx) => {
    // Transaction-level locking also works through PgBouncer transaction pooling.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(2027, 1)::text`;
    const latestBatch = await tx.pdfBatch.findFirst({
      orderBy: { batchNumber: 'desc' },
    });
    const batchNumber = params.batchNumber ?? (latestBatch?.batchNumber ?? 0) + 1;
    const fileName = `bingo-batch-${batchNumber.toString().padStart(3, '0')}-cards-1-${totalCards}.pdf`;
    return tx.pdfBatch.create({
      data: {
        batchNumber,
        fileName,
        totalCards,
        totalSheets: totalCards / 4,
        status: 'GENERATING',
      },
    });
  });

  const { batchNumber, fileName } = reservedBatch;
  try {

    const awards = await prisma.award.findMany({
      orderBy: { slotNumber: 'asc' },
      take: 6,
    });

    const awardsList = awards.map((a) => ({
      slotNumber: a.slotNumber,
      title: a.title,
    }));

    const boothsWithLogos = await prisma.booth.findMany({
      where: { logoUrl: { not: null } },
      select: { code: true, logoUrl: true },
      orderBy: { code: 'asc' },
      take: 100,
    });
    const boothLogos = await loadPrintableBoothLogos(boothsWithLogos);

    const { buffer, totalSheets } = await generateA4BingoPdfBuffer({
      batchNumber,
      startCardNumber: 1,
      totalCards,
      awardsList,
      secretKey,
      boothLogos,
    });

    const fileSizeBytes = buffer.length;

    // SEC-03: Cache in private server directory outside public/ for local/hybrid access
    if (process.env.NODE_ENV === 'development') {
      const storageDir = path.join(process.cwd(), 'storage', 'private-pdfs');
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      const filePath = path.join(storageDir, fileName);
      fs.writeFileSync(filePath, buffer);
    }

    // Upload generated PDF to Appwrite Cloud Storage (bingo-cards-pdf bucket)
    const appwriteFileId = await uploadBatchPdfToAppwrite(buffer, fileName);
    if (!appwriteFileId && process.env.NODE_ENV !== 'development') {
      throw new Error('PDF_STORAGE_FAILED: Durable PDF upload did not complete.');
    }

    // Persist batch and card entities in Supabase PostgreSQL with bulk inserts
    const createdBatch = await prisma.$transaction(async (tx) => {

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
          pdfBatchId: reservedBatch.id,
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

      return tx.pdfBatch.update({
        where: { id: reservedBatch.id },
        data: {
          fileSize: fileSizeBytes,
          fileId: appwriteFileId,
          totalSheets,
          status: 'COMPLETED',
        },
      });
    });

    return {
      batchId: createdBatch.id,
      batchNumber: createdBatch.batchNumber,
      fileName,
      totalCards,
      totalSheets,
      fileSizeBytes,
      publicUrl: `/api/production/files/${fileName}`,
    };
  } catch (error) {
    try {
      await prisma.pdfBatch.updateMany({
        where: { id: reservedBatch.id, status: 'GENERATING' },
        data: { status: 'FAILED' },
      });
    } catch {
      console.error('PDF batch failure status could not be persisted.');
    }
    throw error;
  }
}
