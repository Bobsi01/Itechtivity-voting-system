# LESSONS_LEARNED.md — Engineering Insights & Architectural Log

This document records critical failure modes, architectural traps, and technical lessons learned during the design, QA auditing, and implementation of the **Itechtivity 2027** voting web application. Review this log before authoring or modifying code to avoid repeating known mistakes.

---

## 1. Cryptography & Security

### Lesson 1.1: `crypto.timingSafeEqual` Fatal Crash on Unequal Lengths
* **The Failure Mode:** In Node.js, `crypto.timingSafeEqual(bufA, bufB)` does NOT return `false` if the buffers have different lengths. Instead, it throws a fatal `TypeError: Input buffers must have the same byte length`.
* **The Consequence:** A malicious client or malformed QR scan transmitting an invalid-length signature crashes the entire Node process or unhandled route handler.
* **The Rule:** Always check byte length before calling `timingSafeEqual`:
  ```typescript
  if (expectedBuf.byteLength !== signatureBuf.byteLength) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  ```

### Lesson 1.2: Check-Then-Act Race Condition in Vote Redemption
* **The Failure Mode:** Querying the database to check if a ticket is active (`findUnique`), then creating the vote row, then updating the stub status allows two concurrent scans at $T=0$ to both pass the check.
* **The Rule:** Always execute an **atomic conditional update** in a single SQL statement:
  ```sql
  UPDATE "TICKET_STUB"
  SET "status" = 'REDEEMED', "updated_at" = NOW()
  WHERE "stub_serial" = :stub_serial AND "status" = 'ACTIVATED'
  RETURNING *;
  ```
  If zero rows are returned, reject the vote immediately. Always reinforce with a database-level `UNIQUE(ticket_stub_id)` constraint on the `VOTE` table.

---

## 2. Cloud Integrations & Appwrite

### Lesson 2.1: Appwrite Realtime Channel Syntax Is Strictly Resource-Scoped
* **The Failure Mode:** Treating Appwrite Realtime like a generic Pub/Sub broker (e.g. subscribing to `'channels.votes'`) fails with a silent WebSocket error.
* **The Rule:** Appwrite Realtime channels are strictly bound to system resources:
  ```typescript
  // Correct resource channel
  const channel = `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`;
  appwriteClient.subscribe(channel, (response) => { ... });
  ```
* **Server Broadcast:** To broadcast a message, the server must create or update a document in that collection using the Appwrite Server SDK (`node-appwrite`).

---

## 3. PDF Generation & Memory Limits

### Lesson 3.1: Raster Data URLs in PDFKit Trigger Memory Leaks and Blurry Prints
* **The Failure Mode:** Calling `QRCode.toDataURL()` generates a raster PNG encoded as a Base64 string. Generating hundreds of these per batch causes severe V8 garbage collection churn and pixelated prints on commercial presses.
* **The Rule:** Generate **true vector QRs** by inspecting the bitmatrix modules and drawing vector rectangles directly onto the PDF stream:
  ```typescript
  const qr = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  for (let row = 0; row < qr.modules.size; row++) {
    for (let col = 0; col < qr.modules.size; col++) {
      if (qr.modules.get(row, col)) {
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize).fill('#000000');
      }
    }
  }
  ```

### Lesson 3.2: Heroku 30-Second Timeout (`H12`) & 512MB RAM Ceiling
* **The Failure Mode:** Generating 1,000 cards (7,000 QRs) in a synchronous HTTP route hits Heroku's 30-second router timeout and crashes the 512MB dyno (`R14/R15`).
* **The Rule:** Prepare all cards **weeks in advance**. Offload generation to the Heroku worker dyno using `pg-boss`, stream in 50-card chunks directly to Appwrite Storage, and provide download links.

---

## 4. UI/UX Invariants (User Directives)

### Lesson 4.1: Strictly Zero Emojis
* **The Directive:** Never use emojis (such as rocket, checkmark, cross mark, party popper, mobile phone, lock, or any Unicode pictograph) anywhere in UI buttons, toasts, alerts, headers, or metadata.
* **The Rule:** Always use clean, professional monochrome vector icons from `lucide-react` with precise stroke widths. The prohibition extends to negative examples and documentation: never write literal Unicode pictographs anywhere in the codebase.

### Lesson 4.2: Zero Background Colors on Text and Icons
* **The Directive:** Never place colored background fills behind text (e.g. colored pill badges) or behind icons (e.g. colored circle bubble containers) unless explicitly instructed by the user.
* **The Rule:** Use borders, clean typography, font weights, and spacing (`border border-neutral-300`, `text-neutral-900`) for visual hierarchy.

---

## 5. Token & Type Contract Drift

### Lesson 5.1: Cross-Module Token Specification Drift
* **The Failure Mode:** The cryptographic module generated a truncated 12-character HMAC, but the validation schema demanded a 16-character string (`z.string().length(16)`), causing valid tokens to fail validation.
* **The Rule:** Maintain a single source of truth for all token length constants and Zod schemas across the entire codebase.

---

## 6. Agent Governance & Skill Optimization

### Lesson 6.1: Missing Negative Triggers in Skill Frontmatter
* **The Failure Mode:** Frontmatter descriptions that only declare positive triggers ("Use when...") risk false-positive activation, causing the agent to load irrelevant skills that pollute the active context window.
* **The Rule:** Every `SKILL.md` description must include both positive triggers and explicit negative triggers ("Do not use for...").

### Lesson 6.2: Mock API Snippets in Governance Rules
* **The Failure Mode:** Writing fictional/mock ORM code in governance rules confuses automated coding agents into generating non-existent database calls.
* **The Rule:** All governance code examples must use real, idiomatic repository libraries (Prisma ORM `$transaction` / `$queryRaw`).
