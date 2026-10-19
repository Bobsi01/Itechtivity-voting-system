---
name: nextjs-app-router
description: >-
  Provides best practices, patterns, and boundaries for Next.js 15 App Router.
  Use when creating or modifying routes, Server Actions, Server Components, Client Components,
  route handlers, or data mutations in the Next.js App Router. Do not use for visual styling,
  cryptographic token hashing, or PDF rendering layout.
author: Daniel Bobis (GitHub: @ItsMeYourNightmare)
assisted_by:
  - OpenAI Codex
  - Google Gemini
---

# Next.js 15 App Router Engineering Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Component Boundary Hierarchy
1. **Server Components by Default:** Fetch data directly on the server without `useEffect` or client fetchers.
2. **Push `'use client'` to the Leaves:** Only mark leaf components as Client Components (e.g., interactive camera viewfinders, audio players, interactive form inputs).
3. **Never Pass Server-Only Objects Across Boundaries:** Do not pass Prisma models containing password hashes or secret tokens to Client Components. Use explicit DTOs.

## 2. Next.js 15 Specifics
* **Async Request APIs:**
  ```typescript
  // Next.js 15: params & searchParams are promises
  interface PageProps {
    params: Promise<{ boothId: string }>;
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }

  export default async function BoothPage({ params }: PageProps) {
    const { boothId } = await params;
    ...
  }
  ```

## 3. Server Actions for Data Mutations
* Always validate inputs using **Zod** at the very start of the Server Action.
* Verify user session and role authorization before executing any mutation.
* Return a standardized `ActionResponse<T>`:
  ```typescript
  type ActionResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string; code?: string };
  ```

## 4. Route Organization Standard
```text
src/app/
├── (auth)/
│   └── login/
├── (dashboard)/
│   ├── admin/
│   ├── registration/
│   └── exhibitor/
└── api/
    ├── vote/
    │   └── route.ts
    └── webhooks/
```

## 5. Next.js 15 Route Handler with Header Inspection (`/api/vote/route.ts`)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ScanPayloadSchema } from '@/lib/validation/scan-schema';

export async function POST(req: NextRequest) {
  // 1. Extract Idempotency Key from Request Headers
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return NextResponse.json(
      { success: false, error: 'MISSING_IDEMPOTENCY_KEY' },
      { status: 400 }
    );
  }

  // 2. Safely parse and validate request body
  const body = await req.json();
  const parseResult = ScanPayloadSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: 'INVALID_PAYLOAD', details: parseResult.error.flatten() },
      { status: 422 }
    );
  }

  // 3. Delegate to business logic module
  // ...
  return NextResponse.json({ success: true, message: 'Vote recorded' });
}
```
