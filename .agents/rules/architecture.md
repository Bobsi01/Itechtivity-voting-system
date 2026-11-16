# Architecture and Operational Rules

## App Router boundaries

- Default to Server Components. Restrict `'use client'` to leaf components requiring state or browser/hardware APIs.
- Await `params` and `searchParams` in page and layout components.
- Use Next.js Route Handlers (`src/app/api/**/route.ts`) with Web `Request`, bounded JSON parsing (`readBoundedJson`), and Zod validation for mutations, paired with Edge Middleware checks in `src/middleware.ts` and following the [security rules](security.md).
- Resolve installed dependency versions from `package.json` and the lockfile rather than version labels in older guides.

## Appwrite Cloud and Supabase

- Infrastructure is exclusively Appwrite Cloud (Sites / SSR Hosting, Storage, Functions, and Realtime WebSockets) plus Supabase PostgreSQL; do not introduce Heroku infrastructure.
- Connect to Supabase through the PgBouncer transaction pooler with `pgbouncer=true&connection_limit=5`.
- Render printable 4-up A4 bingo sheets (2x2 quadrants, bounded batches of 4 to 200 cards) with PDFKit vector QR paths (`renderVectorQR` at error correction level `M`) rather than raster Base64 PNG images, and upload batch PDFs to the Appwrite Cloud Storage `bingo-cards-pdf` bucket (with booth logos stored in the `booth-logos` bucket).
- Broadcast live updates through Appwrite Realtime WebSocket database collections `votes`, `pdf_batches`, and `system_events` (carrying `REGISTRATION_EVENT`, `CARD_BATCH_ACTIVATED`, `SYSTEM_CONFIG_EVENT`, and `AUDIT_EVENT` payloads validated by `src/lib/appwrite/schemas.ts`). Preserve server-authorized tenant scope for every payload.
- Containers are stateless and ephemeral. Use in-memory streaming and Appwrite persistence; never rely on local container storage for production files.
- Verify configured memory and runtime limits when evaluating resource use. Older guides describe a 512MB budget with `--max-old-space-size=384`; those values are not proof of current hosting limits.
