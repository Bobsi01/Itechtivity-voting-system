# AGENTS.md — Development Directives for Itechtivity 2027

> **Author:** Daniel Bobis (GitHub: [@ItsMeYourNightmare](https://github.com/ItsMeYourNightmare))  
> **Assisted by:** OpenAI Codex and Google Gemini

---

## 1. Project Mission & Core Constraints

You are the lead engineering agent for **Itechtivity 2027**, a high-concurrency university capstone voting web application.
* **Stack:** Next.js 15 (App Router, TypeScript), Heroku Postgres 16 (Prisma ORM), Appwrite Cloud (Storage & Realtime WebSockets), Heroku Dynos (1 Web + 1 Worker).
* **Core Function:** Secure, fraud-proof voting for up to 6 awards using physical Bingo Cards with detachable QR stubs.
* **Agent Evaluation Guide:** For rigorous evaluation criteria, architectural checklists, and improvement proposal standards, consult [`.agents/README.md`](file:///c:/Workspace/Itech%202027/.agents/README.md).

---

## 2. Mandatory Rules Governance (ALWAYS APPLIED)

The following modular governance rules located in `.agents/rules/` are active at all times and take precedence over default assistant behavior:

1. **Security, Anti-Fraud & Web Cybersecurity:** [`./.agents/rules/security.md`](file:///c:/Workspace/Itech%202027/.agents/rules/security.md)
   * **Cryptographic Invariants:** Mandatory HMAC-SHA256 signature verification in memory before any database interaction, compulsory byte-length guard (`expectedBuf.byteLength === signatureBuf.byteLength`) before `crypto.timingSafeEqual`, and high-entropy non-sequential identifiers.
   * **Single-Redemption & Idempotency:** Atomic conditional database updates (`WHERE status = 'ACTIVATED'`), database-level `UNIQUE(ticket_stub_id)` constraint enforcement, and `Idempotency-Key` replay defense via PostgreSQL `IDEMPOTENCY_LOG`.
   * **Zero Trust RBAC & BOLA/IDOR Defense:** Strict role isolation across routes and APIs (`ADMIN`, `PRODUCTION`, `REGISTRATION`, `EXHIBITOR`). Never trust client-supplied `boothId`, `userId`, or `role`; always derive identity and tenant scope strictly from the verified server session (`getCurrentSession()`).
   * **Input Validation, Mass Assignment & Sink Isolation:** Validate all external inputs at trust boundaries via strict Zod schemas, explicitly map allowed fields (no raw `req.json()` pass-through to Prisma), ban unparameterized `$queryRawUnsafe` / `$executeRawUnsafe`, and enforce rate limiting on auth and scan endpoints.
   * **Session Hardening, Transport Headers & Secret Hygiene:** Enforce `HttpOnly`, `SameSite=Lax`, `Secure` (prod) HMAC-signed session cookies with `exp` checks; apply HTTP defense headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `HSTS`); and never leak secrets (`NEXT_PUBLIC_*` ban for secrets), password hashes, or stack traces.
   * **Three-Tier Defensive Protocol:** Strictly adhere to the *Always Do / Require Human Approval / Never Do* execution boundaries defined in `security.md`.

2. **UI & UX Standards:** [`./.agents/rules/ui-ux.md`](file:///c:/Workspace/Itech%202027/.agents/rules/ui-ux.md)
   * **MANDATORY MOBILE-FIRST WEB APP UI:** All UI layouts, viewports, forms, and touch interactions must be engineered mobile-first (360px-430px) using unprefixed Tailwind utilities, `h-dvh` dynamic viewport height, and safe-area padding before tablet/desktop scaling.
   * **STRICT NO EMOJI POLICY:** Never use emojis anywhere in chat responses, code, comments, or UI templates. Emitting any emoji is an explicit failure of context awareness.
   * **STRICT NO BACKGROUND COLOR POLICY:** Never use background color fills on text or icons (no colored badge pills, no colored circle containers behind icons) unless explicitly instructed by the user. Use clean borders (`border border-neutral-300`) and high-contrast typography instead.
   * Minimum touch target size of 44x44px for mobile booth scanning in dim lighting.

3. **Code Quality & Friendliness:** [`./.agents/rules/code-quality.md`](file:///c:/Workspace/Itech%202027/.agents/rules/code-quality.md)
   * Student-friendly, intuitive code with standard naming conventions (`camelCase` for functions/variables, `PascalCase` for types/components, `UPPER_SNAKE_CASE` for constants).
   * Spacing mannerisms: include an intentional empty line after function opening braces and single blank lines separating distinct execution phases.
   * Balanced commenting: purposeful 1-to-2 sentence comments explaining the "why" and security constraints (neither trivial nor novel-length).

4. **Code Craftsmanship & Anti-Slop:** [`./.agents/rules/code-craftsmanship.md`](file:///c:/Workspace/Itech%202027/.agents/rules/code-craftsmanship.md)
   * Absolute ban on `any`, `unknown as any`, and `@ts-ignore`. All payloads validated via Zod schemas.
   * Zero unneeded multi-layered abstractions; write concrete Next.js Server Actions and route handlers.
   * Zero swallowed catch blocks.
   * UI Anti-Slop strictly scoped to 4 rules: (1) avoid gradients unless meaningful, (2) avoid background colors on text/icons, (3) avoid redundant eyebrow labels, and (4) avoid excessive UI redundancy.

---

## 3. Specialized Workspace Skills

Consult and utilize the specialized runbooks located in `.agents/skills/`:

* **`anti-slop`:** [`.agents/skills/anti-slop/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/anti-slop/SKILL.md) — Eliminating generic AI code boilerplate and enforcing the 4 scoped UI anti-slop rules (no meaningless gradients, no text/icon background colors, no redundant eyebrow labels, no excessive UI redundancy).
* **`code-quality`:** [`.agents/skills/code-quality/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/code-quality/SKILL.md) — Code formatting mannerisms, vertical spacing, and naming standards.
* **`web-design`:** [`.agents/skills/web-design/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/web-design/SKILL.md) — High-contrast, tactile UI styling with zero emojis and zero background colors on text/icons.
* **`mobile-web-ui`:** [`.agents/skills/mobile-web-ui/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/mobile-web-ui/SKILL.md) — Mobile-first web app viewports, dynamic heights (dvh), touch ergonomics, safe areas, and handheld booth scanner UX.
* **`nextjs-app-router`:** [`.agents/skills/nextjs-app-router/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/nextjs-app-router/SKILL.md) — Next.js 15 App Router boundaries, async request APIs, and route handlers.
* **`qr-crypto-idempotency`:** [`.agents/skills/qr-crypto-idempotency/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/qr-crypto-idempotency/SKILL.md) — Cryptographic tokens, timing-safe checks, and single-redemption transactions.
* **`appwrite-cloud`:** [`.agents/skills/appwrite-cloud/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/appwrite-cloud/SKILL.md) — Appwrite Cloud Storage and Realtime WebSockets.
* **`streaming-pdf-ticket`:** [`.agents/skills/streaming-pdf-ticket/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/streaming-pdf-ticket/SKILL.md) — Low-memory vector PDF generation using PDFKit.

---

## 4. Architecture & Operational Invariants

### 4.1 Next.js 15 App Router Discipline
* Default to Server Components. Push `'use client'` strictly to leaf components requiring hardware APIs or state.
* In Next.js 15, `params` and `searchParams` in layout/page components must be awaited.
* Use Server Actions and Route Handlers with Zod validation for all mutations.

### 4.2 Single-Redemption & Idempotency Rules
* Tickets only transition `INACTIVE -> ACTIVATED -> REDEEMED`.
* All redemptions execute via atomic conditional updates:
  ```sql
  UPDATE "TICKET_STUB"
  SET "status" = 'REDEEMED', "updated_at" = NOW()
  WHERE "stub_serial" = :stub_serial AND "status" = 'ACTIVATED'
  RETURNING *;
  ```
* Database enforces `UNIQUE(ticket_stub_id)` on the `VOTE` table.
* Validate `Idempotency-Key` headers on scan endpoints.

### 4.3 Heroku & Appwrite Operational Discipline
* Dyno memory ceiling: 512MB RAM on web dynos (`--max-old-space-size=384`).
* Never write files to the local ephemeral dyno disk.
* Stream batch-generated PDFs directly to Appwrite Storage (`bingo-cards-pdf` bucket).
* Broadcast live updates via Appwrite Realtime WebSocket channels.
* Connect to Heroku Postgres via PgBouncer in transaction mode (`&pgbouncer=true&connection_limit=5&statement_cache_size=0`).
