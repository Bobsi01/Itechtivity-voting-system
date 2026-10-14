---
name: anti-slop
description: >-
  Enforces clean, high-signal, anti-slop craftsmanship in code, UI design, and documentation.
  Use when writing, refactoring, or reviewing code to eliminate generic AI boilerplate,
  placeholder comments, unneeded abstractions, loose typing, and formulaic AI layouts.
---

# Anti-Slop Engineering & Clean Craftsmanship Skill

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

* **No Glowing Neon Gradients:** Do not default to purple/cyan gradient borders on cards.
* **Touch-First Accessibility:** Minimum touch target size is $44 \times 44\text{px}$.
* **Real-World Contrast:** Use high-contrast color palettes (WCAG AAA for text) so screens are readable under direct sunlight or dark exhibition lighting.
* **Instant Tactile Feedback:** Every scan must trigger immediate visual, haptic, and acoustic confirmation.
