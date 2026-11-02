import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import type { Role } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/db/prisma';

export interface SessionPayload {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  boothId: string | null;
  expiresAt: number;
  accountVersion: string;
}

const SessionPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().max(320),
  fullName: z.string().min(1).max(200),
  role: z.enum(['ADMIN', 'PRODUCTION', 'REGISTRATION', 'EXHIBITOR']),
  boothId: z.string().uuid().nullable(),
  expiresAt: z.number().int().positive().finite(),
  accountVersion: z.string().datetime(),
}).strict();

const SESSION_COOKIE_NAME = 'itech2027_session';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getSessionSecret(): string {

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('CRITICAL: NEXTAUTH_SECRET environment variable is missing or shorter than 32 characters.');
  }

  return secret;
}

/**
 * Signs and encodes a session payload into a tamper-proof cookie string with HMAC-SHA256.
 */
export function signSession(payload: Omit<SessionPayload, 'expiresAt'>): string {

  const secret = getSessionSecret();
  const fullPayload: SessionPayload = {
    ...payload,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };

  const payloadJson = JSON.stringify(fullPayload);
  const payloadBase64 = Buffer.from(payloadJson, 'utf8').toString('base64url');

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadBase64);
  const signature = hmac.digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies and decodes a session cookie string.
 * Uses timing-safe comparisons with buffer length checks.
 */
export function verifySession(sessionCookie: string): SessionPayload | null {

  try {
    if (sessionCookie.length > 4096) {
      return null;
    }

    const secret = getSessionSecret();
    const parts = sessionCookie.split('.');

    if (parts.length !== 2) {
      return null;
    }

    const [payloadBase64, providedSig] = parts;

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadBase64);
    const expectedSig = hmac.digest('base64url');

    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const providedBuf = Buffer.from(providedSig, 'utf8');

    // Buffer length check to prevent Node.js timingSafeEqual runtime exception
    if (expectedBuf.byteLength !== providedBuf.byteLength) {
      return null;
    }

    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const parsed = SessionPayloadSchema.safeParse(JSON.parse(payloadJson));
    if (!parsed.success) {
      return null;
    }
    const payload = parsed.data;

    if (Date.now() >= payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sets the authenticated session cookie on the incoming response.
 */
export async function setSessionCookie(payload: Omit<SessionPayload, 'expiresAt'>): Promise<void> {

  const cookieStore = await cookies();
  const token = signSession(payload);

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60,
  });
}

/**
 * Clears the session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Retrieves the currently authenticated user from the session cookie.
 */
export async function getCurrentUser(): Promise<SessionPayload | null> {

  const session = await getVerifiedSessionClaims();
  if (!session) return null;

  return resolveCurrentAccount(session);
}

// Claims alone do not authorize mutations; callers must also resolve current account state.
export async function getVerifiedSessionClaims(): Promise<SessionPayload | null> {

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  return verifySession(sessionCookie);
}

async function resolveCurrentAccount(session: SessionPayload): Promise<SessionPayload | null> {

  // Authenticate the cookie before this account lookup; QR verification still precedes ticket database operations.
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        boothId: true,
        updatedAt: true,
      },
    });

    // Account edits revoke existing sessions, including password resets and booth reassignment.
    if (
      !user ||
      user.updatedAt.toISOString() !== session.accountVersion ||
      user.role !== session.role ||
      user.boothId !== session.boothId
    ) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      boothId: user.boothId,
      expiresAt: session.expiresAt,
      accountVersion: session.accountVersion,
    };
  } catch {
    console.error('Session account verification unavailable.');
    return null;
  }
}
