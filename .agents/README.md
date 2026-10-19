# Agent Guide — Itechtivity 2027

> **Author:** Daniel Bobis (GitHub: [@ItsMeYourNightmare](https://github.com/ItsMeYourNightmare))  
> **Assisted by:** OpenAI Codex and Google Gemini

This document provides explicit instructions for AI agents (and autonomous development models) tasked with reviewing, evaluating, debugging, or enhancing the Itechtivity 2027 codebase.

---

## 1. Agent Evaluation Mandate

When evaluating this repository, do not perform superficial or generic boilerplate changes. Your objective is to rigorously inspect the architecture against real-world event day conditions (spotty Wi-Fi, 512MB RAM cloud dynos, high voter concurrency, dim lighting in exhibition halls) and propose high-signal, production-grade improvements.

All proposals and implementations must respect the core mission: **a fraud-proof, university capstone voting system linking physical Bingo Cards with cryptographic QR stubs to a real-time tally engine.**

---

## 2. Evaluation Checklist for Agents

When reviewing or proposing changes, evaluate the codebase against these four architectural pillars:

### 2.1 Cryptographic & Anti-Fraud Invariants
- **In-Memory Verification First:** All HMAC signatures must be validated in memory before any database query is issued.
- **Timing Attack Defense:** Signature comparisons must use `crypto.timingSafeEqual` preceded by a strict byte-length guard (`expectedBuf.byteLength === signatureBuf.byteLength`).
- **Atomic Single-Redemption:** Vote redemption must execute via atomic conditional updates (`WHERE id = :stub_id AND status = 'ACTIVATED'`).
- **Database-Level Protection:** Ensure the database enforces `UNIQUE(ticket_stub_id)` on the `VOTE` table as an unbreachable secondary barrier.
- **Replay Protection:** Verify that scan endpoints check and record `Idempotency-Key` headers to guard against rapid mobile network retries.

### 2.2 Zero-Trust RBAC & Tenant Isolation
- **Identity Derivation:** Identity, user role, and booth scope must always be derived strictly from the server session (`getCurrentSession()`). Never trust client-supplied `role`, `boothId`, or `userId` in request bodies or query parameters.
- **Exhibitor Isolation:** Exhibitors must only receive tally data for their assigned booth. Never expose global standings or competitor counts on exhibitor-scoped routes or WebSocket payloads.
- **Input Validation:** Every mutation route must validate incoming payloads using strict Zod schemas with explicitly mapped fields.

### 2.3 Resource Efficiency & Ephemeral Dyno Limits
- **Memory Ceiling:** The production web dyno runs on a 512MB RAM ceiling (`--max-old-space-size=384`).
- **Vector PDF Streaming:** Ticket sheet generation must render direct vector paths in PDFKit rather than raster Base64 PNG images. Large card batches must stream in chunked batches.
- **Zero Ephemeral Storage Dependency:** Production files must never rely on local dyno storage. Exported print sheets stream directly to Appwrite Cloud Storage (`bingo-cards-pdf` bucket).
- **Connection Pooling:** PostgreSQL queries must run through PgBouncer in transaction mode with conservative connection limits (`connection_limit=5`).

### 2.4 Mobile-First Touch Ergonomics & UI Standards
- **Mobile-First Viewports:** Exhibitor and registration interfaces must be styled mobile-first (`360px-430px`) using dynamic viewport heights (`h-dvh`) and safe-area padding.
- **Touch Targets:** All interactive buttons and scanner controls must have a minimum touch target size of 44x44px.
- **Strict No Emoji Policy:** Never emit or render emojis anywhere in UI templates, buttons, toasts, dialogs, code comments, or agent responses. Use monochrome vector icons from `lucide-react` instead.
- **Strict No Background Color Policy:** Do not wrap text or icons in background color fills (no colored badge pills or circle containers). Use clean borders (`border border-neutral-300`) and high-contrast typography.
- **Anti-Slop:** Avoid decorative gradients, redundant eyebrow labels, placeholder comments, and unnecessary multi-layered abstractions.

---

## 3. How to Propose and Execute Improvements

When tasked with proposing changes, bug fixes, or optimizations:

1. **Holistic Impact Analysis:** Trace all dependent components, server actions, route handlers, and database models before modifying shared logic.
2. **Deterministic Fixes:** Apply concrete, typed implementations. Never introduce `any`, `unknown as any`, or `@ts-ignore`.
3. **Automated Verification:** Always execute the relevant automated test scripts to verify that your changes introduce zero regressions:
   ```bash
   # Cryptography verification
   npm run test:crypto

   # PDF layout and vector rendering
   npm run test:pdf

   # Full lifecycle flow (generate -> bind -> vote -> duplicate scan reject)
   npm run test:e2e:flow

   # Regression and audit trail checks
   npm run test:audit
   ```
4. **Transparent Documentation:** Summarize your findings, the root cause, and the exact files modified with clear markdown links.

---

## 4. Governance & Runbook Skills Directory

Incoming agents must adhere to the modular governance rules and specialized runbooks in this directory:

### Governance Rules
- [`rules/security.md`](file:///c:/Workspace/Itech%202027/.agents/rules/security.md) — HMAC verification, atomic locks, BOLA/IDOR defenses, and session hygiene.
- [`rules/ui-ux.md`](file:///c:/Workspace/Itech%202027/.agents/rules/ui-ux.md) — Mobile-first viewport standards, zero emoji policy, zero text-background policy.
- [`rules/code-craftsmanship.md`](file:///c:/Workspace/Itech%202027/.agents/rules/code-craftsmanship.md) — Anti-slop engineering, zero `any`, and error handling standards.
- [`rules/code-quality.md`](file:///c:/Workspace/Itech%202027/.agents/rules/code-quality.md) — Student-friendly naming conventions, vertical spacing, and balanced commenting.

### Specialized Runbooks (Skills)
- [`skills/anti-slop/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/anti-slop/SKILL.md) — Eliminating generic AI boilerplate and enforcing the 4 UI anti-slop rules.
- [`skills/code-quality/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/code-quality/SKILL.md) — Code formatting, whitespace breathing room, and naming conventions.
- [`skills/web-design/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/web-design/SKILL.md) — Tactile, high-contrast UI styling with Lucide icons.
- [`skills/mobile-web-ui/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/mobile-web-ui/SKILL.md) — Mobile viewports, dynamic heights, camera viewfinder UX, and virtual keyboard handling.
- [`skills/nextjs-app-router/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/nextjs-app-router/SKILL.md) — App Router boundaries, async request APIs, and server actions.
- [`skills/qr-crypto-idempotency/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/qr-crypto-idempotency/SKILL.md) — Cryptographic tokens, timing-safe checks, and single-redemption transactions.
- [`skills/appwrite-cloud/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/appwrite-cloud/SKILL.md) — Appwrite Cloud Storage and Realtime WebSockets.
- [`skills/streaming-pdf-ticket/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/streaming-pdf-ticket/SKILL.md) — Low-memory vector PDF generation using PDFKit.
