# Repository Map — Itechtivity 2027

## Project Overview
* **Name:** Itechtivity 2027 Voting System
* **Tech Stack:** Next.js 15 (TypeScript) + Heroku Postgres (Prisma) + Appwrite Cloud
* **Status:** System Architecture, Governance Rules, Skills & Runbooks Established

## Workspace Structure
```
c:\Workspace\Itech 2027\
├── .git/                                    # Git repository metadata
├── .agents/
│   ├── rules/                               # Modular governance & quality rules
│   │   ├── security.md                      # Security, HMAC, timing attacks, atomic locks, RBAC
│   │   ├── ui-ux.md                         # UI rules: NO emojis, NO background color on text/icons
│   │   ├── code-craftsmanship.md            # Anti-slop, zero 'any', no trivial comments
│   │   └── code-quality.md                  # Student-friendly naming, vertical spacing, balanced comments
│   └── skills/                              # Modular specialized agent workflows
│       ├── anti-slop/SKILL.md               # Anti-slop craftsmanship guidelines
│       ├── code-quality/SKILL.md            # Code formatting mannerisms, spacing, and naming standards
│       ├── web-design/SKILL.md              # Web design & UI styling standards (Zero emoji/bg-color)
│       ├── nextjs-app-router/SKILL.md       # Next.js 15 App Router architecture & boundaries
│       ├── qr-crypto-idempotency/SKILL.md   # HMAC-SHA256, single-redemption & idempotency
│       ├── appwrite-cloud/SKILL.md          # Appwrite Cloud Storage & Realtime WebSockets
│       └── streaming-pdf-ticket/SKILL.md    # Low-memory streaming vector PDF ticket generator
├── AGENTS.md                                # Root repository development directives
├── CONCEPT.md                               # Comprehensive concept, workflow, security & data model
├── TECHSTACK.md                             # Exhaustive tech stack, packages, Heroku & Appwrite spec
├── QA_REPORT.md                             # Senior QA Architect & DevOps report, runbook, load test
├── LESSONS_LEARNED.md                       # Historical defects, failure modes & prevention log
└── repository_map.md                        # Repository layout and spatial map
```

## Upcoming Source Tree (Next.js 15)
* `src/app/` — App Router routes (`/admin`, `/registration`, `/exhibitor`, `/production`, `/api`)
* `src/components/` — UI components (shadcn/ui, camera scanner, live tallies)
* `src/lib/` — Cryptography utilities, Appwrite client/server SDK, Prisma database client
* `src/workers/` — Asynchronous background PDF generator (`pg-boss` consumer)
* `prisma/` — PostgreSQL schema, migrations, seeders
