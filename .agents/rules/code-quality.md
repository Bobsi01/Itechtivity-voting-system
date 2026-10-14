# Code Quality & Readability Governance Rules

## 1. Code Friendliness & Standard Naming Conventions

Code in this project must be clean, approachable, and educational for university students and peer reviewers, while remaining uncompromising on cryptographic and concurrency security.

### 1.1 Strict Naming Standards
* **Functions & Methods:** Standard `camelCase`. Names must start with an active verb describing the behavior:
  - Good: `verifyStubSignature`, `activateBingoCard`, `calculateBoothRankings`
  - Bad: `stubCheck`, `dataProcess`, `doStuff`
* **Variables & Properties:** Descriptive `camelCase`. Avoid single-letter variables except for standard loop indices (`i`, `j`):
  - Good: `ticketStubSerial`, `buyerCategory`, `boothIdentifier`
  - Bad: `s`, `cat`, `bId`, `temp`
* **Types, Interfaces & Components:** Strict `PascalCase`:
  - Good: `TicketStubPayload`, `RegistrationReceipt`, `ScannerViewfinder`
  - Bad: `ticket_payload`, `IScannerProps`, `scanner_component`
* **Constants & Environment Variables:** Strict `UPPER_SNAKE_CASE`:
  - Good: `MAX_ALLOWED_AWARDS`, `HMAC_SIGNATURE_LENGTH`, `EVENT_HMAC_SECRET`
  - Bad: `maxAwards`, `SignatureLength`

---

## 2. Formatting Mannerisms & Vertical Spacing

Readable code requires intentional breathing room. Dense, compressed walls of code increase cognitive load and obscure security flaws.

### 2.1 The Function Breathing Mannerism
Leave an intentional single empty line after function opening braces where it improves readability, and separate distinct execution phases with clean vertical whitespace:

```typescript
export async function redeemTicketStub(
  stubSerial: string,
  boothId: string,
  scannedByUserId: string
): Promise<RedemptionResult> {

  // Step 1: Pre-database validation and signature verification
  const isValidFormat = validateSerialFormat(stubSerial);
  if (!isValidFormat) {
    return { success: false, error: 'MALFORMED_SERIAL_CODE' };
  }

  // Step 2: Atomic database state transition using Prisma ORM
  const updatedStub = await prisma.$queryRaw<Array<{ id: string; award_id: string }>>`
    UPDATE "TICKET_STUB"
    SET "status" = 'REDEEMED', "updated_at" = NOW()
    WHERE "stub_serial" = ${stubSerial}
      AND "status" = 'ACTIVATED'
    RETURNING "id", "award_id";
  `;

  if (!updatedStub || updatedStub.length === 0) {
    return { success: false, error: 'STUB_ALREADY_USED_OR_INACTIVE' };
  }

  // Step 3: Insert vote record protected by UNIQUE constraint
  const voteRecord = await prisma.vote.create({
    data: {
      ticketStubId: updatedStub[0].id,
      boothId: boothId,
      awardId: updatedStub[0].award_id,
      scannedByUserId: scannedByUserId,
    },
  });

  return { success: true, data: voteRecord };
}
```

### 2.2 Logical Phase Separation Rules
Always separate code into distinct visual paragraphs using single blank lines:
1. Input extraction and sanity checks.
2. Cryptographic or mathematical validation.
3. Database query or mutation.
4. Telemetry, event emission, or cache update.
5. Response construction.

---

## 3. Commenting Quality Standards

Comments must be purposeful, balanced, and informative.

### 3.1 Neither Too Short Nor Too Long
* **Forbidden (Too Short / Trivial):**
  ```typescript
  // check
  if (!res) return;
  // insert
  await db.insert();
  ```
* **Forbidden (Too Long / Narrative Essay):**
  ```typescript
  // In 2026 we noticed that when visitors came in they might try to scan twice
  // so we discussed this in a committee meeting and decided we should probably
  // make sure the status is not already redeemed before we do anything else.
  ```
* **Required (Balanced & High Signal):**
  A 1-to-2 sentence explanation clarifying the business constraint, cryptographic invariant, or failure mode:
  ```typescript
  // Verify buffer lengths match before comparing to prevent Node.js timingSafeEqual runtime exceptions
  if (expectedBuffer.byteLength !== signatureBuffer.byteLength) {
    return false;
  }
  ```

---

## 4. Student-Friendly Architecture Without Compromising Security

* **Clear Mental Models:** Structure files predictably so any computer science student can follow the lifecycle:
  `Input -> Validation -> State Machine Check -> Persistence -> Event Broadcast`.
* **Zero Hidden Magic:** Do not use obscure language tricks, monkey-patching, or dynamic property injection.
* **Security as First-Class Citizen:** Keep security checks explicit and visible directly in the code path rather than buried under obscure abstractions.
