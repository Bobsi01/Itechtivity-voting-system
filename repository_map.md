# Repository Map — Itechtivity 2027

## Project Overview
* **Name:** Itechtivity 2027 Voting System
* **Tech Stack:** Next.js App Router (TypeScript) + Supabase PostgreSQL (Prisma) + Appwrite Cloud
* **Status:** System Architecture, Governance Rules, Skills & Runbooks Established

## Workspace Structure
```
c:\Workspace\Itech 2027\
├── .git/                                    # Git repository metadata
├── .agents/
│   ├── rules/                               # Modular governance & quality rules
│   │   ├── architecture.md                  # App Router, infrastructure, streaming & persistence
│   │   ├── security.md                      # Security, HMAC, timing attacks, atomic locks, RBAC
│   │   ├── ui-ux.md                         # UI rules: NO emojis, NO background color on text/icons
│   │   ├── code-craftsmanship.md            # Anti-slop, zero 'any', no trivial comments
│   │   └── code-quality.md                  # Student-friendly naming, vertical spacing, balanced comments
│   ├── skills/                              # Modular specialized agent workflows
│   │   ├── anti-slop/SKILL.md               # Anti-slop craftsmanship guidelines
│   │   ├── code-quality/SKILL.md            # Code formatting mannerisms, spacing, and naming standards
│   │   ├── web-design/SKILL.md              # Web design & UI styling standards (Zero emoji/bg-color)
│   │   ├── mobile-web-ui/SKILL.md           # Mobile-first web app viewports, dvh, touch ergonomics & PWA UX
│   │   ├── nextjs-app-router/SKILL.md       # Next.js 16 App Router architecture, middleware & route handler boundaries
│   │   ├── qr-crypto-idempotency/SKILL.md   # HMAC-SHA256, single-redemption & idempotency
│   │   ├── appwrite-cloud/SKILL.md          # Appwrite Cloud Storage & Realtime WebSockets
│   │   ├── streaming-pdf-ticket/SKILL.md    # Vector PDF A4 quadrant sheet & ticket stub generator
│   │   └── versioning/SKILL.md              # 3-tier semantic versioning & points-based patch scoring
│   └── README.md                            # Agent evaluation guidelines & architectural checklist
├── README.md                                # Root repository guide, user roles & CSD contribution guide
├── AGENTS.md                                # Root repository development directives
├── CONCEPT.md                               # Comprehensive concept, workflow, security & data model
├── TECHSTACK.md                             # Exhaustive tech stack, packages, Supabase & Appwrite spec
├── QA_REPORT.md                             # Senior QA Architect & DevOps report, runbook, load test
├── LESSONS_LEARNED.md                       # Historical defects, failure modes & prevention log
└── repository_map.md                        # Repository layout and spatial map
```

## Source Tree Reference
* `src/app/` — App Router routes (`/admin`, `/registration`, `/exhibitor`, `/production`, `/presentation`, `/projects`, `/validate`, `/notifications`, `/login`, `/api`)
* `src/components/` — UI components (`admin`, `exhibitor`, `notifications`, `presentation`, `production`, `public`, `registration`, `ui`)
* `src/lib/` — Cryptography utilities, Appwrite client/server SDK, Prisma database client, PDF engine, security & versioning
* `functions/` — Appwrite Cloud Functions (`generate-bingo-pdf`, `cleanup-idempotency-sessions`, `compute-leaderboard-snapshot`)
* `prisma/` — PostgreSQL schema, migrations, seeders
