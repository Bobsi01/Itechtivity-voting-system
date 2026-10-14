# Repository Map — Itechtivity 2027

## Project Overview
* **Name:** Itechtivity 2027 Voting System
* **Tech Stack:** Next.js (TypeScript) + PostgreSQL
* **Status:** Concept & Architecture Phase

## Workspace Structure
```
c:\Workspace\Itech 2027\
├── .git/                  # Git repository metadata
├── CONCEPT.md             # Comprehensive concept, workflow, security & data model
└── repository_map.md      # Repository layout and spatial map
```

## Upcoming Directories (Upon Implementation)
* `src/app/` — Next.js App Router (Routes: `/admin`, `/registration`, `/exhibitor`, `/production`, `/tally`)
* `src/components/` — UI components (shadcn/ui, camera QR scanner, tally boards)
* `src/lib/` — Cryptography utilities (HMAC signature, QR generator), auth helpers, Prisma client
* `prisma/` — PostgreSQL schema, migrations, seeders
* `public/` — Static assets and branding
