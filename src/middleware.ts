import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function bufferToBase64Url(buffer: ArrayBuffer): string {

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function timingSafeCompareStrings(expected: string, provided: string): boolean {

  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const providedBytes = encoder.encode(provided);

  // Guard byte lengths before constant-time XOR comparison
  if (expectedBytes.byteLength !== providedBytes.byteLength) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < expectedBytes.byteLength; i++) {
    diff |= expectedBytes[i] ^ providedBytes[i];
  }

  return diff === 0;
}

async function verifyEdgeTokenSignature(
  token: string,
  secret: string
): Promise<{ isValid: boolean; payload?: { role: string; expiresAt: number } }> {

  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { isValid: false };
    }

    const [payloadBase64, providedSig] = parts;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payloadBase64)
    );

    const expectedSig = bufferToBase64Url(signatureBuffer);

    if (!timingSafeCompareStrings(expectedSig, providedSig)) {
      return { isValid: false };
    }

    const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { role: string; expiresAt: number };

    return { isValid: true, payload };
  } catch {
    return { isValid: false };
  }
}

export async function middleware(request: NextRequest) {

  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('itech2027_session')?.value;

  // Handle protected API routes with perimeter JSON responses
  if (pathname.startsWith('/api/')) {
    const publicApiRoutes = [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/cards/validate',
    ];

    if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
      return NextResponse.next();
    }

    if (!sessionCookie) {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    const secret = process.env.NEXTAUTH_SECRET || '';
    if (!secret) {
      return NextResponse.json({ success: false, error: 'SERVER_MISCONFIGURED' }, { status: 500 });
    }

    const verification = await verifyEdgeTokenSignature(sessionCookie, secret);
    if (!verification.isValid || !verification.payload) {
      return NextResponse.json({ success: false, error: 'INVALID_SESSION_SIGNATURE' }, { status: 401 });
    }

    const session = verification.payload;
    if (Date.now() > session.expiresAt) {
      return NextResponse.json({ success: false, error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    // Role boundaries for protected API routes
    if (pathname.startsWith('/api/admin') && session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
    }

    if (
      pathname.startsWith('/api/production') &&
      session.role !== 'PRODUCTION' &&
      session.role !== 'ADMIN'
    ) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
    }

    if (
      pathname.startsWith('/api/registration') &&
      session.role !== 'REGISTRATION' &&
      session.role !== 'ADMIN'
    ) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
    }

    if (pathname.startsWith('/api/vote') && session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
    }

    if (
      pathname.startsWith('/api/booths') &&
      session.role !== 'EXHIBITOR' &&
      session.role !== 'PRODUCTION' &&
      session.role !== 'ADMIN'
    ) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
    }

    return NextResponse.next();
  }

  // Handle protected page viewports with redirect to login
  const protectedPaths = ['/admin', '/production', '/registration', '/exhibitor', '/presentation'];
  const isProtected = protectedPaths.some((prefix) => pathname.startsWith(prefix));

  if (!isProtected) {
    return NextResponse.next();
  }

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const secret = process.env.NEXTAUTH_SECRET || '';
  if (!secret) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Cryptographic HMAC signature verification in Edge Middleware (SEC-01)
  const verification = await verifyEdgeTokenSignature(sessionCookie, secret);
  if (!verification.isValid || !verification.payload) {
    return NextResponse.redirect(new URL('/login?error=INVALID_SESSION_SIGNATURE', request.url));
  }

  const session = verification.payload;

  if (Date.now() > session.expiresAt) {
    return NextResponse.redirect(new URL('/login?error=SESSION_EXPIRED', request.url));
  }

  // Role-based page boundary enforcement
  if ((pathname.startsWith('/admin') || pathname.startsWith('/presentation')) && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login?error=UNAUTHORIZED_ROLE', request.url));
  }

  if (pathname.startsWith('/production') && session.role !== 'PRODUCTION' && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login?error=UNAUTHORIZED_ROLE', request.url));
  }

  if (pathname.startsWith('/registration') && session.role !== 'REGISTRATION' && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login?error=UNAUTHORIZED_ROLE', request.url));
  }

  if (pathname.startsWith('/exhibitor') && session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/login?error=UNAUTHORIZED_ROLE', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin',
    '/admin/:path*',
    '/production',
    '/production/:path*',
    '/registration',
    '/registration/:path*',
    '/exhibitor',
    '/exhibitor/:path*',
    '/presentation',
    '/presentation/:path*',
    '/api/:path*',
  ],
};
