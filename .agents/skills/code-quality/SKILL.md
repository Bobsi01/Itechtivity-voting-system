---
name: code-quality
description: >-
  Enforces guidelines and formatting standards for student-friendly, maintainable code.
  Use when structuring functions, adding spacing, writing balanced comments, or reviewing
  naming conventions. Do not use for security verification, cryptography, or Appwrite configuration.
---

# Code Quality & Readability Runbook

> **Author:** Daniel Bobis (GitHub: @ItsMeYourNightmare)  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Core Objectives
This skill ensures that all code produced in the Itechtivity 2027 codebase is approachable, intuitive, and clean for university students and peer reviewers, while maintaining rigorous enterprise-grade security and performance standards.

---

## 2. Naming Conventions Reference

|Element|Format|Rule|Example|
|---|---|---|---|
|**Functions / Actions**|`camelCase`|Start with an action verb|`registerBuyerTransaction`, `verifyStubPayload`|
|**Variables / Properties**|`camelCase`|Full words, no cryptic abbreviations|`selectedAwardCategory`, `scannerTorchActive`|
|**Types / Interfaces**|`PascalCase`|Descriptive noun phrase|`TicketRedemptionReceipt`, `BoothSummary`|
|**Components**|`PascalCase`|Descriptive component name|`LiveTallyBoard`, `QrScanner`|
|**Constants / Env**|`UPPER_SNAKE_CASE`|Strict uppercase with underscores|`MAX_ALLOWED_AWARDS`, `EVENT_HMAC_SECRET`|

---

## 3. The Vertical Spacing & Formatting Mannerism

Code must breathe. Leave an intentional single empty line immediately after every function opening brace `{`, and separate logical phases with single blank lines. The example below mirrors the active cashier POS card-binding model in `src/app/api/registration/bind/route.ts` (batch activation was permanently deprecated in `V1.0.19`):

```typescript
import { BuyerType, CardStatus, StubStatus } from '@prisma/client';
import prisma from '@/lib/db/prisma';

interface BindCardsInput {
  buyerType: BuyerType;
  buyerName: string;
  cardSerials: string[];
  staffUserId: string;
  clientIp: string;
}

interface BindCardsResult {
  success: boolean;
  transactionId?: string;
  cardsActivatedCount?: number;
  stubsActivatedCount?: number;
  error?: string;
}

export async function bindPurchasedCards(
  input: BindCardsInput
): Promise<BindCardsResult> {

  // Phase 1: Normalize and validate input card serials
  const normalizedSerials = Array.from(
    new Set(
      input.cardSerials.map((serial) =>
        serial
          .trim()
          .toUpperCase()
          .replace(/^(#|MASTER:|M-)/i, '')
          .trim()
      )
    )
  );
  if (normalizedSerials.length === 0) {
    return { success: false, error: 'NO_CARDS_PROVIDED' };
  }

  // Phase 2: Execute atomic registration gate check, card/stub activation, and audit trail
  try {
    const activationOutcome = await prisma.$transaction(async (tx) => {

      const configs = await tx.$queryRaw<Array<{ isRegistrationOpen: boolean }>>`
        SELECT "isRegistrationOpen" FROM "EventConfig" LIMIT 1 FOR SHARE
      `;
      if (!configs[0]?.isRegistrationOpen) {
        return { success: false, error: 'REGISTRATION_CLOSED' };
      }

      const existingCards = await tx.bingoCard.findMany({
        where: { cardSerial: { in: normalizedSerials } },
        include: { stubs: true },
      });
      if (existingCards.length !== normalizedSerials.length) {
        return { success: false, error: 'MISSING_CARDS' };
      }

      const alreadyActive = existingCards.filter((card) => card.status !== CardStatus.GENERATED);
      if (alreadyActive.length > 0) {
        return { success: false, error: 'ALREADY_ACTIVE' };
      }

      const transaction = await tx.registrationTransaction.create({
        data: {
          processedByUserId: input.staffUserId,
          buyerType: input.buyerType,
          buyerName: input.buyerName,
          quantityBought: normalizedSerials.length,
        },
      });

      const cardIds = existingCards.map((card) => card.id);
      const updatedCards = await tx.bingoCard.updateMany({
        where: { id: { in: cardIds }, status: CardStatus.GENERATED },
        data: {
          status: CardStatus.ACTIVATED,
          transactionId: transaction.id,
          activatedAt: new Date(),
        },
      });
      if (updatedCards.count !== cardIds.length) {
        throw new Error('CONCURRENCY_CONFLICT');
      }

      // Cascade activation to all INACTIVE stubs on the purchased cards
      const expectedStubsCount = existingCards.reduce((sum, card) => sum + card.stubs.length, 0);
      const updatedStubs = await tx.ticketStub.updateMany({
        where: { bingoCardId: { in: cardIds }, status: StubStatus.INACTIVE },
        data: { status: StubStatus.ACTIVATED },
      });
      if (updatedStubs.count !== expectedStubsCount) {
        throw new Error('CONCURRENCY_CONFLICT');
      }

      await tx.auditLog.create({
        data: {
          userId: input.staffUserId,
          action: 'REGISTRATION_BIND',
          resource: 'REGISTRATION',
          ipAddress: input.clientIp,
        },
      });

      return {
        success: true,
        transactionId: transaction.id,
        cardsActivatedCount: updatedCards.count,
        stubsActivatedCount: updatedStubs.count,
      };
    });

    // Phase 3: Return structured response
    return activationOutcome;
  } catch (error) {
    if (error instanceof Error && error.message === 'CONCURRENCY_CONFLICT') {
      return { success: false, error: 'CONCURRENCY_CONFLICT' };
    }
    console.error('Card binding failed:', error);
    return { success: false, error: 'REGISTRATION_BIND_FAILED' };
  }
}
```

---

## 4. Balanced Commenting Standard

* **Keep comments focused on non-obvious constraints, security logic, or architectural invariants.**
* Do not write trivial comments that simply repeat the syntax.
* Do not write lengthy multi-paragraph narratives.
* Target 1 to 2 clear sentences describing the constraint:
  ```typescript
  // Reject unactivated stubs to prevent unauthorized voting from leaked print batches
  if (stubRecord.status !== 'ACTIVATED') {
    return { success: false, error: 'UNACTIVATED_STUB' };
  }
  ```

---

## 5. Pre-Commit Quality Checklist

- [ ] Does every function start with a clear, active verb?
- [ ] Are variable names self-explanatory without ambiguous single-letter shortcuts?
- [ ] Is there an intentional empty line after every function opening brace `{` and vertical spacing between phases?
- [ ] Are comments concise, purposeful, and explaining the "why"?
- [ ] Is security strictly preserved (e.g. atomic row locks, HMAC verification, input validation, audit logging)?
- [ ] Are zero emojis present in code, comments, or UI templates?
