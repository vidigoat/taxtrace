# CLAUDE.md — TaxTrace project conventions

Instructions for Claude Code (and other AI assistants) working in this repo.
Read this before making changes.

## Project identity

**TaxTrace** — open public spending forensics for US federal government.
Frontend: https://taxtrace-three.vercel.app. API: AWS Lambda + API Gateway.
Built solo by Vidit Patankar (14, Gurgaon) in response to Elon Musk's
2026-05-21 SpaceXAI hiring tweet.

---

## ⚠️ HARD RULES — read these first, never break them

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

**Before implementing anything:**

- **State your assumptions explicitly.** If uncertain, ask.
- **If multiple interpretations exist, present them — don't pick silently.**
- **If a simpler approach exists, say so.** Push back when warranted.
- **If something is unclear, stop.** Name what's confusing. Ask.

Bad: silently picking Next.js when the user said "React" because you
defaulted to a convention. Good: "you said React only — I see two paths,
Vite + React Router (smaller, simpler) vs Next.js (more conventions, more
opinionated). I'd pick Vite. OK to proceed?"

### 2. Goal-driven execution

Define success criteria. Loop until verified.

**Transform tasks into verifiable goals:**

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
- "Deploy to AWS" → "End-to-end: frontend hits live API, returns real data, HTTP 200"

**For multi-step tasks, state a brief plan first:**

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

**Strong success criteria let you loop independently.** Weak criteria
("make it work") require constant clarification. If a step lacks a
verification check, you don't know when it's done.

### 3. Absolute stack constraint — TypeScript + React + Vite only

| Layer | Tool — no substitutes |
|---|---|
| Language | TypeScript (strict mode) |
| Frontend framework | **React + React Router** (never Next.js, Remix, Solid, Astro, Svelte, Vue, Angular) |
| Frontend build | **Vite** (never Webpack, Turbopack, Parcel, esbuild standalone) |
| Backend framework | Hono |
| Backend runtime | Bun (dev/scripts) or Node 22 on Lambda (production) |
| Database | SQLite (bundled in Lambda) or Postgres (when scale demands) |
| ORM | Drizzle |
| Validation | Zod |
| Styling | Tailwind v4 |
| UI components | shadcn/ui or hand-rolled (never Material-UI, Chakra) |
| Charts | Recharts |
| Graph viz | Cytoscape.js |
| Data fetching | TanStack Query |
| Tests | Bun test + Playwright for E2E |
| Lint/format | Biome |
| Deploy (frontend) | Vercel |
| Deploy (backend) | AWS Lambda + API Gateway HTTP API |

**The only exception:** raw SQL migrations.

If you're tempted to use something not on this list — **stop and ask**.
Vidit explicitly does not want Next.js. If you reach for it, use Vite + React.

### 4. One commit per logical concern

No mega-commits. Use Conventional Commits:
`feat(scope):`, `fix(scope):`, `chore(scope):`, `refactor(scope):`,
`docs(scope):`, `test(scope):`.

### 5. No fake data, ever

Every number in the UI traces to a source row in the database.
Anomaly detection results link to evidence (contract IDs, donation IDs).
Demo/mock data only ever appears with an explicit `(demo)` label.

### 6. No untyped boundaries

Every API endpoint has a Zod schema. Every database query goes through
Drizzle with inferred types. No `any`. No `as unknown as X` casts.

### 7. Apolitical framing

TaxTrace is a transparency tool. Anyone, any side, can audit. The UI
shows facts, links evidence, lets users draw conclusions. No editorial
commentary in code, copy, or commit messages.

### 8. Never push code that breaks CI

**Every push to `main` triggers GitHub Actions CI. Every CI failure sends
Vidit an email. Be respectful of his inbox.**

Before every `git push`:

1. **Run the same commands CI runs, locally first.** Currently CI runs:
   - `bun install --frozen-lockfile`
   - `bun test`
   - `apps/web` → `npm install --no-workspaces --no-package-lock --legacy-peer-deps && npm run build`
   - `apps/lambda` → same install, then `node build.js`
2. **Pass before push.** If any of those fail locally, fix it before pushing.
3. **If you change dependencies**, regenerate the lockfile:
   `rm bun.lock && bun install` → commit the new lockfile **in the same push** as the dep change.
4. **If you change `.github/workflows/ci.yml`**, run the new commands locally end-to-end before pushing the workflow change.
5. **If a fix is going to take more than 3 commits**, work on a branch and squash before merging to `main`, so each push to `main` represents a known-good state.

**Don't push and hope.** The email cost is real (10-20 messages per failed batch). The fix cost is small (run the commands first).
