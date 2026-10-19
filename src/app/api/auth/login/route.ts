import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db/prisma';
import { setSessionCookie } from '@/lib/auth/session';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';
import { recordAuditLog, createHumanReadableSummary } from '@/lib/audit/log';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Precomputed bcrypt hash used to normalize execution time against user enumeration (SEC-09)
const DUMMY_BCRYPT_HASH = '$2a$10$w095F9wY41R5cR42B8s1..4bEslN2D82W9.K8hR8v1bE5kQz2oG7W';

export async function POST(request: Request) {

  const clientIp = getClientIp(request);
  const rateLimitKey = `login:${clientIp}`;
  // Enforce maximum 5 login attempts per 5 minutes per client IP
  const rateCheck = rateLimiter.check(rateLimitKey, 5, 5 * 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'TOO_MANY_ATTEMPTS',
        message: `Too many failed login attempts. Please retry in ${rateCheck.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rateCheck.retryAfterSeconds || 60) },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = LoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CREDENTIALS_FORMAT' },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const emailRateKey = `login-email:${normalizedEmail}`;
    const emailRateCheck = rateLimiter.check(emailRateKey, 8, 5 * 60 * 1000);

    if (!emailRateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'TOO_MANY_ATTEMPTS',
          message: `Too many failed login attempts. Please retry in ${emailRateCheck.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(emailRateCheck.retryAfterSeconds || 60) },
        }
      );
    }

    // Retrieve user and active booth association
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { booth: true },
    });

    if (!user) {
      // SEC-09: Perform dummy bcrypt comparison to neutralize timing side-channel attacks
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);

      await recordAuditLog({
        action: 'AUTH_LOGIN_FAILED',
        resource: 'AUTH',
        summary: createHumanReadableSummary('AUTH_LOGIN_FAILED', {
          actorEmail: email,
        }),
        details: { attemptedEmail: email, reason: 'USER_NOT_FOUND' },
        ipAddress: clientIp,
      });

      return NextResponse.json(
        { success: false, error: 'INVALID_EMAIL_OR_PASSWORD' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await recordAuditLog({
        userId: user.id,
        actorName: user.fullName,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'AUTH_LOGIN_FAILED',
        resource: 'AUTH',
        summary: createHumanReadableSummary('AUTH_LOGIN_FAILED', {
          actorName: user.fullName,
          actorEmail: user.email,
          actorRole: user.role,
        }),
        details: { attemptedEmail: email, reason: 'INVALID_PASSWORD' },
        ipAddress: clientIp,
      });

      return NextResponse.json(
        { success: false, error: 'INVALID_EMAIL_OR_PASSWORD' },
        { status: 401 }
      );
    }

    // Reset rate limiters on successful login
    rateLimiter.reset(rateLimitKey);
    rateLimiter.reset(emailRateKey);

    // Set HTTP-only encrypted session cookie
    await setSessionCookie({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      boothId: user.boothId,
    });

    await recordAuditLog({
      userId: user.id,
      actorName: user.fullName,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'AUTH_LOGIN_SUCCESS',
      resource: 'AUTH',
      summary: createHumanReadableSummary('AUTH_LOGIN_SUCCESS', {
        actorName: user.fullName,
        actorEmail: user.email,
        actorRole: user.role,
      }),
      details: {
        role: user.role,
        boothCode: user.booth?.code ?? null,
      },
      ipAddress: clientIp,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        boothId: user.boothId,
        boothCode: user.booth?.code ?? null,
      },
    });
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
