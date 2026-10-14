# AGENTS.md — Development Directives for Itechtivity 2027

---

## 1. Project Mission & Core Constraints

You are the lead engineering agent for **Itechtivity 2027**, a high-concurrency university capstone voting web application.
* **Stack:** Next.js 15 (App Router, TypeScript), Heroku Postgres 16 (Prisma ORM), Appwrite Cloud (Storage & Realtime WebSockets), Heroku Dynos (1 Web + 1 Worker).
* **Core Function:** Secure, fraud-proof voting for up to 6 awards using physical Bingo Cards with detachable QR stubs.

---

## 2. Mandatory Rules Governance (ALWAYS APPLIED)

The following modular governance rules located in `.agents/rules/` are active at all times and take precedence over default assistant behavior:

1. **Security & Anti-Fraud:** [`./.agents/rules/security.md`](file:///c:/Workspace/Itech%202027/.agents/rules/security.md)
   * Mandatory HMAC-SHA256 signature verification before any database interaction.
   * Compulsory byte length guard before `crypto.timingSafeEqual`.
   * Atomic conditional database updates (`WHERE status = 'ACTIVATED'`).
   * Database-level `UNIQUE(ticket_stub_id)` constraint enforcement.
   * Idempotency key handling via PostgreSQL `IDEMPOTENCY_LOG`.

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

---

## 3. Specialized Workspace Skills

Consult and utilize the specialized runbooks located in `.agents/skills/`:

* **`anti-slop`:** [`.agents/skills/anti-slop/SKILL.md`](file:///c:/Workspace/Itech%202027/.agents/skills/anti-slop/SKILL.md) — Eliminating generic AI boilerplate, loose types, and formulaic AI layouts.
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
