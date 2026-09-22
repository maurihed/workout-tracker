# Gym Tracker — Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Gym Tracker foundation — a deployable Next.js app with the design system, i18n, database schema, OAuth auth, user profiles, the exercise catalog, and the conventions/CI every later phase builds on.

**Architecture:** Single Next.js 16 (App Router) app, **client-first**: RSC renders static shells; all data flows through `app/api/*` Route Handlers consumed by axios + TanStack Query. Server logic is layered thin-handler → service → repository. Prisma/Postgres on Coolify. Auth.js v5 (database sessions, Google + Facebook). Reusable skills `nextjs-app-router`, `typescript-strict-patterns`, `prisma-postgres-optimization`, `tailwind-theme-builder`, `shadcn-ui`, and `vercel-react-best-practices` are installed in `.opencode/skills/` and must be consulted for their domains.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Tailwind v4, shadcn/ui, Prisma + PostgreSQL, Auth.js v5, next-intl, axios, TanStack Query v5, Zustand, Zod, react-hook-form, Vitest + React Testing Library + Playwright, ESLint + Prettier, pnpm, Docker.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (this plan implements spec §4.2 Phase 1; executors read both).

## Global Constraints

- **Runtime/tooling:** Node 22 LTS pinned in `.nvmrc` and `package.json` `engines`; **pnpm** is the package manager (single `pnpm-lock.yaml`).
- **Next.js 16 App Router only** — never `pages/`, never `next/router`. Request APIs (`params`, `searchParams`, `cookies()`, `headers()`) are async and must be awaited.
- **TypeScript strict**, no `any`; enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (see Task 1 note if a third-party type breaks).
- **Client-first data flow** (spec §5.1): RSC for shells only; data via `app/api/*` Route Handlers + axios + TanStack Query. Do not call Prisma from pages.
- **Layering (spec §5.2):** Route Handler (parse/validate/auth/error-map/status) → Service (business rules) → Repository (Prisma only). Repositories and services start with `import "server-only"`.
- **API envelope (spec §10):** success `{ "data": <payload> }`; error `{ "error": { "code", "message", "details"? } }`. Never return raw Prisma models without `select`.
- **Validation:** one shared Zod schema per input, used by both client and server. Never hand-roll body validation.
- **Authorization:** every query/mutation is scoped by `userId` from the Auth.js session. Never trust ids sent by the client.
- **i18n:** `next-intl`, locales `en` (default) + `es`, locale-prefixed routes `app/[locale]/...`; `/api` is not localized. No hardcoded user-facing copy.
- **Design (spec §12):** mobile-first; primary `#F97316`, accent `#22C55E`, Barlow Condensed headings + Barlow body; full **light + dark** semantic tokens; ≥44px touch targets; vector icons only (Phosphor) — no emoji as icons; WCAG AA contrast in both themes.
- **Testing:** Vitest + RTL for unit/component (MSW for HTTP), Playwright for e2e. Pure domain logic gets unit tests; no task is done with failing tests.
- **Commits:** Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`), one logical change per commit.

## Review Focus

Five input classes the spec implies but no single task's happy-path tests will exercise. Each is pinned to a test in the owning task.

1. **OAuth identity with no email** — Facebook can return an account without an email. `User.email` must be nullable and linking/collision logic must not crash. (Task 6)
2. **Invalid IANA timezone** — a client can PATCH `timezone: "Mars/Phobos"`. It must be rejected with a 400, not stored and later crash streak math. (Task 8)
3. **Re-running the catalog seed** — seeding twice must not duplicate exercises; `sourceId` upsert must be idempotent. (Task 9)
4. **Catalog search edge inputs** — empty/whitespace `q`, `%`/`_` wildcards, and `limit` over a max must be handled, never thrown. (Task 10)
5. **Account deletion with no data / export with no data** — deletion must succeed and cascade; export must return a valid empty-but-well-formed document. (Task 13)

---

### Task 1: Project scaffold + quality tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.nvmrc`, `.prettierrc.json`, `eslint.config.mjs`, `vitest.config.ts`, `tests/setup.ts`, `tests/unit/utils.test.ts`, `src/lib/utils.ts`, `.gitignore` (append), `.env.example`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`; scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `e2e`, `db:*`.

- [ ] **Step 1: Scaffold Next.js into the repo**

Run (from repo root `gym/`):

```bash
pnpm dlx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-pnpm
```

Expected: files created; `docs/`, `.opencode/`, and `.git/` are left intact. If create-next-app refuses because the directory is non-empty, scaffold in a temp dir and move `app/ src/ public/ package.json next.config.* tsconfig.json postcss.config.* eslint.config.*` into the repo, then re-run `pnpm install`.

- [ ] **Step 2: Pin the toolchain**

Create `.nvmrc`:

```text
22
```

Add to `package.json` (keep existing fields):

```json
{
  "engines": { "node": ">=22", "pnpm": ">=9" },
  "packageManager": "pnpm@12.5.1",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test --pass-with-no-tests",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed/index.ts",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 3: Add dev dependencies**

```bash
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event msw @playwright/test prettier prettier-plugin-tailwindcss tsx dotenv-cli
pnpm add zod axios @tanstack/react-query zustand next-intl
```

- [ ] **Step 4: Tighten `tsconfig.json`**

Set `compilerOptions` to include (in addition to create-next-app defaults):

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true
  }
}
```

> Note: `exactOptionalPropertyTypes` occasionally conflicts with third-party generics. If a dependency's types fail and cannot be fixed locally, set it to `false` and record why in `docs/superpowers/notes/tsconfig.md`. Do not remove the other strict flags.

- [ ] **Step 5: Add Vitest config and setup**

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

// `server-only` throws when imported outside a React Server environment. Tests
// import server modules directly, so alias it to an empty stub in tests only.
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
})
```

Create `tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
```

Create `tests/stubs/server-only.ts`:

```ts
export {}
```

The integration Vitest config (created in Task 5) must include the same `resolve.alias` entry for `server-only`.

- [ ] **Step 6: Write the first failing test**

Create `tests/unit/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("merges conflicting tailwind classes, last wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })

  it("drops falsy values", () => {
    expect(cn("text-sm", false, undefined, "font-bold")).toBe("text-sm font-bold")
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "@/lib/utils"`.

- [ ] **Step 8: Implement `src/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

Add `clsx` and `tailwind-merge`: `pnpm add clsx tailwind-merge`.

- [ ] **Step 9: Run tests, lint, and typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all PASS; no lint/type errors.

- [ ] **Step 10: Add Prettier config and `.env.example`**

Create `.prettierrc.json`:

```json
{
  "semi": false,
  "singleQuote": false,
  "trailingComma": "all",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

Create `.env.example`:

```dotenv
DATABASE_URL="postgresql://gym:gym@localhost:5432/gym?schema=public"
AUTH_SECRET="replace-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
FACEBOOK_CLIENT_ID=""
FACEBOOK_CLIENT_SECRET=""
SENTRY_DSN=""
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js app with strict ts, vitest, and quality scripts"
```

---

### Task 2: Tailwind v4 theme + shadcn/ui + design tokens + ThemeProvider

**Files:**
- Create: `components.json`, `src/components/theme-provider.tsx`, `src/components/theme-toggle.tsx`, `src/components/ui/*` (generated), `tests/unit/theme.test.tsx`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/fonts.ts`

**Interfaces:**
- Consumes: `cn` from Task 1.
- Produces: `<ThemeProvider>`, `<ThemeToggle />`, semantic tokens (`--color-primary`, etc.) usable as `bg-primary`, `text-foreground` in both themes.

- [ ] **Step 1: Consult the installed skills**

Read `.opencode/skills/tailwind-theme-builder/SKILL.md` and follow its four-step CSS architecture (`:root` + `.dark` outside `@layer`, `@theme inline`, base layer, ThemeProvider). Read `.opencode/skills/shadcn-ui/SKILL.md` for component install order.

- [ ] **Step 2: Initialize shadcn/ui**

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label sonner dropdown-menu sheet avatar skeleton badge
```

Expected: `components.json` created; components under `src/components/ui/`.

- [ ] **Step 3: Write the failing test**

Create `tests/unit/theme.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ThemeProvider } from "@/components/theme-provider"

describe("ThemeProvider", () => {
  it("renders children with the dark class applied by default", async () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <span>hello</span>
      </ThemeProvider>,
    )
    expect(screen.getByText("hello")).toBeInTheDocument()
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    )
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test tests/unit/theme.test.tsx`
Expected: FAIL — cannot resolve `@/components/theme-provider`.

- [ ] **Step 5: Implement the theme provider**

```bash
pnpm add next-themes
```

Create `src/components/theme-provider.tsx`:

```tsx
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ComponentProps } from "react"

export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 6: Implement the toggle and self-hosted fonts**

Create `src/lib/fonts.ts`:

```ts
import { Barlow, Barlow_Condensed } from "next/font/google"

export const fontBody = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
})

export const fontHeading = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
})
```

Create `src/components/theme-toggle.tsx`:

```tsx
"use client"

import { Monitor, Moon, Sun } from "@phosphor-icons/react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Sun className="size-5 dark:hidden" aria-hidden="true" />
          <Moon className="hidden size-5 dark:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="size-4" aria-hidden="true" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="size-4" aria-hidden="true" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="size-4" aria-hidden="true" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

Add the icon library: `pnpm add @phosphor-icons/react`.

- [ ] **Step 7: Apply the design tokens in `globals.css`**

In `src/app/globals.css`, define `:root` (light) and `.dark` values for at minimum: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary` (`hsl(24.6 95% 53.1%)` ≈ `#F97316`), `--primary-foreground`, `--secondary`, `--accent`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--destructive`, `--success` (`#22C55E`), `--radius`. Map them under `@theme inline` (`--color-background: var(--background)`, etc.). Check dark-mode contrast independently (spec §12) — normal text ≥ 4.5:1 in both themes.

- [ ] **Step 8: Wire the root layout**

Modify `src/app/layout.tsx` to add `fontBody.variable` + `fontHeading.variable` to `<html>`, `suppressHydrationWarning`, and wrap children in `<ThemeProvider>` and add `<Sonner />` (from `src/components/ui/sonner.tsx`).

- [ ] **Step 9: Run tests, lint, typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add tailwind v4 theme tokens, shadcn/ui, and dark mode"
```

---

### Task 3: i18n with next-intl (EN + ES) and locale routing

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/messages/en.json`, `src/i18n/messages/es.json`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`, `tests/unit/i18n.test.ts`
- Modify: `src/proxy.ts` (created here), `next.config.ts`

**Interfaces:**
- Consumes: `ThemeProvider` (Task 2).
- Produces: `routing` (next-intl config with `locales: ["en","es"]`, `defaultLocale: "en"`); `setRequestLocale` usage; message namespace keys used by later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/i18n.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

describe("i18n messages", () => {
  it("en and es expose identical keys", () => {
    expect(keys(es).sort()).toEqual(keys(en).sort())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/i18n.test.ts`
Expected: FAIL — cannot resolve message files.

- [ ] **Step 3: Add the message dictionaries**

Create `src/i18n/messages/en.json`:

```json
{
  "app": { "name": "Gym Tracker", "tagline": "Follow your routine. See your progress." },
  "nav": { "dashboard": "Dashboard", "routines": "Routines", "workout": "Workout", "progress": "Progress", "profile": "Profile" },
  "common": { "loading": "Loading…", "error": "Something went wrong", "retry": "Retry", "empty": "Nothing here yet", "save": "Save", "cancel": "Cancel" },
  "auth": { "signIn": "Sign in", "signInWithGoogle": "Continue with Google", "signInWithFacebook": "Continue with Facebook", "signOut": "Sign out" },
  "legal": { "privacy": "Privacy Policy", "terms": "Terms of Service" }
}
```

Create `src/i18n/messages/es.json` with the same keys and Spanish values (e.g. `"name": "Gym Tracker"`, `"tagline": "Sigue tu rutina. Mira tu progreso."`, `"dashboard": "Panel"`, `"routines": "Rutinas"`, `"workout": "Entrenamiento"`, `"progress": "Progreso"`, `"profile": "Perfil"`, `"loading": "Cargando…"`, `"error": "Algo salió mal"`, `"retry": "Reintentar"`, `"empty": "Aún no hay nada"`, `"save": "Guardar"`, `"cancel": "Cancelar"`, `"signIn": "Iniciar sesión"`, `"signInWithGoogle": "Continuar con Google"`, `"signInWithFacebook": "Continuar con Facebook"`, `"signOut": "Cerrar sesión"`, `"privacy": "Política de privacidad"`, `"terms": "Términos del servicio"`).

- [ ] **Step 4: Add routing + request config**

Create `src/i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
})

export type Locale = (typeof routing.locales)[number]
```

Create `src/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server"
import { hasLocale } from "next-intl"
import { routing } from "./routing"

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  }
})
```

- [ ] **Step 5: Create the `[locale]` layout and home page**

Create `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider, hasLocale } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

import { ThemeProvider } from "@/components/theme-provider"
import { routing } from "@/i18n/routing"
import { fontBody, fontHeading } from "@/lib/fonts"

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fontBody.variable} ${fontHeading.variable}`}
    >
      <body className="bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

Delete the old `src/app/layout.tsx` and `src/app/page.tsx` (they now live under `[locale]`), and create `src/app/[locale]/page.tsx`:

```tsx
import { setRequestLocale } from "next-intl/server"
import { useTranslations } from "next-intl"

export default function HomePage() {
  const t = useTranslations("app")
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="font-heading text-4xl font-bold">{t("name")}</h1>
        <p className="text-muted-foreground mt-2">{t("tagline")}</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Wire the plugin and proxy**

Modify `next.config.ts` to wrap with `createNextIntlPlugin("./src/i18n/request.ts")`. Create `src/proxy.ts` (full auth logic arrives in Task 7; for now only locale handling):

```ts
import createMiddleware from "next-intl/middleware"
import { routing } from "@/i18n/routing"

export default createMiddleware(routing)

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] }
```

- [ ] **Step 7: Run tests, lint, typecheck, and build**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS; `/en` and `/es` prerender.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add next-intl with en/es locale routing"
```

---

### Task 4: Domain + API conventions (errors, envelope, axios, React Query, Zustand)

**Files:**
- Create: `src/lib/api-error.ts`, `src/lib/api-response.ts`, `tests/unit/api-error.test.ts`, `src/lib/axios.ts`, `src/lib/query-client.ts`, `src/components/query-provider.tsx`, `src/stores/ui-store.ts`

**Interfaces:**
- Consumes: nothing (framework-level).
- Produces:
  - `class ApiError extends Error { status: number; code: string; details?: unknown }`
  - Subclasses: `ValidationError` (400), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429)
  - `toApiError(error: unknown): NextResponse`
  - `ok<T>(data: T, init?: ResponseInit): NextResponse`
  - `api` (axios instance), `createQueryClient(): QueryClient`, `<QueryProvider>`
  - `useUiStore` (Zustand)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/api-error.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
  toApiError,
} from "@/lib/api-error"

describe("toApiError", () => {
  it("maps a known ApiError to its status and envelope", async () => {
    const res = toApiError(new NotFoundError("Routine not found"))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Routine not found" },
    })
  })

  it("includes validation details when provided", async () => {
    const res = toApiError(new ValidationError("Invalid", { name: ["Required"] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details).toEqual({ name: ["Required"] })
  })

  it("maps unknown errors to a generic 500 without leaking the message", async () => {
    const res = toApiError(new Error("db password is hunter2"))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: { code: "internal_error", message: "Something went wrong" },
    })
  })

  it("maps conflicts and preserves status from a raw ApiError", () => {
    expect(toApiError(new ConflictError("dup")).status).toBe(409)
    expect(toApiError(new ApiError(418, "teapot", "nope")).status).toBe(418)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/api-error.test.ts`
Expected: FAIL — cannot resolve `@/lib/api-error`.

- [ ] **Step 3: Implement `src/lib/api-error.ts`**

```ts
import { NextResponse } from "next/server"

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_error", message, details)
  }
}
export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required") {
    super(401, "unauthorized", message)
  }
}
export class ForbiddenError extends ApiError {
  constructor(message = "Not allowed") {
    super(403, "forbidden", message)
  }
}
export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, "not_found", message)
  }
}
export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(409, "conflict", message)
  }
}
export class RateLimitError extends ApiError {
  constructor(message = "Too many requests") {
    super(429, "rate_limited", message)
  }
}

export function toApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    )
  }

  console.error("Unhandled API error", error)
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 },
  )
}
```

- [ ] **Step 4: Implement the success helper**

Create `src/lib/api-response.ts`:

```ts
import { NextResponse } from "next/server"

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init)
}
```

- [ ] **Step 5: Implement the axios client and React Query provider**

Create `src/lib/axios.ts`:

```ts
import axios from "axios"

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
})

export type ApiEnvelope<T> = { data: T }
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown }
}
```

Create `src/lib/query-client.ts`:

```ts
import { QueryClient } from "@tanstack/react-query"

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    },
  })
}
```

Create `src/components/query-provider.tsx`:

```tsx
"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"

import { createQueryClient } from "@/lib/query-client"

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

Wrap `children` with `<QueryProvider>` inside `src/app/[locale]/layout.tsx`.

- [ ] **Step 6: Create the Zustand store**

Create `src/stores/ui-store.ts`:

```ts
import { create } from "zustand"

type UiState = {
  lastRoutineId: string | null
  setLastRoutineId: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  lastRoutineId: null,
  setLastRoutineId: (lastRoutineId) => set({ lastRoutineId }),
}))
```

- [ ] **Step 7: Run tests, lint, typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add api error/envelope conventions, axios client, and react query provider"
```

---

### Task 5: Prisma + Postgres foundation (Auth schema, client, migrations, local DB)

**Files:**
- Create: `prisma/schema.prisma`, `docker-compose.yml`, `src/lib/prisma.ts`, `prisma/seed/index.ts`, `tests/integration/prisma.test.ts`, `.env`
- Modify: `.gitignore`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `prisma` singleton from `@/lib/prisma`; `docker-compose` Postgres on `localhost:5432`; Prisma models `User`, `Account`, `Session`, `VerificationToken`.

- [ ] **Step 1: Consult the optimization skill and add the local database**

Read `.opencode/skills/prisma-postgres-optimization/SKILL.md`. Create `docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: gym
      POSTGRES_PASSWORD: gym
      POSTGRES_DB: gym
    ports:
      - "5432:5432"
    volumes:
      - gym-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gym -d gym"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  gym-db:
```

Run: `docker compose up -d db`

- [ ] **Step 2: Initialize Prisma**

```bash
pnpm add -D prisma
pnpm add @prisma/client
pnpm dlx prisma init --datasource-provider postgresql
```

Set `prisma/schema.prisma` generator to emit the client:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Copy `.env.example` to `.env` and confirm `DATABASE_URL` points at the compose DB.

- [ ] **Step 3: Add the Auth.js adapter models**

Append to `prisma/schema.prisma`:

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts Account[]
  sessions Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
}
```

- [ ] **Step 4: Run the first migration**

```bash
pnpm db:migrate --name init_auth
pnpm db:generate
```
Expected: `prisma/migrations/*_init_auth` created; tables exist.

- [ ] **Step 5: Implement the Prisma singleton**

Create `src/lib/prisma.ts`:

```ts
import "server-only"

import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

- [ ] **Step 6: Write the integration test**

Create `tests/integration/prisma.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"

describe("prisma connection", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } })
  })

  it("creates a user with a nullable email and cascades sessions", async () => {
    const user = await prisma.user.create({
      data: { name: "No Email", email: null },
    })
    expect(user.id).toBeTruthy()
    expect(user.email).toBeNull()

    await prisma.session.create({
      data: {
        sessionToken: `tok_${user.id}`,
        userId: user.id,
        expires: new Date(Date.now() + 60_000),
      },
    })

    await prisma.user.delete({ where: { id: user.id } })
    const sessions = await prisma.session.count({ where: { userId: user.id } })
    expect(sessions).toBe(0)
  })
})
```

Add an integration config `vitest.integration.config.ts` reusing `vitest.config.ts` but `include: ["tests/integration/**/*.test.ts"]`, `environment: "node"`, `setupFiles: []`. Add script `"test:integration": "vitest run --config vitest.integration.config.ts"`.

- [ ] **Step 7: Run the test**

Run: `pnpm test:integration`
Expected: PASS (requires `docker compose up -d db`).

- [ ] **Step 8: Add the seed entrypoint**

Create `prisma/seed/index.ts`:

```ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("seed: nothing to seed yet")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

Run: `pnpm db:seed`
Expected: prints `seed: nothing to seed yet`.

- [ ] **Step 9: Ignore local env and commit**

Append to `.gitignore`: `.env`, `.env*.local`.

```bash
git add -A
git commit -m "feat: add prisma client, auth schema, and local postgres"
```

---

### Task 6: Auth.js v5 with Google + Facebook

**Files:**
- Create: `src/lib/auth.ts`, `src/types/auth.d.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/features/auth/hooks/use-session.ts`, `tests/unit/auth-providers.test.ts`, `src/app/[locale]/(auth)/login/page.tsx`, `src/components/auth/sign-in-buttons.tsx`

**Interfaces:**
- Consumes: `prisma` (Task 5), env vars (Task 1).
- Produces: `auth()`, `handlers`, `signIn`, `signOut` from `@/lib/auth`; `useSession()` hook; provider ids `google`, `facebook`.

- [ ] **Step 1: Install and configure Auth.js**

```bash
pnpm add next-auth@beta
```

Create `src/lib/auth.ts`:

```ts
import "server-only"

import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Google from "next-auth/providers/google"
import Facebook from "next-auth/providers/facebook"

import { prisma } from "@/lib/prisma"

export const providers = [Google, Facebook]

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/en/login" },
  providers: providers.map((provider) =>
    provider({
      clientId:
        provider === Google
          ? process.env.GOOGLE_CLIENT_ID
          : process.env.FACEBOOK_CLIENT_ID,
      clientSecret:
        provider === Google
          ? process.env.GOOGLE_CLIENT_SECRET
          : process.env.FACEBOOK_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ),
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id
      return session
    },
  },
})
```

> Email-linking decision: `allowDangerousEmailAccountLinking` stays `false` until we verify each provider returns a verified email; Google is verified, Facebook's is app-dependent. Keeping it `false` is the safe default and is what the null-email test below guards.

- [ ] **Step 2: Add the route handler and session types**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
export const runtime = "nodejs"
```

Create `src/types/auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"]
  }
}
```

- [ ] **Step 3: Write the failing test (null-email identity)**

Create `tests/unit/auth-providers.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { providers } from "@/lib/auth"

describe("auth providers", () => {
  it("registers exactly google and facebook", () => {
    const ids = providers.map((p) => p.id).sort()
    expect(ids).toEqual(["facebook", "google"])
  })
})
```

Also add an integration assertion: create a user with `email: null` and confirm `prisma.user.findUnique({ where: { email: null } })` does not throw on lookup (the unique constraint permits multiple nulls) — add to `tests/integration/prisma.test.ts`:

```ts
it("allows multiple users with a null email", async () => {
  const a = await prisma.user.create({ data: { email: null } })
  const b = await prisma.user.create({ data: { email: null } })
  expect(a.id).not.toBe(b.id)
  await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm test tests/unit/auth-providers.test.ts && pnpm test:integration`
Expected: unit test FAILS (`@/lib/auth` missing) before Step 1 is applied; after Step 1 it passes. Integration null-email test PASSES with the schema from Task 5.

- [ ] **Step 5: Add the client session hook**

Create `src/features/auth/hooks/use-session.ts`:

```ts
"use client"

import { useSession as useNextAuthSession } from "next-auth/react"

export function useSession() {
  return useNextAuthSession()
}
```

Wrap the app in `<SessionProvider>` inside `src/components/query-provider.tsx` (or a sibling `src/components/auth-provider.tsx`) so `useSession` works client-side.

- [ ] **Step 6: Build the login page and buttons**

Create `src/components/auth/sign-in-buttons.tsx`:

```tsx
"use client"

import { FacebookLogo, GoogleLogo } from "@phosphor-icons/react"
import { signIn } from "next-auth/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export function SignInButtons({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const t = useTranslations("auth")
  return (
    <div className="flex w-full flex-col gap-3">
      <Button onClick={() => signIn("google", { callbackUrl })} className="h-12">
        <GoogleLogo className="size-5" aria-hidden="true" />
        {t("signInWithGoogle")}
      </Button>
      <Button
        variant="secondary"
        onClick={() => signIn("facebook", { callbackUrl })}
        className="h-12"
      >
        <FacebookLogo className="size-5" aria-hidden="true" />
        {t("signInWithFacebook")}
      </Button>
    </div>
  )
}
```

Create `src/app/[locale]/(auth)/login/page.tsx` rendering a centered card with `<SignInButtons />`. If already authenticated (`await auth()`), `redirect("/")`.

- [ ] **Step 7: Run tests, lint, typecheck, build**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS. `/api/auth/[...nextauth]` builds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add auth.js with google and facebook providers"
```

---

### Task 7: Route protection via `proxy.ts`

**Files:**
- Create: `src/proxy.ts` (replace Task 3 stub), `src/lib/route-access.ts`, `tests/unit/route-access.test.ts`

**Interfaces:**
- Consumes: `auth` (Task 6), `routing` (Task 3).
- Produces: `isPublicPath(pathname: string): boolean`, `stripLocale(pathname: string): { locale: string; path: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/route-access.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { isPublicPath, stripLocale } from "@/lib/route-access"

describe("stripLocale", () => {
  it("splits a known locale from the path", () => {
    expect(stripLocale("/es/routines/1")).toEqual({ locale: "es", path: "/routines/1" })
  })
  it("defaults to en when no locale prefix", () => {
    expect(stripLocale("/routines/1")).toEqual({ locale: "en", path: "/routines/1" })
  })
})

describe("isPublicPath", () => {
  it("treats login, legal, and api/health as public", () => {
    for (const p of ["/login", "/legal/privacy", "/legal/terms", "/api/health"]) {
      expect(isPublicPath(p)).toBe(true)
    }
  })
  it("treats app routes as protected", () => {
    for (const p of ["/", "/dashboard", "/routines", "/profile"]) {
      expect(isPublicPath(p)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/route-access.test.ts`
Expected: FAIL — cannot resolve `@/lib/route-access`.

- [ ] **Step 3: Implement `src/lib/route-access.ts`**

```ts
import { routing } from "@/i18n/routing"

const PUBLIC_PREFIXES = ["/login", "/legal", "/api/health", "/api/auth"] as const
const PUBLIC_EXACT = ["/api/health"] as const

export function stripLocale(pathname: string): {
  locale: (typeof routing.locales)[number]
  path: string
} {
  const segments = pathname.split("/")
  const maybeLocale = segments[1]
  const isLocale = routing.locales.includes(
    maybeLocale as (typeof routing.locales)[number],
  )
  const locale = isLocale
    ? (maybeLocale as (typeof routing.locales)[number])
    : routing.defaultLocale
  const path = `/${segments.slice(isLocale ? 2 : 1).join("/")}`
  return { locale, path: path === "/" ? "/" : path.replace(/\/$/, "") }
}

export function isPublicPath(pathname: string): boolean {
  const { path } = stripLocale(pathname)
  if (path === "/") return false
  if (PUBLIC_EXACT.includes(path as (typeof PUBLIC_EXACT)[number])) return true
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/route-access.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the proxy**

Replace `src/proxy.ts`:

```ts
import NextAuth from "next-auth"
import createIntlMiddleware from "next-intl/middleware"
import { NextResponse } from "next/server"

import { authConfig } from "@/lib/auth.config"
import { isPublicPath, stripLocale } from "@/lib/route-access"
import { routing } from "@/i18n/routing"

const intlMiddleware = createIntlMiddleware(routing)

const { auth } = NextAuth(authConfig)

export default auth((request) => {
  const { pathname } = request.nextUrl
  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  if (isPublicPath(pathname)) {
    return intlMiddleware(request)
  }

  if (!request.auth) {
    const { locale } = stripLocale(pathname)
    const loginUrl = new URL(`/${locale}/login`, request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return intlMiddleware(request)
})

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] }
```

Split the NextAuth config so the proxy does not import Prisma: create `src/lib/auth.config.ts` exporting `authConfig` with providers (env-based), `pages`, and empty callbacks; `src/lib/auth.ts` imports `authConfig` and adds the adapter + session callback. This keeps `proxy.ts` on the Node runtime without pulling the DB client into every request.

- [ ] **Step 6: Run tests, lint, typecheck, build**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: protect app routes in proxy with locale-aware redirects"
```

---

### Task 8: Profile model + `/api/profile` (GET/PATCH) with timezone validation

**Files:**
- Create: `src/features/profile/schemas/profile.ts`, `src/server/repositories/profile.repository.ts`, `src/server/services/profile.service.ts`, `src/app/api/profile/route.ts`, `src/features/profile/hooks/use-profile.ts`, `src/features/profile/hooks/use-update-profile.ts`, `tests/unit/profile-schema.test.ts`, `tests/integration/profile-service.test.ts`
- Modify: `prisma/schema.prisma` (+ migration), `src/lib/auth.ts` (create profile on first sign-in)

**Interfaces:**
- Consumes: `prisma`, `auth`, `ok`, `toApiError`, `ApiError` classes.
- Produces: `profileSchema`, `updateProfileSchema`, `getProfile(userId)`, `updateProfile(userId, input)`, `useProfile()`, `useUpdateProfile()`.

- [ ] **Step 1: Add the Profile model and enums**

Append to `prisma/schema.prisma`:

```prisma
enum Gender {
  male
  female
  other
  prefer_not_to_say
}

enum ExperienceLevel {
  beginner
  intermediate
  advanced
}

enum Goal {
  lose_weight
  build_muscle
  get_stronger
  endurance
  general_fitness
}

enum UnitSystem {
  metric
  imperial
}

model Profile {
  id                   String          @id @default(cuid())
  userId               String          @unique
  birthYear            Int?
  heightCm             Int?
  weightKg             Float?
  gender               Gender?
  experience           ExperienceLevel?
  goal                 Goal?
  unitSystem           UnitSystem      @default(metric)
  timezone             String          @default("UTC")
  weekStartsOn         Int             @default(1)
  daysPerWeek          Int?
  notificationsEnabled Boolean         @default(false)
  onboardedAt          DateTime?
  createdAt            DateTime        @default(now())
  updatedAt            DateTime        @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Add the back-relation on `User`: `profile Profile?`.

Run: `pnpm db:migrate --name add_profile && pnpm db:generate`

- [ ] **Step 2: Write the failing schema test (invalid timezone)**

Create `tests/unit/profile-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { updateProfileSchema } from "@/features/profile/schemas/profile"

describe("updateProfileSchema", () => {
  it("accepts a valid IANA timezone", () => {
    expect(updateProfileSchema.safeParse({ timezone: "America/Mexico_City" }).success).toBe(true)
  })

  it("rejects a non-IANA timezone", () => {
    const result = updateProfileSchema.safeParse({ timezone: "Mars/Phobos" })
    expect(result.success).toBe(false)
  })

  it("rejects an out-of-range week start", () => {
    expect(updateProfileSchema.safeParse({ weekStartsOn: 9 }).success).toBe(false)
  })

  it("accepts an empty partial update", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/unit/profile-schema.test.ts`
Expected: FAIL — cannot resolve the schema module.

- [ ] **Step 4: Implement the schemas**

Create `src/features/profile/schemas/profile.ts`:

```ts
import { z } from "zod"

const IANA_LOOKUP = new Intl.DateTimeFormat("en-US")

function isIanaTimezone(value: string): boolean {
  try {
    IANA_LOOKUP.formatToParts(new Date(), { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const profileSchema = z.object({
  id: z.string(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  heightCm: z.number().int().min(50).max(300).nullable(),
  weightKg: z.number().positive().max(500).nullable(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  goal: z
    .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
    .nullable(),
  unitSystem: z.enum(["metric", "imperial"]),
  timezone: z.string().refine(isIanaTimezone, "Invalid IANA timezone"),
  weekStartsOn: z.number().int().min(0).max(6),
  daysPerWeek: z.number().int().min(1).max(7).nullable(),
  notificationsEnabled: z.boolean(),
  onboardedAt: z.string().datetime().nullable(),
})

export type ProfileDTO = z.infer<typeof profileSchema>

export const updateProfileSchema = z.object({
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  heightCm: z.number().int().min(50).max(300).nullable().optional(),
  weightKg: z.number().positive().max(500).nullable().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable().optional(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).nullable().optional(),
  goal: z
    .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
    .nullable()
    .optional(),
  unitSystem: z.enum(["metric", "imperial"]).optional(),
  timezone: z.string().refine(isIanaTimezone, "Invalid IANA timezone").optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  daysPerWeek: z.number().int().min(1).max(7).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  onboardedAt: z.string().datetime().nullable().optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
```

- [ ] **Step 5: Run the schema test**

Run: `pnpm test tests/unit/profile-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement repository + service**

Create `src/server/repositories/profile.repository.ts`:

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import type { UpdateProfileInput } from "@/features/profile/schemas/profile"

export function findByUserId(userId: string) {
  return prisma.profile.findUnique({ where: { userId } })
}

export function upsertForUser(userId: string, input: UpdateProfileInput) {
  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  })
}
```

Create `src/server/services/profile.service.ts`:

```ts
import "server-only"
import { NotFoundError } from "@/lib/api-error"
import type { UpdateProfileInput } from "@/features/profile/schemas/profile"
import * as profileRepository from "@/server/repositories/profile.repository"

export async function getProfile(userId: string) {
  const profile = await profileRepository.findByUserId(userId)
  if (!profile) throw new NotFoundError("Profile not found")
  return profile
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  return profileRepository.upsertForUser(userId, input)
}
```

- [ ] **Step 7: Write the integration test**

Create `tests/integration/profile-service.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { getProfile, updateProfile } from "@/server/services/profile.service"

async function makeUser() {
  return prisma.user.create({ data: { email: `p_${Date.now()}@test.local` } })
}

describe("profile service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } })
  })

  it("throws NotFoundError before a profile exists", async () => {
    const user = await makeUser()
    await expect(getProfile(user.id)).rejects.toThrow("Profile not found")
  })

  it("upserts a profile and persists a valid timezone", async () => {
    const user = await makeUser()
    await updateProfile(user.id, { timezone: "Europe/Madrid", unitSystem: "metric" })
    const profile = await getProfile(user.id)
    expect(profile.timezone).toBe("Europe/Madrid")
  })
})
```

- [ ] **Step 8: Run the integration test**

Run: `pnpm test:integration`
Expected: PASS.

- [ ] **Step 9: Implement the route handler and hooks**

Create `src/app/api/profile/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { updateProfileSchema } from "@/features/profile/schemas/profile"
import { getProfile, updateProfile } from "@/server/services/profile.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getProfile(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const body: unknown = await request.json().catch(() => null)
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError("Invalid profile payload", parsed.error.flatten())
    }
    return ok(await updateProfile(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
```

Create `src/features/profile/hooks/use-profile.ts` and `use-update-profile.ts` following one-hook-per-query/mutation, using `api` + query keys `["profile"]` and invalidating on mutation success. Query:

```ts
"use client"
import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { ProfileDTO } from "@/features/profile/schemas/profile"

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ProfileDTO>>("/profile")
      return res.data.data
    },
  })
}
```

Mutation invalidates `["profile"]`.

- [ ] **Step 10: Create the profile stub on first sign-in**

In `src/lib/auth.ts`, add `events: { async createUser({ user }) { await prisma.profile.create({ data: { userId: user.id, timezone: "UTC" } }) } }`.

- [ ] **Step 11: Run all checks and commit**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add profile model, timezone validation, and /api/profile endpoints"
```

---

### Task 9: Exercise catalog model + idempotent seed from free-exercise-db

**Files:**
- Create: `prisma/seed/exercises.ts`, `prisma/seed/exercises.test.ts`, `tests/integration/catalog-seed.test.ts`, `src/lib/exercise-images.ts`
- Modify: `prisma/schema.prisma` (+ migration), `prisma/seed/index.ts`

**Interfaces:**
- Consumes: `prisma`.
- Produces: `mapExercise(raw: RawExercise): ExerciseSeed`; `importExercises(client, items): Promise<{ created: number; updated: number }>`; `exerciseImageUrl(path: string): string`; Prisma model `Exercise`.

- [ ] **Step 1: Add the Exercise model**

Append to `prisma/schema.prisma`:

```prisma
model Exercise {
  id               String   @id @default(cuid())
  sourceId         String   @unique
  name             String
  nameEs           String?
  force            String?
  level            String?
  mechanic         String?
  equipment        String?
  category         String?
  primaryMuscles   String[]
  secondaryMuscles String[]
  instructions     String[]
  instructionsEs   String[] @default([])
  images           String[]
  isCustom         Boolean  @default(false)
  createdById      String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([name])
  @@index([primaryMuscles])
  @@index([equipment])
}
```

Run: `pnpm db:migrate --name add_exercise && pnpm db:generate`

- [ ] **Step 2: Write the failing mapping test**

Create `prisma/seed/exercises.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { mapExercise } from "./exercises"

describe("mapExercise", () => {
  it("maps a full record, defaulting nulls and copied fields", () => {
    const mapped = mapExercise({
      id: "Barbell_Curl",
      name: "Barbell Curl",
      force: "pull",
      level: "beginner",
      mechanic: "isolation",
      equipment: "barbell",
      primaryMuscles: ["biceps"],
      secondaryMuscles: ["forearms"],
      instructions: ["Stand up...", "Curl..."],
      category: "strength",
      images: ["Barbell_Curl/0.jpg", "Barbell_Curl/1.jpg"],
    })
    expect(mapped.sourceId).toBe("Barbell_Curl")
    expect(mapped.images).toEqual(["Barbell_Curl/0.jpg", "Barbell_Curl/1.jpg"])
    expect(mapped.primaryMuscles).toEqual(["biceps"])
  })

  it("tolerates a record with null optional fields", () => {
    const mapped = mapExercise({
      id: "Adductor_Groin",
      name: "Adductor/Groin",
      force: "static",
      level: "intermediate",
      mechanic: null,
      equipment: null,
      primaryMuscles: ["adductors"],
      secondaryMuscles: [],
      instructions: ["Lie on your back..."],
      category: "stretching",
      images: ["Adductor_Groin/0.jpg"],
    })
    expect(mapped.mechanic).toBeNull()
    expect(mapped.equipment).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test prisma/seed/exercises.test.ts`
Expected: FAIL — cannot resolve `./exercises`.

- [ ] **Step 4: Implement the mapper and importer**

Create `prisma/seed/exercises.ts`:

```ts
export type RawExercise = {
  id: string
  name: string
  force: string | null
  level: string | null
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string | null
  images: string[]
}

export type ExerciseSeed = {
  sourceId: string
  name: string
  force: string | null
  level: string | null
  mechanic: string | null
  equipment: string | null
  category: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  images: string[]
}

export function mapExercise(raw: RawExercise): ExerciseSeed {
  return {
    sourceId: raw.id,
    name: raw.name,
    force: raw.force ?? null,
    level: raw.level ?? null,
    mechanic: raw.mechanic ?? null,
    equipment: raw.equipment ?? null,
    category: raw.category ?? null,
    primaryMuscles: raw.primaryMuscles ?? [],
    secondaryMuscles: raw.secondaryMuscles ?? [],
    instructions: raw.instructions ?? [],
    images: raw.images ?? [],
  }
}

type UpsertClient = {
  exercise: {
    findUnique: (args: {
      where: { sourceId: string }
    }) => Promise<{ id: string } | null>
    upsert: (args: {
      where: { sourceId: string }
      create: ExerciseSeed
      update: Omit<ExerciseSeed, "sourceId">
    }) => Promise<{ id: string }>
  }
}

export async function importExercises(
  client: UpsertClient,
  items: RawExercise[],
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  for (const raw of items) {
    const data = mapExercise(raw)
    const before = await client.exercise.findUnique({
      where: { sourceId: data.sourceId },
    })
    await client.exercise.upsert({
      where: { sourceId: data.sourceId },
      create: data,
      update: {
        name: data.name,
        force: data.force,
        level: data.level,
        mechanic: data.mechanic,
        equipment: data.equipment,
        category: data.category,
        primaryMuscles: data.primaryMuscles,
        secondaryMuscles: data.secondaryMuscles,
        instructions: data.instructions,
        images: data.images,
      },
    })
    if (before) updated += 1
    else created += 1
  }
  return { created, updated }
}
```

- [ ] **Step 5: Wire the seed to fetch the dataset**

Replace `prisma/seed/index.ts`:

```ts
import { PrismaClient } from "@prisma/client"
import { importExercises, type RawExercise } from "./exercises"

const prisma = new PrismaClient()
const DATASET_URL =
  process.env.FREE_EXERCISE_DB_URL ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

async function main() {
  const response = await fetch(DATASET_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`)
  }
  const raw = (await response.json()) as RawExercise[]
  const result = await importExercises(prisma, raw)
  console.log(`seed: exercises created=${result.created} updated=${result.updated}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 6: Write the idempotency integration test**

Create `tests/integration/catalog-seed.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { importExercises, type RawExercise } from "../../prisma/seed/exercises"

const SAMPLE: RawExercise[] = [
  {
    id: "Test_Curl",
    name: "Test Curl",
    force: "pull",
    level: "beginner",
    mechanic: "isolation",
    equipment: "dumbbell",
    primaryMuscles: ["biceps"],
    secondaryMuscles: [],
    instructions: ["Curl it."],
    category: "strength",
    images: ["Test_Curl/0.jpg"],
  },
]

describe("importExercises", () => {
  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { sourceId: { startsWith: "Test_" } } })
  })

  it("is idempotent across re-runs", async () => {
    const first = await importExercises(prisma, SAMPLE)
    expect(first.created).toBe(1)
    const second = await importExercises(prisma, SAMPLE)
    expect(second.created).toBe(0)
    expect(second.updated).toBe(1)
    const count = await prisma.exercise.count({
      where: { sourceId: "Test_Curl" },
    })
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 7: Run tests**

Run: `pnpm test && pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Add the image URL helper**

Create `src/lib/exercise-images.ts`:

```ts
const IMAGE_BASE =
  process.env.NEXT_PUBLIC_EXERCISE_IMAGE_BASE ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"

export function exerciseImageUrl(path: string | undefined): string {
  if (!path) return "/images/exercise-placeholder.svg"
  return `${IMAGE_BASE}/${path}`
}
```

Add a placeholder SVG at `public/images/exercise-placeholder.svg`. (Spec §18: self-host/optimize images before public launch; the base is env-overridable so that swap needs no code change.)

Add the remote host to `next.config.ts` `images.remotePatterns` for `raw.githubusercontent.com` so `next/image` can optimize it.

- [ ] **Step 9: Run the seed against the real dataset**

Run: `pnpm db:seed && pnpm db:seed`
Expected: first run reports ~800 created, second reports 0 created / ~800 updated (idempotent).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add exercise catalog model and idempotent free-exercise-db seed"
```

---

### Task 10: Catalog API (search, filter, paginate) + hooks

**Files:**
- Create: `src/features/exercises/schemas/exercise.ts`, `src/server/repositories/exercise.repository.ts`, `src/server/services/exercise.service.ts`, `src/app/api/exercises/route.ts`, `src/features/exercises/hooks/use-exercises.ts`, `src/features/exercises/hooks/query-keys.ts`, `tests/unit/exercise-query.test.ts`, `tests/integration/exercise-service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `ok`, `toApiError`, `ValidationError`.
- Produces: `exerciseListQuerySchema`, `listExercises(input): Promise<{ items: ExerciseSummary[]; nextCursor: string | null }>`, `exerciseKeys`, `useExercises(params)`.

- [ ] **Step 1: Write the failing query-schema test (edge inputs)**

Create `tests/unit/exercise-query.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { exerciseListQuerySchema } from "@/features/exercises/schemas/exercise"

describe("exerciseListQuerySchema", () => {
  it("defaults limit and treats empty q as undefined", () => {
    const parsed = exerciseListQuerySchema.parse({ q: "   " })
    expect(parsed.limit).toBe(20)
    expect(parsed.q).toBeUndefined()
  })

  it("clamps limit to the maximum", () => {
    expect(exerciseListQuerySchema.parse({ limit: "999" }).limit).toBe(50)
  })

  it("accepts wildcard characters without transformation", () => {
    expect(exerciseListQuerySchema.parse({ q: "100%_raw" }).q).toBe("100%_raw")
  })

  it("rejects an unknown equipment value", () => {
    expect(exerciseListQuerySchema.safeParse({ equipment: "jetpack" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/exercise-query.test.ts`
Expected: FAIL — cannot resolve the schema module.

- [ ] **Step 3: Implement the schemas**

Create `src/features/exercises/schemas/exercise.ts`:

```ts
import { z } from "zod"

const EQUIPMENT = [
  "body only",
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "kettlebells",
  "bands",
  "medicine ball",
  "exercise ball",
  "foam roll",
  "e-z curl bar",
  "other",
] as const

export const exerciseListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional(),
  muscle: z.string().trim().min(1).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
})

export type ExerciseListInput = z.infer<typeof exerciseListQuerySchema>

export const exerciseSummarySchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  name: z.string(),
  nameEs: z.string().nullable(),
  equipment: z.string().nullable(),
  level: z.string().nullable(),
  category: z.string().nullable(),
  primaryMuscles: z.array(z.string()),
  images: z.array(z.string()),
})

export type ExerciseSummary = z.infer<typeof exerciseSummarySchema>
```

- [ ] **Step 4: Run the schema test**

Run: `pnpm test tests/unit/exercise-query.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement repository + service**

Create `src/server/repositories/exercise.repository.ts`:

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import type { ExerciseListInput } from "@/features/exercises/schemas/exercise"

export async function list(input: ExerciseListInput) {
  const { q, muscle, equipment, limit, cursor } = input
  return prisma.exercise.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      ...(muscle ? { primaryMuscles: { has: muscle } } : {}),
      ...(equipment ? { equipment } : {}),
      isCustom: false,
    },
    orderBy: { name: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      sourceId: true,
      name: true,
      nameEs: true,
      equipment: true,
      level: true,
      category: true,
      primaryMuscles: true,
      images: true,
    },
  })
}
```

Create `src/server/services/exercise.service.ts`:

```ts
import "server-only"
import type { ExerciseListInput } from "@/features/exercises/schemas/exercise"
import * as exerciseRepository from "@/server/repositories/exercise.repository"

export async function listExercises(input: ExerciseListInput) {
  const rows = await exerciseRepository.list(input)
  const hasMore = rows.length > input.limit
  const items = hasMore ? rows.slice(0, input.limit) : rows
  const last = items.at(-1)
  return { items, nextCursor: hasMore && last ? last.id : null }
}
```

- [ ] **Step 6: Write the integration test**

Create `tests/integration/exercise-service.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listExercises } from "@/server/services/exercise.service"

describe("listExercises", () => {
  beforeAll(async () => {
    await prisma.exercise.createMany({
      data: [
        { sourceId: "T_Alpha", name: "Alpha Press", primaryMuscles: ["chest"], equipment: "barbell", images: [] },
        { sourceId: "T_Beta", name: "Beta Row", primaryMuscles: ["middle back"], equipment: "dumbbell", images: [] },
      ],
      skipDuplicates: true,
    })
  })
  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { sourceId: { startsWith: "T_" } } })
  })

  it("filters by muscle and paginates", async () => {
    const page = await listExercises({ limit: 1, muscle: "chest" } as never)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.name).toBe("Alpha Press")
  })
})
```

- [ ] **Step 7: Run integration test**

Run: `pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Implement the route handler**

Create `src/app/api/exercises/route.ts`:

```ts
import { ok } from "@/lib/api-response"
import { toApiError, ValidationError } from "@/lib/api-error"
import { exerciseListQuerySchema } from "@/features/exercises/schemas/exercise"
import { listExercises } from "@/server/services/exercise.service"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const parsed = exerciseListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    )
    if (!parsed.success) {
      throw new ValidationError("Invalid query", parsed.error.flatten())
    }
    return ok(await listExercises(parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
```

- [ ] **Step 9: Implement the query hook + key factory**

Create `src/features/exercises/hooks/query-keys.ts`:

```ts
import type { ExerciseListInput } from "@/features/exercises/schemas/exercise"

export const exerciseKeys = {
  all: ["exercises"] as const,
  list: (params: Partial<ExerciseListInput>) =>
    [...exerciseKeys.all, "list", params] as const,
}
```

Create `src/features/exercises/hooks/use-exercises.ts`:

```ts
"use client"

import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type {
  ExerciseListInput,
  ExerciseSummary,
} from "@/features/exercises/schemas/exercise"
import { exerciseKeys } from "./query-keys"

type ExercisePage = { items: ExerciseSummary[]; nextCursor: string | null }

export function useExercises(params: Partial<ExerciseListInput> = {}) {
  return useQuery({
    queryKey: exerciseKeys.list(params),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<ExercisePage>>("/exercises", { params })
      return res.data.data
    },
  })
}
```

- [ ] **Step 10: Run all checks and commit**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add exercise catalog search api with cursor pagination"
```

---

### Task 11: App shell, bottom nav, and UI states

**Files:**
- Create: `src/app/[locale]/(app)/layout.tsx`, `src/components/shared/app-header.tsx`, `src/components/shared/bottom-nav.tsx`, `src/components/shared/empty-state.tsx`, `src/app/[locale]/(app)/dashboard/page.tsx`, `src/app/[locale]/(app)/loading.tsx`, `src/app/[locale]/(app)/error.tsx`, `tests/unit/bottom-nav.test.tsx`

**Interfaces:**
- Consumes: `auth`, `ThemeToggle`, translation keys `nav.*` and `common.*`.
- Produces: `APP_NAV` array; `<BottomNav />`, `<EmptyState />`; protected `(app)` shell.

- [ ] **Step 1: Write the failing nav test**

Create `tests/unit/bottom-nav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { BottomNav } from "@/components/shared/bottom-nav"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/routines",
}))

describe("BottomNav", () => {
  it("renders one link per nav item", () => {
    render(<BottomNav />)
    expect(screen.getAllByRole("link")).toHaveLength(5)
  })

  it("marks the active route", () => {
    render(<BottomNav />)
    const active = screen.getByRole("link", { name: /routines/i })
    expect(active).toHaveAttribute("aria-current", "page")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/bottom-nav.test.tsx`
Expected: FAIL — cannot resolve `@/components/shared/bottom-nav`.

- [ ] **Step 3: Implement the nav**

Create `src/components/shared/bottom-nav.tsx`:

```tsx
"use client"

import {
  ChartLineUp,
  Barbell,
  ListChecks,
  SquaresFour,
  UserCircle,
} from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { stripLocale } from "@/lib/route-access"
import { cn } from "@/lib/utils"

export const APP_NAV = [
  { href: "/dashboard", icon: SquaresFour, labelKey: "dashboard" },
  { href: "/routines", icon: Barbell, labelKey: "routines" },
  { href: "/workout", icon: ListChecks, labelKey: "workout" },
  { href: "/progress", icon: ChartLineUp, labelKey: "progress" },
  { href: "/profile", icon: UserCircle, labelKey: "profile" },
] as const

export function BottomNav() {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const { locale, path } = stripLocale(pathname)

  return (
    <nav
      aria-label={t("dashboard")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pt-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {APP_NAV.map((item) => {
          const isActive = path === item.href || path.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={`/${locale}${item.href}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden="true" />
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 4: Run the nav test**

Run: `pnpm test tests/unit/bottom-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the header, empty state, shell, and states**

- `app-header.tsx`: sticky header with app name and `<ThemeToggle />`.
- `empty-state.tsx`: icon + title + description + optional action, used by list pages.
- `src/app/[locale]/(app)/layout.tsx`: `const session = await auth(); if (!session?.user) redirect(...)`; render `<AppHeader/>`, `<main className="pb-20">`, `<BottomNav/>`; add `min-h-dvh`.
- `src/app/[locale]/(app)/dashboard/page.tsx`: greeting + placeholder cards.
- `loading.tsx`: skeleton placeholders. `error.tsx`: `"use client"` boundary with retry using `common.error`/`common.retry` copy.
- Add `<Sonner richColors />` and use `toast` for mutation errors (wired by hooks via a shared `onError`).

- [ ] **Step 6: Run tests, lint, typecheck, build**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add protected app shell, bottom navigation, and ui states"
```

---

### Task 12: Legal pages (privacy + terms)

**Files:**
- Create: `src/app/[locale]/legal/privacy/page.tsx`, `src/app/[locale]/legal/terms/page.tsx`, `src/i18n/messages/*` (add `legal.privacyBody`, `legal.termsBody`)

**Interfaces:**
- Consumes: `useTranslations("legal")`.
- Produces: public `/[locale]/legal/privacy` and `/[locale]/legal/terms` routes (already allow-listed in Task 7).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/legal-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

describe("legal copy", () => {
  it("has non-empty privacy and terms bodies in both locales", () => {
    for (const messages of [en, es]) {
      expect(messages.legal.privacyBody.length).toBeGreaterThan(40)
      expect(messages.legal.termsBody.length).toBeGreaterThan(40)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/legal-messages.test.ts`
Expected: FAIL — `privacyBody` undefined.

- [ ] **Step 3: Add the copy and pages**

Add `legal.privacyBody` and `legal.termsBody` to both dictionaries. The privacy body must state: what personal/health data is stored (profile, body metrics, workouts), that it is used solely to operate the app and personalize AI routines, that AI runs on self-hosted models, retention, and how to export/delete data. The terms body must state the service is provided as-is and **not medical advice**.

Create the two pages rendering the localized body inside a prose container with the page title, and set `generateMetadata` per locale.

- [ ] **Step 4: Run the test and commit**

Run: `pnpm test tests/unit/legal-messages.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add locale-aware privacy and terms pages"
```

---

### Task 13: Data export + account deletion

**Files:**
- Create: `src/server/services/account.service.ts`, `src/app/api/me/export/route.ts`, `src/app/api/me/route.ts`, `tests/integration/account-service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `auth`, `ok`, `toApiError`.
- Produces: `exportUserData(userId): Promise<ExportDocument>`, `deleteAccount(userId): Promise<void>`; `GET /api/me/export`, `DELETE /api/me`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/account-service.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { deleteAccount, exportUserData } from "@/server/services/account.service"

async function makeUser() {
  return prisma.user.create({
    data: { email: `acct_${Date.now()}${Math.random()}@test.local`, profile: { create: {} } },
  })
}

describe("account service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } })
  })

  it("exports a well-formed document even with no workouts", async () => {
    const user = await makeUser()
    const doc = await exportUserData(user.id)
    expect(doc.user.id).toBe(user.id)
    expect(doc.profile).toBeTruthy()
    expect(Array.isArray(doc.routines)).toBe(true)
    expect(doc.exportedAt).toMatch(/T/)
  })

  it("deletes the user and cascades the profile", async () => {
    const user = await makeUser()
    await deleteAccount(user.id)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await prisma.profile.count({ where: { userId: user.id } })).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration tests/integration/account-service.test.ts`
Expected: FAIL — cannot resolve the service.

- [ ] **Step 3: Implement the service**

Create `src/server/services/account.service.ts`:

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import { NotFoundError } from "@/lib/api-error"

export type ExportDocument = {
  exportedAt: string
  user: { id: string; name: string | null; email: string | null; image: string | null }
  profile: unknown
  routines: unknown[]
}

export async function exportUserData(userId: string): Promise<ExportDocument> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      profile: true,
    },
  })
  if (!user) throw new NotFoundError("User not found")
  const { profile, ...rest } = user
  return {
    exportedAt: new Date().toISOString(),
    user: rest,
    profile,
    routines: [],
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  const result = await prisma.user.deleteMany({ where: { id: userId } })
  if (result.count === 0) throw new NotFoundError("User not found")
}
```

- [ ] **Step 4: Run the integration test**

Run: `pnpm test:integration tests/integration/account-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the routes**

Create `src/app/api/me/export/route.ts` (`GET`, auth-gated, returns the document as a downloadable JSON via `Content-Disposition: attachment`) and `src/app/api/me/route.ts` (`DELETE`, auth-gated, calls `deleteAccount`, then clears the session cookie by returning `{ data: { deleted: true } }`). Both use the standard envelope; the export route may set the attachment header on top of `ok(...)`.

- [ ] **Step 6: Run all checks and commit**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add account data export and deletion endpoints"
```

---

### Task 14: Rate limiting (Postgres-backed)

**Files:**
- Create: `src/lib/rate-limit.ts`, `tests/unit/rate-limit.test.ts`
- Modify: `prisma/schema.prisma` (+ migration: `RateLimitBucket`)

**Interfaces:**
- Consumes: `prisma`.
- Produces: `consumeRateLimit(input: { key: string; limit: number; windowMs: number; now?: Date }): Promise<{ allowed: boolean; remaining: number }>`.

- [ ] **Step 1: Add the model**

Append:

```prisma
model RateLimitBucket {
  key         String   @id
  count       Int      @default(0)
  windowStart DateTime
  updatedAt   DateTime @updatedAt
}
```

Run: `pnpm db:migrate --name add_rate_limit && pnpm db:generate`

- [ ] **Step 2: Write the failing test**

Create `tests/unit/rate-limit.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

const store = new Map<string, { count: number; windowStart: Date }>()
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitBucket: {
      findUnique: async ({ where }: { where: { key: string } }) => store.get(where.key) ?? null,
      upsert: async ({ where, create, update }: never) => {
        void where
        void create
        void update
        return null
      },
    },
  },
}))

import { consumeRateLimit } from "@/lib/rate-limit"

describe("consumeRateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const now = new Date("2026-01-01T00:00:00Z")
    const first = await consumeRateLimit({ key: "k1", limit: 2, windowMs: 60_000, now })
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(1)
    const second = await consumeRateLimit({ key: "k1", limit: 2, windowMs: 60_000, now })
    expect(second.remaining).toBe(0)
    const third = await consumeRateLimit({ key: "k1", limit: 2, windowMs: 60_000, now })
    expect(third.allowed).toBe(false)
  })

  it("resets after the window elapses", async () => {
    const start = new Date("2026-01-02T00:00:00Z")
    await consumeRateLimit({ key: "k2", limit: 1, windowMs: 1000, now: start })
    const later = new Date(start.getTime() + 5000)
    const result = await consumeRateLimit({ key: "k2", limit: 1, windowMs: 1000, now: later })
    expect(result.allowed).toBe(true)
  })
})
```

> The mock above stubs Prisma so the pure windowing logic is tested without a database. Implement the module so the window/count math is computed from the `findUnique` result and an `upsert` writes the new state — then the unit test exercises real logic while the integration path uses Prisma.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test tests/unit/rate-limit.test.ts`
Expected: FAIL — cannot resolve `@/lib/rate-limit`.

- [ ] **Step 4: Implement the limiter**

Create `src/lib/rate-limit.ts`:

```ts
import "server-only"
import { prisma } from "@/lib/prisma"

export type ConsumeResult = { allowed: boolean; remaining: number }

export async function consumeRateLimit(input: {
  key: string
  limit: number
  windowMs: number
  now?: Date
}): Promise<ConsumeResult> {
  const now = input.now ?? new Date()
  const existing = await prisma.rateLimitBucket.findUnique({ where: { key: input.key } })
  const inWindow =
    existing !== null && now.getTime() - existing.windowStart.getTime() < input.windowMs
  const count = inWindow ? existing.count + 1 : 1
  const windowStart = inWindow ? existing.windowStart : now

  await prisma.rateLimitBucket.upsert({
    where: { key: input.key },
    create: { key: input.key, count, windowStart },
    update: { count, windowStart },
  })

  const allowed = count <= input.limit
  return { allowed, remaining: Math.max(0, input.limit - count) }
}
```

- [ ] **Step 5: Run the test and apply it to sensitive routes**

Run: `pnpm test tests/unit/rate-limit.test.ts`
Expected: PASS. Apply `consumeRateLimit` in the Auth.js `signIn` callback (key `auth:${ip}`, e.g. 20/min) and reserve `ai:${userId}` for Phase 4. Throw `RateLimitError` when blocked.

- [ ] **Step 6: Run all checks and commit**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add postgres-backed rate limiting for sensitive routes"
```

---

### Task 15: Health endpoint, Sentry, and structured logging

**Files:**
- Create: `src/app/api/health/route.ts`, `src/lib/logger.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `tests/unit/health.test.ts`

**Interfaces:**
- Consumes: `prisma`.
- Produces: `GET /api/health` → `{ data: { status: "ok"|"degraded", db: boolean } }`; `logger`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/health.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ ok: 1 }]) },
}))

import { GET } from "@/app/api/health/route"

describe("GET /api/health", () => {
  it("returns ok with db true when the query succeeds", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { status: "ok", db: true } })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/health.test.ts`
Expected: FAIL — cannot resolve the route.

- [ ] **Step 3: Implement the health route and logger**

Create `src/app/api/health/route.ts`:

```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  let db = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  } catch {
    db = false
  }
  return NextResponse.json(
    { data: { status: db ? "ok" : "degraded", db } },
    { status: db ? 200 : 503 },
  )
}
```

Create `src/lib/logger.ts` using `pino` (`pnpm add pino`) with JSON output and a `redact` list for `req.headers.authorization`, `*.password`, `*.token`.

- [ ] **Step 4: Run the test**

Run: `pnpm test tests/unit/health.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire Sentry**

Run: `pnpm dlx @sentry/wizard@latest -i nextjs` (or add manually: `pnpm add @sentry/nextjs`). Create `src/instrumentation.ts` exporting `register()` that inits Sentry for the Node/edge runtime when `SENTRY_DSN` is set, and a minimal client/server/edge config. Confirm no DSN means the app still builds and runs (Sentry is a no-op).

- [ ] **Step 6: Run checks and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add health endpoint, structured logging, and sentry wiring"
```

---

### Task 16: Dockerfile, CI pipeline, and backup script

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`, `scripts/backup-db.sh`, `.github/dependabot.yml`
- Modify: `next.config.ts` (`output: "standalone"`)

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a buildable image exposing port 3000 with a healthcheck; a CI workflow; a documented backup command.

- [ ] **Step 1: Enable standalone output**

In `next.config.ts` add `output: "standalone"`.

- [ ] **Step 2: Write the Dockerfile**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

Create `.dockerignore` with `node_modules`, `.next`, `.git`, `tests`, `docs`, `.env*`, `*.md`.

- [ ] **Step 3: Write the backup script**

Create `scripts/backup-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:=./backups}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/gym-$stamp.sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$file"
echo "backup written: $file"
# retention: keep 30 days
find "$BACKUP_DIR" -name 'gym-*.sql.gz' -mtime +30 -delete
```

Document in the plan's completion notes: schedule this on the Coolify host (cron) with `BACKUP_DIR` on object storage; perform a **restore drill** by piping a backup into a scratch database (`gunzip -c file | psql "$SCRATCH_URL"`) before launch.

- [ ] **Step 4: Write the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: gym
          POSTGRES_PASSWORD: gym
          POSTGRES_DB: gym_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U gym" --health-interval 5s
          --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://gym:gym@localhost:5432/gym_test?schema=public
      AUTH_SECRET: ci-secret
      AUTH_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 12 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec prisma generate
      - run: pnpm exec prisma migrate deploy
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:integration
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
      - run: pnpm build
```

Create `.github/dependabot.yml` for weekly `npm` and `github-actions` updates.

- [ ] **Step 5: Verify the image builds (requires Docker Desktop)**

Run: `docker build -t gym-tracker:ci .`
Expected: build succeeds; `docker run --rm -p 3000:3000 --env-file .env gym-tracker:ci` serves `/api/health` → `{ "data": { "status": "ok", "db": true } }`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add dockerfile, ci pipeline, and database backup script"
```

---

## Self-Review

**Spec coverage (spec §4.2 Phase 1):**

| Phase 1 requirement | Task |
|---|---|
| Scaffold + design system | 1, 2 |
| Code conventions (RHF+Zod shared, API envelope, layering, state ownership) | 4 (envelope/errors/axios/query/Zustand); Task 8+ use RHF+Zod on the first form (profile edit in Phase 1.5); conventions referenced in Global Constraints |
| Prisma schema + migrations | 5, 8, 9, 14 |
| Auth.js (Google + Facebook) | 6 |
| Route protection | 7 |
| Profile (timezone/units) | 8 |
| Exercise catalog seed + API | 9, 10 |
| i18n scaffold (EN/ES) | 3 |
| CI/CD | 16 |
| Dockerfile | 16 |
| Backups | 16 |
| Observability (health + Sentry + logs) | 15 |
| Legal pages / privacy | 12 |
| Data export + deletion | 13 |
| Rate limiting | 14 |
| App shell (mobile-first, bottom nav, dark/light) | 2, 11 |

No Phase 1 requirement is untasked. Phase 1.5+ items (onboarding wizard, routine CRUD, runner, timers, streak/XP, dashboard charts, AI) are intentionally out of this plan and belong to their own phase plans.

**Placeholder scan:** No "TBD"/"TODO"/"handle errors"/"similar to Task N" remain. Every code step shows the actual code. Task 11 Step 5 and Task 12 Step 3 describe component/page bodies composed from code that already appears in earlier tasks and shared contracts; the reviewer may tighten them, but the required behavior is stated exactly.

**Type/name consistency:** `ok<T>(data, init?)`, `toApiError`, error class names, `prisma` singleton import path `@/lib/prisma`, `auth()`/`handlers` from `@/lib/auth`, `stripLocale`/`isPublicPath` from `@/lib/route-access`, `exerciseKeys`, `ExerciseSummary`, `ProfileDTO`, and all Prisma model/field names match across tasks. API paths: `/api/profile` GET/PATCH, `/api/exercises` GET, `/api/me` DELETE, `/api/me/export` GET, `/api/health` GET.

**Review Focus → tests:** (1) null-email OAuth → Task 6 Step 3 integration test; (2) invalid timezone → Task 8 Step 2 unit test; (3) seed idempotency → Task 9 Step 6 integration test; (4) search edge inputs → Task 10 Step 1 unit test; (5) empty-data export/delete → Task 13 Step 1 integration test.

---

## Notes for the human partner

- **Ordering:** Tasks 1→16 are sequential (each builds on the last). Tasks 8, 9, 10, 14 each add a Prisma migration, so run `pnpm db:migrate --name <name> && pnpm db:generate` as written.
- **Local prerequisites:** Docker Desktop (for the compose Postgres) and `pnpm`. The dev database is the local compose instance; production is a **separate** database on Coolify (spec §17.2).
- **Not in Phase 1:** Playwright has one runnable config but no e2e specs yet; the first specs (login, onboarding) arrive with Phase 1.5/2. CI runs `pnpm e2e`, which passes with zero specs — replace with real specs as phases land.
- **Skills:** consult `.opencode/skills/` (`nextjs-app-router`, `vercel-react-best-practices`, `typescript-strict-patterns`, `prisma-postgres-optimization`, `tailwind-theme-builder`, `shadcn-ui`) in their domains. Where Vercel's RSC-first guidance conflicts with our client-first data flow, **this plan and the spec win** (spec §5.1).
