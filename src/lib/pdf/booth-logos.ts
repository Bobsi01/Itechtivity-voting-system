import fs from 'node:fs/promises';
import path from 'node:path';
import { downloadBoothLogoFromAppwrite } from '@/lib/appwrite/server';

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_LOGO_BYTES = 16 * 1024 * 1024;
const MAX_LOGO_LOOKUPS = 100;

interface BoothLogoSource {
  code: string;
  logoUrl: string | null;
}

function isPrintableImage(buffer: Buffer): boolean {

  return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255);
}

function getManagedFileId(rawUrl: string): string | null {

  try {
    const endpoint = new URL(process.env.APPWRITE_ENDPOINT || 'https://sgp.cloud.appwrite.io/v1');
    const candidate = new URL(rawUrl);
    const projectId = process.env.APPWRITE_PROJECT_ID || 'itechtivity-2027';
    const bucketId = process.env.APPWRITE_BOOTH_LOGOS_BUCKET_ID || 'booth-logos';
    const prefix = `${endpoint.pathname.replace(/\/$/, '')}/storage/buckets/${bucketId}/files/`;

    if (candidate.origin !== endpoint.origin || candidate.username || candidate.password
      || candidate.hash || !candidate.pathname.startsWith(prefix)
      || candidate.searchParams.get('project') !== projectId
      || [...candidate.searchParams.keys()].length !== 1) {
      return null;
    }

    const suffix = candidate.pathname.slice(prefix.length);
    const match = /^([a-zA-Z0-9][a-zA-Z0-9._-]{0,35})\/view$/.exec(suffix);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function readLocalLogo(rawUrl: string): Promise<Buffer | null> {

  const match = /^\/uploads\/booths\/(booth-logo-\d{13}-[a-f0-9]{16}\.(?:png|jpe?g))$/.exec(rawUrl);
  if (!match) return null;

  const uploadDirectory = path.resolve(process.cwd(), 'public', 'uploads', 'booths');
  const expectedPath = path.join(uploadDirectory, match[1]);
  const realDirectory = await fs.realpath(uploadDirectory);
  const realFile = await fs.realpath(expectedPath);

  // Reject symlinked directories and files, including ancestors of the upload directory.
  if (realDirectory !== uploadDirectory || realFile !== expectedPath
    || (await fs.lstat(expectedPath)).isSymbolicLink()) {
    return null;
  }

  const file = await fs.open(realFile, 'r');
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > MAX_LOGO_BYTES) return null;

    const buffer = Buffer.alloc(MAX_LOGO_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return bytesRead <= MAX_LOGO_BYTES ? buffer.subarray(0, bytesRead) : null;
  } finally {
    await file.close();
  }
}

async function readBoothLogo(rawUrl: string): Promise<Buffer | null> {

  if (rawUrl.startsWith('data:')) {
    if (rawUrl.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 32) return null;
    const match = /^data:image\/(?:png|jpeg);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(rawUrl);
    return match ? Buffer.from(match[1], 'base64') : null;
  }

  if (rawUrl.startsWith('/')) return readLocalLogo(rawUrl);

  const fileId = getManagedFileId(rawUrl);
  return fileId ? downloadBoothLogoFromAppwrite(fileId) : null;
}

export async function loadPrintableBoothLogos(booths: BoothLogoSource[]): Promise<Record<string, Buffer>> {

  const logos: Record<string, Buffer> = {};
  let totalBytes = 0;
  for (const booth of booths.slice(0, MAX_LOGO_LOOKUPS)) {
    if (!booth.logoUrl) continue;

    try {
      const buffer = await readBoothLogo(booth.logoUrl);
      if (!buffer || buffer.length > MAX_LOGO_BYTES || !isPrintableImage(buffer)) {
        console.warn('PDF logo skipped: only bounded PNG/JPEG images from managed storage or local uploads are supported.');
        continue;
      }

      if (totalBytes + buffer.length > MAX_TOTAL_LOGO_BYTES) {
        console.warn('PDF logo preload stopped: total image budget reached.');
        break;
      }

      logos[booth.code] = buffer;
      totalBytes += buffer.length;
    } catch {
      console.warn('PDF logo skipped: managed image could not be read safely.');
    }
  }

  return logos;
}
