---
name: code-quality
description: >-
  Enforces guidelines and formatting standards for student-friendly, maintainable code.
  Use when structuring functions, adding spacing, writing balanced comments, or reviewing
  naming conventions. Do not use for security verification, cryptography, or Appwrite configuration.
---

# Code Quality & Readability Runbook

## 1. Core Objectives
This skill ensures that all code produced in the Itechtivity 2027 codebase is approachable, intuitive, and clean for university students and peer reviewers, while maintaining rigorous enterprise-grade security and performance standards.

---

## 2. Naming Conventions Reference

|Element|Format|Rule|Example|
|---|---|---|---|
|**Functions / Actions**|`camelCase`|Start with an action verb|`registerBuyerTransaction`, `verifyStubPayload`|
|**Variables / Properties**|`camelCase`|Full words, no cryptic abbreviations|`selectedAwardCategory`, `scannerTorchActive`|
|**Types / Interfaces**|`PascalCase`|Descriptive noun phrase|`TicketRedemptionReceipt`, `BoothSummary`|
|**Components**|`PascalCase`|Descriptive component name|`LiveTallyBoard`, `StubScannerModal`|
|**Constants / Env**|`UPPER_SNAKE_CASE`|Strict uppercase with underscores|`MAX_AWARDS_PER_CARD`, `EVENT_HMAC_SECRET`|

---

## 3. The Vertical Spacing & Formatting Mannerism

Code must breathe. Always include intentional vertical whitespace to separate execution blocks:

```typescript
export async function activatePurchasedCards(
  buyerTransactionId: string,
  masterQrSerials: string[],
  staffUserId: string
): Promise<ActivationResult> {

  // Phase 1: Validate payload inputs and permissions
  if (masterQrSerials.length === 0) {
    return { success: false, error: 'NO_CARDS_PROVIDED' };
  }

  // Phase 2: Atomic database transaction
  const activationSummary = await prisma.$transaction(async (transactionClient) => {

    const updatedCards = await transactionClient.bingoCard.updateMany({
      where: {
        masterQrHash: { in: masterQrSerials },
        status: 'GENERATED',
      },
      data: {
        status: 'ACTIVATED',
        transactionId: buyerTransactionId,
        activatedAt: new Date(),
      },
    });

    // Cascade state transition to all associated stubs
    await transactionClient.ticketStub.updateMany({
      where: {
        bingoCard: { masterQrHash: { in: masterQrSerials } },
        status: 'INACTIVE',
      },
      data: {
        status: 'ACTIVATED',
      },
    });

    return updatedCards;
  });

  // Phase 3: Return structured response
  return {
    success: true,
    activatedCount: activationSummary.count,
  };
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
- [ ] Is there proper vertical spacing separating input validation, core logic, and response return?
- [ ] Are comments concise, purposeful, and explaining the "why"?
- [ ] Is security strictly preserved (e.g. atomic row locks, HMAC verification, input validation)?
- [ ] Are zero emojis present in code, comments, or UI templates?
