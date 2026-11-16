---
name: nextjs-app-router
description: >-
  Provides best practices, patterns, and boundaries for Next.js 16 App Router.
  Use when creating or modifying routes, Edge Middleware, Server Components, Client Components,
  or API Route Handlers in the Next.js App Router. Do not use for visual styling,
  cryptographic token hashing, or PDF rendering layout.
---

# Next.js 16 App Router Engineering Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Component Boundary Hierarchy
1. **Server Components by Default:** Fetch initial data or verify user sessions directly on the server (`src/app/exhibitor/page.tsx`, `src/app/admin/page.tsx`, `src/app/production/page.tsx`, `src/app/registration/page.tsx`).
2. **Push `'use client'` to Leaf/Workspace Components:** Only mark components requiring browser state or hardware APIs as `'use client'` (`src/components/exhibitor/mobile-scanner.tsx`, `src/components/ui/qr-scanner.tsx`, `src/components/notifications/version-update-modal.tsx`).
3. **Never Pass Server-Only Secrets Across Boundaries:** Never serialize Prisma `User.passwordHash`, `TicketStub.signatureHash`, or environment secrets to Client Components. Return explicit DTOs.

## 2. Async Request APIs (`params` & `searchParams`)

In Next.js 16 (`next@^16.4.1` in `package.json`), both page `searchParams`/`params` and dynamic route `context.params` are Promises and must be awaited:

```tsx
// src/app/exhibitor/page.tsx
interface ExhibitorPageProps {
  searchParams?: Promise<{ tab?: string }>;
}

export default async function ExhibitorPage({ searchParams }: ExhibitorPageProps) {

  const resolvedParams = searchParams ? await searchParams : undefined;
  const currentTab = resolvedParams?.tab === 'config' ? 'config' : 'scanner';

  return <main data-active-tab={currentTab} />;
}
```

```typescript
// src/app/api/production/files/[filename]/route.ts
import { NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ filename: string }>;
}

export async function GET(request: Request, context: RouteContext) {

  const { filename } = await context.params;
  const download = new URL(request.url).searchParams.get('download') === '1';

  return NextResponse.json({ filename, download });
}
```

## 3. Edge Middleware Perimeter & Dual-Stage Session Verification

* **Edge Perimeter (`src/middleware.ts`):** Verifies the `itech2027_session` cookie HMAC-SHA256 signature via Web Crypto (`crypto.subtle`) and enforces coarse route-role boundaries across `/admin`, `/production`, `/registration`, `/exhibitor`, `/presentation`, and `/api/*`.
* **Handler / Page Verification (`src/lib/auth/session.ts`):**
  - `getVerifiedSessionClaims()`: Fast in-memory HMAC and expiration check on the session cookie before running pre-DB QR verification.
  - `getCurrentUser()`: Re-validates `accountVersion`, `role`, and `boothId` against PostgreSQL (`prisma.user.findUnique`) so password resets or booth reassignments revoke stale sessions immediately.

## 4. Route Organization (`src/app/`)

Production uses flat role-based routes (no `(auth)` or `(dashboard)` route groups) and REST-style Route Handlers (mutations do not use `'use server'` Server Actions):

```text
src/app/
├── admin/
├── exhibitor/
├── login/
├── notifications/
├── presentation/
├── production/
├── projects/
├── registration/
├── validate/
└── api/
    ├── admin/
    ├── auth/
    ├── booths/
    ├── cards/
    ├── exhibitor/
    ├── history/
    ├── production/
    ├── programs/
    ├── registration/
    └── vote/
        └── route.ts
```

## 5. Authenticated, Bounded Route Handler Pattern (`src/app/api/vote/route.ts`)

Always use Web `Request`, enforce session/role claims, apply rate limits, validate headers (`Idempotency-Key`), parse bounded JSON with `readBoundedJson` (`@/lib/security/request-body`), return HTTP `400` on invalid request schemas, verify booth ownership, and verify HMAC signatures in memory before database writes:

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJson, RequestBodyError } from '@/lib/security/request-body';
import { getCurrentUser, getVerifiedSessionClaims } from '@/lib/auth/session';
import { verifyStubPayload, getVerifiedHmacSecret } from '@/lib/crypto/stub-tokens';
import { rateLimiter, getClientIp } from '@/lib/security/rate-limiter';

const VoteRequestSchema = z.object({
  qrPayload: z.string().min(5).max(512),
  boothId: z.string().uuid(),
});

const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9:._-]+$/);

export async function POST(request: Request) {

  // 1. Verify signed session claims and role boundary
  const session = await getVerifiedSessionClaims();
  if (!session) {
    return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (session.role !== 'EXHIBITOR' && session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'FORBIDDEN_ROLE' }, { status: 403 });
  }

  // 2. Enforce rate limit and mandatory Idempotency-Key header
  const rateCheck = rateLimiter.check(`vote-input:${session.userId}:${session.accountVersion}`, 90, 60 * 1000);
  if (!rateCheck.allowed) {
    return NextResponse.json({ success: false, error: 'RATE_LIMIT_EXCEEDED' }, { status: 429 });
  }

  const parsedKey = IdempotencyKeySchema.safeParse(request.headers.get('idempotency-key'));
  if (!parsedKey.success) {
    return NextResponse.json({ success: false, error: 'MISSING_IDEMPOTENCY_KEY' }, { status: 400 });
  }

  try {
    // 3. Parse bounded JSON body and verify booth scope
    const body = await readBoundedJson(request);
    const parsed = VoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'INVALID_PAYLOAD_FORMAT' }, { status: 400 });
    }

    const { qrPayload, boothId } = parsed.data;
    if (session.role === 'EXHIBITOR' && session.boothId !== boothId) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN_BOOTH_MISMATCH' }, { status: 403 });
    }

    // 4. Verify QR HMAC signature in memory before touching PostgreSQL
    const cryptoCheck = verifyStubPayload(qrPayload.trim(), getVerifiedHmacSecret());
    if (!cryptoCheck.isValid || !cryptoCheck.data) {
      return NextResponse.json({ success: false, error: 'TAMPERED_OR_INVALID_QR_CODE' }, { status: 400 });
    }

    // 5. Revalidate live account status and execute atomic transaction
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
    }

    return NextResponse.json({ success: true, clientIp: getClientIp(request) });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: 'VOTE_PROCESSING_ERROR' }, { status: 500 });
  }
}
```
