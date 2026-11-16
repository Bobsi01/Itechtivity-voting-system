---
name: anti-slop
description: >-
  Enforces clean, high-signal, anti-slop craftsmanship in code, UI design, and documentation.
  Use when writing, refactoring, or reviewing code to eliminate generic AI boilerplate,
  placeholder comments, unneeded abstractions, loose typing, and formulaic AI layouts.
  Do not use for implementing domain-specific business logic, database migrations, or cryptographic verification.
---

# Anti-Slop Engineering & Clean Craftsmanship Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Principles
This skill provides concrete checks to eliminate low-signal AI patterns ("slop") while preserving [.agents/rules/code-craftsmanship.md](../../rules/code-craftsmanship.md) and [.agents/rules/code-quality.md](../../rules/code-quality.md).

## 2. Code Slop Checklist (Reject on Sight)

### 2.1 The "Obvious Comment" Anti-Pattern
```typescript
// BAD: AI Slop
// Function to add two numbers
function add(a: number, b: number) {

  // Return the sum of a and b
  return a + b;
}

// GOOD: Self-documenting with function breathing spacing
function add(a: number, b: number): number {

  return a + b;
}
```

### 2.2 The "Any" & Type Coercion Escape Hatch
Never use `any`, `unknown as any`, `Record<string, any>`, `@ts-ignore`, or `@ts-nocheck`. Validate external inputs with strict Zod schemas matching the real token and API formats:

```typescript
// BAD: Lazy AI typing
async function handleScan(payload: any) {

  const data = payload as any;
  return data;
}

// GOOD: Explicit Zod schema & static inference aligned with src/lib/crypto/stub-tokens.ts
import { z } from 'zod';

export const VoteRequestSchema = z.object({
  qrPayload: z.string().min(5).max(512),
  boothId: z.string().uuid(),
});

export const StubSignatureSchema = z.object({
  stubSerial: z.string().regex(/^[A-Z0-9]+-[A-Z0-9]+-[0-9]{4}-S[1-6]$/),
  signature: z.string().length(24),
});

export type VoteRequestPayload = z.infer<typeof VoteRequestSchema>;
```

### 2.3 The "Over-Engineered Micro-Abstraction" Trap
* Do not create `AbstractVoteProcessorFactoryProvider` for a straightforward database transaction.
* Do not wrap Next.js Route Handlers in multi-layer dependency-injection hierarchies.
* Place cohesive domain logic directly in dedicated modules (`src/lib/crypto/stub-tokens.ts`, `src/lib/security/idempotency.ts`, `src/lib/audit/log.ts`) and keep security checks visible inside the Route Handler (`src/app/api/vote/route.ts`).

### 2.4 The "Swallowed Catch" Vulnerability
```typescript
// BAD: Silent failure
try {
  await recordVote();
} catch (error) {
  console.log('Error occurred', error);
}

// GOOD: Structured logging + typed error result
import { NextResponse } from 'next/server';

async function handleVoteError(error: unknown) {

  console.error('Vote processing error:', error);
  return NextResponse.json(
    { success: false, error: 'VOTE_PROCESSING_ERROR' },
    { status: 500 }
  );
}
```

## 3. UI/UX Anti-Slop Rules

Enforce the four UI anti-slop constraints defined in [.agents/rules/ui-ux.md](../../rules/ui-ux.md) (Rules 2-5) and scoped by [.agents/rules/code-craftsmanship.md](../../rules/code-craftsmanship.md):

1. **Avoid Gradients (Unless Semantically Meaningful):** Do not apply decorative or default gradients to backgrounds, cards, text, or borders unless the gradient carries explicit functional or semantic meaning.
2. **Avoid Chromatic Background Colors on Text and Icons:** Do not wrap text labels or icons in colored background fills, badge pills, or circle containers (`src/lib/test/standards-checker.ts`). Use clean typography, stroke colors, and borders (`border border-neutral-300`) instead.
3. **Avoid Redundant Eyebrow Labels:** Avoid small uppercase tracked-out "eyebrow" labels above headings (e.g., `COMPUTER STUDIES DEPARTMENT • UNIVERSITY OF CALOOCAN CITY` stacked above `ITECHTIVITY 2027`) when the context is already established or redundant.
4. **Avoid UI Redundancies:** Eliminate repeated titles, duplicate status indicators, and redundant descriptive subtitles that restate what the heading or surrounding layout already communicates.
