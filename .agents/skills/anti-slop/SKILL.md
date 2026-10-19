---
name: anti-slop
description: >-
  Enforces clean, high-signal, anti-slop craftsmanship in code, UI design, and documentation.
  Use when writing, refactoring, or reviewing code to eliminate generic AI boilerplate,
  placeholder comments, unneeded abstractions, loose typing, and formulaic AI layouts.
  Do not use for implementing domain-specific business logic, database migrations, or cryptographic verification.
author: Daniel Bobis (GitHub: @ItsMeYourNightmare)
assisted_by:
  - OpenAI Codex
  - Google Gemini
---

# Anti-Slop Engineering & Clean Craftsmanship Skill

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Principles
This skill provides deterministic rules to purge generic, low-effort AI patterns ("slop") from the codebase.

## 2. Code Slop Checklist (Reject on Sight)

### 2.1 The "Obvious Comment" Anti-Pattern
```typescript
// BAD: AI Slop
// Function to add two numbers
function add(a: number, b: number) {
  // Return the sum of a and b
  return a + b;
}

// GOOD: Self-documenting
function add(a: number, b: number): number {
  return a + b;
}
```

### 2.2 The "Any" & Type Coercion Escape Hatch
```typescript
// BAD: Lazy AI typing
async function handleScan(payload: any) {
  const data = payload as any;
  ...
}

// GOOD: Explicit Zod schema & static inference
import { z } from 'zod';

export const ScanPayloadSchema = z.object({
  stubSerial: z.string().regex(/^B27-\d{4}-S[1-6]$/),
  signature: z.string().length(12),
  boothId: z.string().uuid(),
});

export type ScanPayload = z.infer<typeof ScanPayloadSchema>;
```

### 2.3 The "Over-Engineered Micro-Abstraction" Trap
* Do not create `AbstractVoteProcessorFactoryProvider` for a straightforward database update.
* Do not wrap native Next.js Server Actions with 4 layers of middleware unless strictly demanded by business requirements.
* Prefer clean, cohesive functions placed in domain modules (`src/lib/voting/redeem-stub.ts`).

### 2.4 The "Swallowed Catch" Vulnerability
```typescript
// BAD: Silent failure
try {
  await recordVote();
} catch (error) {
  console.log("Error occurred", error);
}

// GOOD: Structured result object or re-thrown typed error
try {
  await recordVote();
} catch (error) {
  logger.error('Vote redemption failed', { stubId, boothId, error });
  return { success: false, error: 'DATABASE_MUTATION_FAILED' };
}
```

## 3. UI/UX Anti-Slop Rules

Only enforce the following four UI anti-slop constraints so common design flows are not hindered:

1. **Avoid Gradients (Unless Semantically Meaningful):** Do not apply decorative or default gradients to backgrounds, cards, text, or borders unless the gradient carries explicit functional or semantic meaning.
2. **Avoid Background Colors on Text and Icons:** Do not wrap text labels or icons in colored background fills, badge pills, or circle containers. Use clean typography, stroke colors, and borders (`border border-neutral-300`) instead.
3. **Avoid Redundant Eyebrow Labels:** Avoid small uppercase tracked-out "eyebrow" labels above headings (e.g., `COMPUTER STUDIES DEPARTMENT • UNIVERSITY OF CALOOCAN CITY` stacked above `ITECHTIVITY 2027`) when the context is already established or redundant. Only use eyebrow labels when they add non-redundant hierarchy or disambiguation.
4. **Avoid UI Redundancies:** Eliminate repeated titles, duplicate status indicators, and redundant descriptive subtitles that restate what the heading or surrounding layout already communicates.

