import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/session';
import { uploadBoothLogoToAppwrite } from '@/lib/appwrite/server';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';
import { getClientIp } from '@/lib/security/rate-limiter';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]);

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

export async function POST(request: Request) {

  const session = await getCurrentUser();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'NO_FILE_PROVIDED', message: 'A valid image file is required.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FILE_TYPE',
          message: 'Allowed file types: PNG, JPEG, WEBP, SVG.',
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'FILE_TOO_LARGE',
          message: 'Maximum file size is 3MB.',
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sanitize extension and construct unique filename
    const ext = path.extname(file.name).toLowerCase() || '.png';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext) ? ext : '.png';
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const sanitizedFileName = `booth-logo-${Date.now()}-${uniqueId}${safeExt}`;

    let logoUrl: string | null = null;
    let fileId: string | null = null;

    // Primary: Appwrite Cloud Storage (booth-logos bucket)
    const appwriteResult = await uploadBoothLogoToAppwrite(buffer, sanitizedFileName);
    if (appwriteResult) {
      logoUrl = appwriteResult.viewUrl;
      fileId = appwriteResult.fileId;
    } else {
      // Local development or stateless fallback
      try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'booths');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const localFilePath = path.join(uploadDir, sanitizedFileName);
        fs.writeFileSync(localFilePath, buffer);
        logoUrl = `/uploads/booths/${sanitizedFileName}`;
      } catch (fsErr) {
        console.warn('Local upload directory not writable, falling back to data URI:', fsErr);
        logoUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
      }
    }

    const clientIp = getClientIp(request);
    await recordAuditLog({
      userId: session.userId,
      actorName: session.fullName,
      actorEmail: session.email,
      actorRole: session.role,
      action: 'ADMIN_BOOTH_LOGO_UPLOAD',
      resource: 'BOOTHS',
      summary: createHumanReadableSummary('ADMIN_BOOTH_LOGO_UPLOAD', {
        actorName: session.fullName,
        actorRole: session.role,
        details: `Uploaded logo ${sanitizedFileName}`,
      }),
      details: {
        fileName: sanitizedFileName,
        fileSize: file.size,
        mimeType: file.type,
        storageType: fileId ? 'APPWRITE_STORAGE' : 'LOCAL_STORAGE',
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      url: logoUrl,
      fileName: sanitizedFileName,
    });
  } catch (error) {
    console.error('Failed to upload booth logo:', error);
    return NextResponse.json(
      { success: false, error: 'UPLOAD_FAILED', message: 'Failed to process and store image file.' },
      { status: 500 }
    );
  }
}
