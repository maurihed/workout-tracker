# AGENTS.md

Gym Tracker — a mobile-first, gamified PWA for logging workouts.

**Start here:** `docs/ROADMAP.md` — phase status (what is done, what is next), spec/plan locations, and how to continue with the next phase.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind v4 · shadcn/ui · Prisma 7 · PostgreSQL · Auth.js v5 · TanStack Query + axios · Coolify deploy.

## Conventions

- **Client-first:** Server Components render static shells; all data flows through `app/api/*` Route Handlers consumed by axios + TanStack Query.
- **Layering:** thin Route Handler → service → repository. Services/repositories `import "server-only"`.
- **Auth scoping:** every query is scoped by the `userId` from `auth()`.
- **Validation:** one Zod schema per input.
- **Responses:** envelope `{ data }` on success, `{ error: { code, message, details? } }` on failure.
- **i18n:** `en` + `es`, keys must stay in parity; never hardcode user-facing copy.
- **UI:** mobile-first, tap targets ≥ 44px.
- **Prisma 7:** import `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client` (**never** `@prisma/client`); CLI config `prisma7.config.ts`.
- No comments in code unless asked.

## Commands

- `pnpm dev` · `pnpm build`
- `pnpm lint` · `pnpm typecheck`
- `pnpm test` · `pnpm test:integration` · `pnpm test:coverage` · `pnpm e2e`

Integration tests and migrations need Docker: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`, `docker compose up -d db`, `pnpm db:seed`.

## Process

Phases are delivered spec-first: brainstorm → spec (`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven TDD execution, keeping an audit trail in `.superpowers/sdd/<plan-slug>/`. Keep all gates green before finishing a branch.
