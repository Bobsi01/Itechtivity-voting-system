import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export async function GET() {

  const session = await getCurrentUser();
  if (!session || (session.role !== 'PRODUCTION' && session.role !== 'ADMIN')) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED' },
      { status: 403 }
    );
  }

  try {
    const batches = await prisma.pdfBatch.findMany({
      orderBy: { batchNumber: 'desc' },
      include: {
        _count: { select: { cards: true } },
        cards: {
          select: { cardSerial: true },
          orderBy: { cardSerial: 'asc' },
        },
      },
    });

    // SEC-03: Private storage directory outside public/
    const storageDir = path.join(process.cwd(), 'storage', 'private-pdfs');

    const files = batches.map((batch) => {
      const localPath = path.join(storageDir, batch.fileName);
      const exists = fs.existsSync(localPath);
      let calculatedSize = batch.fileSize ?? 0;

      if (exists && calculatedSize === 0) {
        calculatedSize = fs.statSync(localPath).size;
      }

      const firstSerial = batch.cards[0]?.cardSerial;
      const lastSerial = batch.cards[batch.cards.length - 1]?.cardSerial;
      const serialRange = firstSerial && lastSerial ? `${firstSerial} — ${lastSerial}` : undefined;

      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        fileName: batch.fileName,
        totalCards: batch.totalCards,
        totalSheets: batch.totalSheets,
        fileSizeBytes: calculatedSize,
        status: batch.status,
        serialRange,
        createdAt: batch.createdAt.toISOString(),
        downloadUrl: `/api/production/files/${batch.fileName}?download=1`,
        previewUrl: `/api/production/files/${batch.fileName}`,
      };
    });

    return NextResponse.json({
      success: true,
      files,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'FAILED_TO_LIST_FILES' },
      { status: 500 }
    );
  }
}
