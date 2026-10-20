# AGENTS.md - Development Directives for Itechtivity 2027

> **Author:** Daniel Bobis (GitHub: [@ItsMeYourNightmare](https://github.com/ItsMeYourNightmare))
> **Assisted by:** OpenAI Codex and Google Gemini

## Project context

Itechtivity 2027 is a university capstone voting application for up to six awards, using physical Bingo Cards with detachable QR stubs. Preserve its security, concurrency, and mobile usability requirements.

Stack: Next.js App Router with TypeScript, Supabase PostgreSQL 17 with Prisma/PgBouncer, and Appwrite Cloud for SSR hosting, Storage, Functions, and Realtime. Use [package.json](package.json) and the lockfile for current dependency versions.

## Required instructions

Before working, explicitly read all five rule files below. Links do not automatically load their contents. These rules apply throughout the task; skills and examples supplement them and must not override them.

- [Security](.agents/rules/security.md): HMAC verification, atomic redemption, idempotency, RBAC, validation, sessions, headers, secrets, and approval boundaries.
- [Architecture](.agents/rules/architecture.md): App Router boundaries, Appwrite/Supabase infrastructure, streaming, and persistence.
- [UI and UX](.agents/rules/ui-ux.md): Mobile-first layouts, accessibility, scanner feedback, and styling restrictions.
- [Code quality](.agents/rules/code-quality.md): Naming, spacing, comments, and student-friendly readability.
- [Code craftsmanship](.agents/rules/code-craftsmanship.md): Strict typing, concrete implementations, and explicit error handling.

Security boundaries remain mandatory: verify signatures before database operations, preserve atomic single-redemption and server-derived authorization, and follow the human-approval requirements in the security rules. Never emit emojis in responses, code, comments, or UI.

If guidance conflicts, preserve security and access controls; use the owning rule file above for its subject rather than copying requirements into other documents. Report unresolved conflicts before affected changes.

## Working safely

- Check `git status` before edits. Preserve unrelated local changes; stop if overlapping changes cannot be safely preserved.
- Use [repository_map.md](repository_map.md) to locate files, verifying paths against the checkout. Inspect root and `.github/` instructions applicable to the task.
- If the map and one targeted search cannot locate the target, request path clarification rather than searching directories without bounds.
- Trace callers and dependencies before changing shared behavior; update affected references together.
- Do not delete files, drop database tables/columns, force Git operations, or remove core environment configuration without explicit `CONFIRM` authorization. Show the exact command and `[REQUIRES CONFIRMATION: description]` before proceeding.
- Use the [evaluation guide](.agents/README.md) for architecture reviews, evidence requirements, and improvement proposals.

## Task-specific skills

Read the relevant runbook before its task. Rules define requirements; runbooks provide procedures and examples, not standalone production implementations.

- For craftsmanship review, read [anti-slop](.agents/skills/anti-slop/SKILL.md).
- For naming, formatting, and comments, read [code-quality](.agents/skills/code-quality/SKILL.md).
- For interface styling, read [web-design](.agents/skills/web-design/SKILL.md).
- For handheld layouts and scanner ergonomics, read [mobile-web-ui](.agents/skills/mobile-web-ui/SKILL.md).
- For routes, components, actions, and handlers, read [nextjs-app-router](.agents/skills/nextjs-app-router/SKILL.md).
- For qR signatures, redemption, and retries, read [qr-crypto-idempotency](.agents/skills/qr-crypto-idempotency/SKILL.md).
- For appwrite Storage and Realtime, read [appwrite-cloud](.agents/skills/appwrite-cloud/SKILL.md).
- For ticket PDF generation, read [streaming-pdf-ticket](.agents/skills/streaming-pdf-ticket/SKILL.md).
- For release versioning and attribution, read [versioning](.agents/skills/versioning/SKILL.md).

## Verification and delivery

Run checks relevant to the change; scripts are defined in [package.json](package.json):

- Code changes: `npm run lint` and `npm run build`.
- QR/signature changes: `npm run test:crypto`.
- PDF changes: `npm run test:pdf`.
- Ticket lifecycle changes: `npm run test:e2e:flow`.
- Audit/regression changes: `npm run test:audit`.
- UI changes: exercise affected pages and interactions at 360-430px before desktop validation.
- Documentation-only changes: check links, requirement coverage, consistency, and `git diff --check`; application tests are unnecessary unless executable behavior changes.

Use isolated test data for checks that mutate state. Report the change, checks actually performed, and remaining limitations; distinguish local evidence from production or physical-device validation.
