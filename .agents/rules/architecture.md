# Architecture and Operational Rules

## App Router boundaries

- Default to Server Components. Restrict `'use client'` to leaf components requiring state or browser/hardware APIs.
- Await `params` and `searchParams` in page and layout components.
- Use Server Actions and Route Handlers with Zod validation for mutations, following the [security rules](security.md).
- Resolve installed dependency versions from `package.json` and the lockfile rather than version labels in older guides.

## Appwrite Cloud and Supabase

- Infrastructure is exclusively Appwrite Cloud (Sites / SSR Hosting, Storage, Functions, and Realtime WebSockets) plus Supabase PostgreSQL; do not introduce Heroku infrastructure.
- Connect to Supabase through the PgBouncer transaction pooler with `pgbouncer=true&connection_limit=5`.
- Stream batch-generated PDFs directly to the Appwrite Cloud Storage `bingo-cards-pdf` bucket. Render QR codes as PDFKit vector paths rather than raster Base64 PNG images, and stream large card batches in chunks.
- Broadcast live updates through Appwrite Realtime WebSocket channels `votes`, `registration`, `system_config`, and `audit`. Preserve server-authorized tenant scope for every payload.
- Containers are stateless and ephemeral. Use in-memory streaming and Appwrite persistence; never rely on local container storage for production files.
- Verify configured memory and runtime limits when evaluating resource use. Older guides describe a 512MB budget with `--max-old-space-size=384`; those values are not proof of current hosting limits.
