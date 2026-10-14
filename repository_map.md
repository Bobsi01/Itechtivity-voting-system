# Repository Map — Itechtivity 2027

## Project Overview
* **Name:** Itechtivity 2027 Voting System
* **Tech Stack:** Next.js (TypeScript) + PostgreSQL on Heroku
* **Status:** Architecture, Tech Stack & QA Review Phase

## Workspace Structure
```
c:\Workspace\Itech 2027\
├── .git/                  # Git repository metadata
├── CONCEPT.md             # Comprehensive concept, workflow, security & data model
├── TECHSTACK.md           # Exhaustive tech stack, packages, Heroku deployment spec
├── QA_REPORT.md           # Senior QA Architect & DevOps report, runbook, k6 load test
└── repository_map.md      # Repository layout and spatial map
```

## Upcoming Directories (Upon Implementation)
* `src/app/` — Next.js App Router (Routes: `/admin`, `/registration`, `/exhibitor`, `/production`, `/api`)
* `src/components/` — UI components (shadcn/ui, camera QR scanner, tally boards)
* `src/lib/` — Cryptography utilities (HMAC signature, QR generator), auth helpers, Prisma client
* `prisma/` — PostgreSQL schema, migrations, seeders
* `public/` — Static assets and branding
