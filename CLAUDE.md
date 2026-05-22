# CLAUDE.md — TaxTrace project conventions

Instructions for Claude Code (and other AI assistants) working in this repo.
Read this before making changes.

## Project identity

**TaxTrace** — open public spending forensics for US federal government.
TypeScript everywhere. Bun + Hono backend, Next.js 16 + React 19 frontend,
PostgreSQL 17 + Apache AGE for graph storage. Built solo in 4 weeks by
Vidit Patankar (14, Gurgaon) in response to Elon Musk's 2026-05-21 SpaceXAI
hiring tweet.

## Hard rules

1. **TypeScript everywhere.** No Python. No Go. No Rust hand-written code.
   The only exception: SQL migrations.
2. **One commit per logical concern.** No mega-commits. Use Conventional
   Commits (`feat(scope):`, `fix(scope):`, `chore(scope):`, etc).
3. **No fake data, ever.** Every number in the UI must trace to a source
   row in the database. Anomaly detection results must link to evidence.
4. **No untyped boundaries.** Every API endpoint has a Zod schema.
   Every database query goes through Drizzle with inferred types.
5. **Apolitical framing.** TaxTrace is a transparency tool. Anyone (any side)
   can audit. No editorial commentary in the UI.

## Stack (canonical)

- **Runtime**: Bun 1.2+ everywhere
- **Backend framework**: Hono (lightweight, runs on Bun + Cloudflare Workers)
- **Frontend framework**: Next.js 16 (App Router, server components, ISR)
- **UI**: React 19 + TypeScript strict
- **Styling**: Tailwind v4 + shadcn/ui
- **Database**: PostgreSQL 17 on Neon + Apache AGE extension for graph
- **ORM**: Drizzle (TypeScript-first)
- **Search**: Meilisearch (sub-50ms full-text)
- **Network viz**: Cytoscape.js (WebGL, handles 50K+ nodes)
- **Data fetching**: TanStack Query
- **ETL**: nodejs-polars (Rust core, TS bindings)
- **Job queue**: BullMQ on Redis (Upstash)
- **Validation**: Zod
- **Tests**: Bun's built-in test runner + Playwright for E2E
- **Linting**: Biome (faster than ESLint, also formats)

## Workspace structure

```
taxtrace/
├── packages/        Shared TS packages (db, types, scrapers, etl, anomaly, ...)
├── apps/
│   ├── api/         Hono backend
│   ├── worker/      BullMQ worker
│   └── web/         Next.js frontend
├── infrastructure/  Docker + Railway + Vercel configs
└── tests/           Cross-package integration + E2E
```

## Useful commands

```bash
# Install everything
bun install

# Dev (all apps + workers concurrently via Turbo)
bun run dev

# Type check
bun run typecheck

# Tests
bun test

# Lint + format
bun run lint

# Build for prod
bun run build

# Database
bun run db:generate    # Drizzle migrations from schema
bun run db:migrate     # Apply migrations
bun run db:studio      # Drizzle Studio UI

# Data ingestion
bun run scrape:usa     # Pull USAspending
bun run scrape:fec     # Pull FEC
bun run etl:daily      # Full pipeline
```

## Things to avoid

- Python or anything that compiles to a non-TS runtime
- Pandas (use Polars), Prisma (use Drizzle), ElasticSearch (use Meilisearch),
  ESLint (use Biome), Next.js Pages Router (use App Router)
- Hardcoded data — every number comes from a real DB query
- Editorializing — TaxTrace shows facts, lets users draw conclusions
- Committing API keys, .env files, raw data CSVs

## Data sources

| Source | Type | API |
|---|---|---|
| USAspending.gov | Contracts + grants | https://api.usaspending.gov/ |
| FPDS | Federal procurement | bulk download |
| SAM.gov | Entities | https://api.sam.gov/ |
| OpenFEC | Donations | https://api.open.fec.gov/ |
| OpenSecrets | Lobbying + industry | bulk data |
| SEC EDGAR | Company filings | https://www.sec.gov/edgar/ |
| DOGE.gov | Cancelled contracts | scrape |
| Wikidata | Relationship facts | SPARQL endpoint |

## Naming

- Use Conventional Commits
- Package names: `@taxtrace/*` (e.g. `@taxtrace/db`, `@taxtrace/types`)
- Domain: `taxtrace.org` (target)
- GitHub: `github.com/vidigoat/taxtrace` (target — rename pending)

## Workflow

### Adding a feature
1. Update package(s)
2. Add tests (`*.test.ts` siblings)
3. Run `bun run typecheck && bun test`
4. Commit with `feat(<scope>):`
5. Push

### Adding a data source
1. New file in `packages/scrapers/`
2. Schema in `packages/db/schema.ts`
3. Drizzle migration
4. Worker job in `apps/worker/src/jobs/`
5. Daily cron entry
6. Tests with fixture data
