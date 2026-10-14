# Repository Map — Itechtivity 2027

## Project Overview
* **Name:** Itechtivity 2027 Voting System
* **Tech Stack:** Next.js 15 (TypeScript) + Heroku Postgres (Prisma) + Appwrite Cloud
* **Status:** System Design, Skills & Directives Formulated

## Workspace Structure
```
c:\Workspace\Itech 2027\
├── .git/                                    # Git repository metadata
├── .agents/
│   └── skills/
│       ├── anti-slop/SKILL.md               # Anti-slop engineering standards & quality locks
│       ├── nextjs-app-router/SKILL.md       # Next.js 15 App Router architecture & boundaries
│       ├── qr-crypto-idempotency/SKILL.md   # HMAC-SHA256, single-redemption & idempotency
│       ├── appwrite-cloud/SKILL.md          # Appwrite Cloud Storage & Realtime WebSockets
│       └── streaming-pdf-ticket/SKILL.md    # Low-memory streaming PDF ticket generator
├── AGENTS.md                                # Repository primary rules & craftsmanship gates
├── CONCEPT.md                               # Comprehensive concept, workflow, security & data model
├── TECHSTACK.md                             # Exhaustive tech stack, packages, Heroku & Appwrite spec
├── QA_REPORT.md                             # Senior QA Architect & DevOps report, runbook, load test
└── repository_map.md                        # Repository layout and spatial map
```

## Upcoming Source Tree (Next.js 15)
* `src/app/` — App Router routes (`/admin`, `/registration`, `/exhibitor`, `/production`, `/api`)
* `src/components/` — UI components (shadcn/ui, camera scanner, live tallies)
* `src/lib/` — Cryptography utilities, Appwrite client/server SDK, Prisma database client
* `src/workers/` — Asynchronous background PDF generator (`pg-boss` consumer)
* `prisma/` — PostgreSQL schema, migrations, seeders
