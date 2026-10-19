import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { downloadBatchPdfFromAppwrite } from '@/lib/appwrite/server';
import { generateA4BingoPdfBuffer } from '@/lib/pdf/a4-sheet-renderer';

interface RouteContext {
  params: Promise<{
    filename: string;
  }>;
}

/**
 * SEC-03: Authenticated PDF file delivery route.
 * Restricts access exclusively to PRODUCTION and ADMIN roles.
 * Guards against directory traversal via strict regex validation.
 * Falls back to Appwrite Cloud Storage or deterministic HMAC regeneration when ephemeral disk is empty.
 */
export async function GET(request: Request, context: RouteContext) {
  const session = await getCurrentUser();
  if (!session || (session.role !== 'PRODUCTION' && session.role !== 'ADMIN')) {
    return NextResponse.json(
      { success: false, error: 'UNAUTHORIZED_FILE_ACCESS' },
      { status: 403 }
    );
  }

  const rawFilename = (await context.params).filename;
  const filename = rawFilename.endsWith('.pdf') ? rawFilename : `${rawFilename}.pdf`;

  // Strict regex guard against path traversal attacks (e.g. ../ or null bytes)
  const isSafeFilename = /^[a-zA-Z0-9_\-]+\.pdf$/.test(filename);
  if (!isSafeFilename) {
    return NextResponse.json(
      { success: false, error: 'INVALID_FILENAME' },
      { status: 400 }
    );
  }

  const storageDir = path.join(process.cwd(), 'storage', 'private-pdfs');
  const filePath = path.join(storageDir, filename);

  // Path resolution guard to ensure the resolved path remains inside storageDir
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(storageDir))) {
    return NextResponse.json(
      { success: false, error: 'INVALID_PATH' },
      { status: 400 }
    );
  }

  let fileBuffer: Buffer | null = null;

  if (fs.existsSync(resolvedPath)) {
    fileBuffer = fs.readFileSync(resolvedPath);
  } else {
    // Fallback 1: Appwrite Cloud Storage if local ephemeral disk was cleared
    const batchRecord = await prisma.pdfBatch.findFirst({
      where: { fileName: filename },
      select: {
        batchNumber: true,
        totalCards: true,
        fileId: true,
      },
    });

    if (batchRecord?.fileId) {
      fileBuffer = await downloadBatchPdfFromAppwrite(batchRecord.fileId);
    }

    // Fallback 2: Deterministic vector PDF regeneration from database batch parameters
    if (!fileBuffer && batchRecord && process.env.EVENT_HMAC_SECRET) {
      const awards = await prisma.award.findMany({
        orderBy: { slotNumber: 'asc' },
        take: 6,
      });

      const rendered = await generateA4BingoPdfBuffer({
        batchNumber: batchRecord.batchNumber,
        startCardNumber: 1,
        totalCards: batchRecord.totalCards,
        awardsList: awards.map((a) => ({ slotNumber: a.slotNumber, title: a.title })),
        secretKey: process.env.EVENT_HMAC_SECRET,
      });

      fileBuffer = rendered.buffer;

      try {
        if (!fs.existsSync(storageDir)) {
          fs.mkdirSync(storageDir, { recursive: true });
        }
        fs.writeFileSync(resolvedPath, fileBuffer);
      } catch {
        // Ignore read-only filesystem errors on stateless dynos
      }
    }
  }

  if (!fileBuffer) {
    return NextResponse.json(
      { success: false, error: 'FILE_NOT_FOUND' },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const isDownload = searchParams.get('download') === '1';

  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': fileBuffer.byteLength.toString(),
      'Content-Disposition': isDownload ? `attachment; filename="${filename}"` : 'inline',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy':
        "default-src 'self' blob: data: chrome-extension:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: chrome-extension:; style-src 'self' 'unsafe-inline' chrome-extension:; img-src 'self' blob: data: chrome-extension:; object-src 'self' blob: data: chrome-extension:; frame-src 'self' blob: data: chrome-extension:; frame-ancestors 'self';",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
