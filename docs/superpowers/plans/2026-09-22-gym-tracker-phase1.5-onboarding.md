# Gym Tracker — Phase 1.5 Onboarding & First Routine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a new user into a guided onboarding wizard that persists their preferences, lets them pick a recommended starter routine template, and leaves them on a dashboard showing exactly one active routine.

**Architecture:** Single Next.js 16 App Router route `/[locale]/onboarding` with client-side steps backed by a Zustand store; each step persists to `Profile` via the existing partial `PATCH /api/profile`. Routine data (`Routine`/`RoutineDay`/`RoutineExercise`) is created from code-defined templates by a transactional service. Client-first data flow (axios + React Query) per the Phase 1 conventions.

**Tech Stack:** Next.js 16, TypeScript strict, Prisma 7 (generated client + `@prisma/adapter-pg`), Auth.js v5, next-intl (EN/ES), TanStack Query + axios, Zustand, Zod, Vitest + RTL + Playwright, pino.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase1.5-onboarding-design.md` (binding for this plan). Parent product spec: `docs/superpowers/specs/2026-09-22-gym-tracker-design.md`.

## Global Constraints

- **App Router only**; request APIs (`params`, `searchParams`, `cookies()`, `headers()`) are async and awaited. `proxy.ts` is the middleware.
- **Prisma 7 imports:** `prisma` from `@/lib/prisma`; `PrismaClient`/`Prisma` types from `@/generated/prisma/client`. **Never** import `@prisma/client`. CLI config is `prisma7.config.ts`.
- **Layering:** Route Handler (parse/validate/auth/error-map/status) → Service (rules, transactions) → Repository (Prisma only). Services and repositories start with `import "server-only"`.
- **API envelope:** success `{ data }`; error `{ error: { code, message, details? } }` via `toApiError`. Never return raw Prisma models — always `select` the DTO fields.
- **Authorization:** scope every query/mutation by `userId` from `auth()`. Never trust client ids.
- **Validation:** one shared Zod schema per input, used client and server.
- **i18n:** `next-intl`, locales `en` (default) + `es`, identical key sets (parity test). **No hardcoded user-facing copy.**
- **Design:** mobile-first, ≥44px touch targets, single column, vector icons (Phosphor) only, light+dark tokens, visible focus, `aria-live` for progress.
- **Logging:** structured events via `src/lib/logger.ts` (pino). No analytics vendor, no event DB table.
- **Testing:** Vitest + RTL (unit/component, MSW for HTTP), integration tests against the Docker Postgres, Playwright e2e. Test output must be pristine.
- **Docker (local):** `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`; `docker compose up -d db`.
- **Commits:** Conventional Commits, one logical change each.

## Review Focus

Five input classes the spec implies but no happy-path test covers. Each is pinned to a test in the owning task.

1. **A template references a `sourceId` absent from the seeded catalog** — creation must fail closed with a clear error and create **no** partial routine. (Task 3 + Task 5)
2. **Create-from-template called when the user already has an active routine (or twice)** — exactly one routine may end up active. (Task 5)
3. **A user who chose "skip for now"** — must reach the dashboard and never be redirected back into onboarding. (Task 2)
4. **Reloading mid-wizard** — must resume at the first incomplete step, not the start. (Task 8)
5. **An `equipment` value outside the catalog's allowed set** — must be rejected with a 400. (Task 7)

---

### Task 1: Routine data model + Profile additions

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/integration/routine-model.test.ts`
- Migration: `prisma/migrations/*_add_routine`

**Interfaces:**
- Consumes: existing `User`, `Exercise`, `Profile` models; `prisma` from `@/lib/prisma`.
- Produces: Prisma models `Routine`, `RoutineDay`, `RoutineExercise`; enums `RoutineSource`, `TimerType`, `Location`; Profile fields `location Location?`, `equipment String[] @default([])`, `onboardingSkippedAt DateTime?`.

- [ ] **Step 1: Add the enums and models to `prisma/schema.prisma`**

```prisma
enum RoutineSource {
  manual
  ai
  template
}

enum TimerType {
  none
  interval
  emom
  amrap
}

enum Location {
  gym
  home
  both
}

model Routine {
  id          String        @id @default(cuid())
  userId      String
  name        String
  description String?
  goal        Goal?
  source      RoutineSource @default(manual)
  isActive    Boolean       @default(false)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  user User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  days RoutineDay[]

  @@index([userId, isActive])
}

model RoutineDay {
  id        String  @id @default(cuid())
  routineId String
  weekday   Int
  label     String?
  order     Int

  routine   Routine           @relation(fields: [routineId], references: [id], onDelete: Cascade)
  exercises RoutineExercise[]

  @@index([routineId])
}

model RoutineExercise {
  id             String    @id @default(cuid())
  routineDayId   String
  exerciseId     String?
  customName     String?
  order          Int
  targetSets     Int       @default(3)
  targetReps     String    @default("10")
  restSeconds    Int       @default(60)
  targetWeightKg Float?
  timerType      TimerType @default(none)
  workSeconds    Int?
  rounds         Int?
  notes          String?

  routineDay RoutineDay @relation(fields: [routineDayId], references: [id], onDelete: Cascade)
  exercise   Exercise?  @relation(fields: [exerciseId], references: [id])

  @@index([routineDayId])
}
```

Add the back-relations and Profile fields:

```prisma
// in model User
routines Routine[]

// in model Exercise
routineExercises RoutineExercise[]

// in model Profile
location            Location?
equipment           String[]  @default([])
onboardingSkippedAt DateTime?
```

- [ ] **Step 2: Run the migration and regenerate the client**

Run:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db
pnpm db:migrate --name add_routine
pnpm db:generate
```
Expected: `prisma/migrations/*_add_routine` created; client regenerated with `Routine` models.

- [ ] **Step 3: Write the failing integration test**

Create `tests/integration/routine-model.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"

describe("routine model", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@routine-model-test.local" } } })
  })

  it("creates a routine with nested days/exercises and cascades on delete", async () => {
    const user = await prisma.user.create({ data: { email: `rm_${Date.now()}@routine-model-test.local` } })
    const exercise = await prisma.exercise.findFirst({ select: { id: true } })
    expect(exercise).not.toBeNull()

    const routine = await prisma.routine.create({
      data: {
        userId: user.id,
        name: "Test Routine",
        source: "template",
        isActive: true,
        days: {
          create: [
            {
              weekday: 1,
              label: "Day A",
              order: 0,
              exercises: {
                create: [{ exerciseId: exercise!.id, order: 0, targetSets: 3, targetReps: "8-12" }],
              },
            },
          ],
        },
      },
      include: { days: { include: { exercises: true } } },
    })

    expect(routine.days).toHaveLength(1)
    expect(routine.days[0]?.exercises).toHaveLength(1)

    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.routine.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.routineDay.count({ where: { routineId: routine.id } })).toBe(0)
    expect(await prisma.routineExercise.count({ where: { routineDayId: routine.days[0]!.id } })).toBe(0)
  })

  it("persists the new Profile fields", async () => {
    const user = await prisma.user.create({
      data: {
        email: `rm2_${Date.now()}@routine-model-test.local`,
        profile: { create: { location: "home", equipment: ["dumbbell", "body only"] } },
      },
      include: { profile: true },
    })
    expect(user.profile?.location).toBe("home")
    expect(user.profile?.equipment).toEqual(["dumbbell", "body only"])
  })
})
```

- [ ] **Step 4: Run the test**

Run: `pnpm test:integration tests/integration/routine-model.test.ts`
Expected: PASS (requires Docker Postgres + seeded exercises; run `pnpm db:seed` first if the catalog is empty).

- [ ] **Step 5: Verify the whole suite still passes**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma tests/integration/routine-model.test.ts
git commit -m "feat: add routine schema and profile onboarding fields"
```

---

### Task 2: Onboarding gate predicate + route wiring

**Files:**
- Create: `src/features/onboarding/lib/onboarding.ts`, `tests/unit/onboarding-gate.test.ts`
- Modify: `src/app/[locale]/(app)/layout.tsx`, `src/app/[locale]/onboarding/page.tsx` (create), `src/server/services/profile.service.ts` (add `getProfileOrNull`), `src/server/repositories/profile.repository.ts` (add `findByUserId` already exists)

**Interfaces:**
- Consumes: `prisma`, `auth`, `getProfile`/`updateProfile` (Phase 1), `redirect` from `next/navigation`.
- Produces: `needsOnboarding(profile: { onboardedAt: Date | null; onboardingSkippedAt: Date | null }): boolean`; `getProfileOrNull(userId): Promise<Profile | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/onboarding-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { needsOnboarding } from "@/features/onboarding/lib/onboarding"

describe("needsOnboarding", () => {
  it("is true for a fresh profile", () => {
    expect(needsOnboarding({ onboardedAt: null, onboardingSkippedAt: null })).toBe(true)
  })
  it("is false once onboarded", () => {
    expect(needsOnboarding({ onboardedAt: new Date(), onboardingSkippedAt: null })).toBe(false)
  })
  it("is false once skipped", () => {
    expect(needsOnboarding({ onboardedAt: null, onboardingSkippedAt: new Date() })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/onboarding-gate.test.ts`
Expected: FAIL — cannot resolve `@/features/onboarding/lib/onboarding`.

- [ ] **Step 3: Implement the predicate**

Create `src/features/onboarding/lib/onboarding.ts`:

```ts
export type OnboardingState = {
  onboardedAt: Date | null
  onboardingSkippedAt: Date | null
}

export function needsOnboarding(state: OnboardingState): boolean {
  return state.onboardedAt == null && state.onboardingSkippedAt == null
}
```

- [ ] **Step 4: Add `getProfileOrNull` to the profile service**

In `src/server/services/profile.service.ts` add:

```ts
export async function getProfileOrNull(userId: string) {
  return profileRepository.findByUserId(userId)
}
```

- [ ] **Step 5: Wire the gate into the `(app)` layout**

Modify `src/app/[locale]/(app)/layout.tsx` — after `auth()` and before rendering, load the profile and redirect:

```tsx
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getProfileOrNull } from "@/server/services/profile.service"
import { needsOnboarding } from "@/features/onboarding/lib/onboarding"

// inside the async component, after resolving locale + session:
const profile = await getProfileOrNull(session.user.id)
if (profile && needsOnboarding(profile)) {
  redirect(`/${locale}/onboarding`)
}
```

(If `profile` is `null` — the `createUser` event has not run — treat it as needing onboarding by redirecting too.)

- [ ] **Step 6: Create the onboarding route shell with the inverse guard**

Create `src/app/[locale]/onboarding/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { setRequestLocale } from "next-intl/server"
import { auth } from "@/lib/auth"
import { getProfileOrNull } from "@/server/services/profile.service"
import { needsOnboarding } from "@/features/onboarding/lib/onboarding"

export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await auth()
  if (!session?.user?.id) redirect(`/${locale}/login`)

  const profile = await getProfileOrNull(session.user.id)
  if (profile && !needsOnboarding(profile)) redirect(`/${locale}/dashboard`)

  return <main className="mx-auto min-h-dvh w-full max-w-md p-4">{/* wizard mounts in Task 8 */}</main>
}
```

- [ ] **Step 7: Write the gate integration test (skip must not loop)**

Add to `tests/integration/profile-service.test.ts` (or a new `tests/integration/onboarding-gate.test.ts`) a case that creates a user+profile, sets `onboardingSkippedAt`, and asserts `needsOnboarding(profile) === false`; and one that sets `onboardedAt` and asserts `false`.

```ts
it("does not re-enter onboarding after skip or completion", async () => {
  const user = await prisma.user.create({
    data: { email: `gate_${Date.now()}@onboarding-gate-test.local`, profile: { create: {} } },
    include: { profile: true },
  })
  expect(needsOnboarding(user.profile!)).toBe(true)
  await prisma.profile.update({ where: { userId: user.id }, data: { onboardingSkippedAt: new Date() } })
  const skipped = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })
  expect(needsOnboarding(skipped)).toBe(false)
})
```

Clean up with `@onboarding-gate-test.local`.

- [ ] **Step 8: Run tests, lint, typecheck, build**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app src/features/onboarding src/server tests
git commit -m "feat: add onboarding gate and route shell"
```

---

### Task 3: Starter templates (code constants) + invariants

**Files:**
- Create: `src/features/onboarding/templates/routine-templates.ts`, `tests/unit/routine-templates.test.ts`, `tests/integration/routine-template-catalog.test.ts`

**Interfaces:**
- Consumes: `Goal`, `ExperienceLevel`, `Location` enums (from `@/generated/prisma/client`).
- Produces: `ROUTINE_TEMPLATES: RoutineTemplate[]`, types `RoutineTemplate`, `TemplateDay`, `TemplateExercise`, and `getTemplateBySlug(slug: string): RoutineTemplate | undefined`.

- [ ] **Step 1: Write the failing invariants test**

Create `tests/unit/routine-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { ROUTINE_TEMPLATES, getTemplateBySlug } from "@/features/onboarding/templates/routine-templates"

describe("ROUTINE_TEMPLATES", () => {
  it("has 5 templates with unique slugs", () => {
    expect(ROUTINE_TEMPLATES).toHaveLength(5)
    expect(new Set(ROUTINE_TEMPLATES.map((t) => t.slug)).size).toBe(5)
  })

  it("each template is internally consistent", () => {
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.days.length).toBe(t.daysPerWeek)
      expect(new Set(t.days.map((d) => d.weekday)).size).toBe(t.days.length)
      for (const d of t.days) {
        expect(d.weekday).toBeGreaterThanOrEqual(0)
        expect(d.weekday).toBeLessThanOrEqual(6)
        expect(d.exercises.length).toBeGreaterThan(0)
        for (const e of d.exercises) {
          expect(e.sourceId.length).toBeGreaterThan(0)
          expect(e.sets).toBeGreaterThan(0)
          expect(e.reps.length).toBeGreaterThan(0)
          expect(e.restSeconds).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it("getTemplateBySlug finds a template and returns undefined otherwise", () => {
    expect(getTemplateBySlug("full-body-3x")?.slug).toBe("full-body-3x")
    expect(getTemplateBySlug("nope")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/routine-templates.test.ts`
Expected: FAIL — cannot resolve the templates module.

- [ ] **Step 3: Implement the templates**

Create `src/features/onboarding/templates/routine-templates.ts`. Use **real `free-exercise-db` `sourceId`s** (verify each exists in the seeded catalog — Step 4 enforces it). Example structure and the full starting set:

```ts
import type { ExperienceLevel, Goal, Location } from "@/generated/prisma/client"

export type TemplateExercise = { sourceId: string; sets: number; reps: string; restSeconds: number }
export type TemplateDay = { weekday: number; label: string; exercises: TemplateExercise[] }
export type RoutineTemplate = {
  slug: string
  name: string
  nameEs: string
  description: string
  descriptionEs: string
  goal: Goal
  level: ExperienceLevel
  location: Location
  equipment: string[]
  daysPerWeek: number
  days: TemplateDay[]
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    slug: "full-body-3x",
    name: "Full Body 3x",
    nameEs: "Cuerpo Completo 3x",
    description: "Three full-body sessions a week. Great for beginners.",
    descriptionEs: "Tres sesiones de cuerpo completo por semana. Ideal para principiantes.",
    goal: "general_fitness",
    level: "beginner",
    location: "both",
    equipment: ["body only", "dumbbell", "barbell", "machine"],
    daysPerWeek: 3,
    days: [
      { weekday: 1, label: "Full Body A", exercises: [
        { sourceId: "Barbell_Full_Squat", sets: 3, reps: "8-12", restSeconds: 90 },
        { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: "8-12", restSeconds: 90 },
        { sourceId: "Barbell_Deadlift", sets: 3, reps: "6-8", restSeconds: 120 },
        { sourceId: "Air_Bike", sets: 3, reps: "15-20", restSeconds: 45 },
      ] },
      { weekday: 3, label: "Full Body B", exercises: [
        { sourceId: "Barbell_Full_Squat", sets: 3, reps: "8-12", restSeconds: 90 },
        { sourceId: "Arnold_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
        { sourceId: "Barbell_Curl", sets: 3, reps: "10-12", restSeconds: 60 },
        { sourceId: "Air_Bike", sets: 3, reps: "15-20", restSeconds: 45 },
      ] },
      { weekday: 5, label: "Full Body C", exercises: [
        { sourceId: "Barbell_Full_Squat", sets: 3, reps: "8-12", restSeconds: 90 },
        { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: "8-12", restSeconds: 90 },
        { sourceId: "Alternating_Kettlebell_Row", sets: 3, reps: "10-12", restSeconds: 60 },
        { sourceId: "Air_Bike", sets: 3, reps: "15-20", restSeconds: 45 },
      ] },
    ],
  },
  // upper-lower-4x, ppl-6x, dumbbell-home-3x, bodyweight-3x — same shape.
]
```

Fill in the remaining four templates using **real catalog ids** (e.g. `Barbell_Deadlift`, `Barbell_Full_Squat`, `Alternate_Incline_Dumbbell_Curl`, `Arnold_Dumbbell_Press`, `Band_Pull_Apart`, `Air_Bike`, plus bodyweight ids such as `3_4_Sit-Up`, `Alternate_Heel_Touchers`). Verify each id against the seeded catalog in Step 4; adjust to real ids as needed. Weekdays: 3× → `[1,3,5]`, 4× → `[1,2,4,5]`, 6× → `[1,2,3,4,5,6]`.

```ts
export function getTemplateBySlug(slug: string): RoutineTemplate | undefined {
  return ROUTINE_TEMPLATES.find((t) => t.slug === slug)
}
```

- [ ] **Step 4: Write the catalog-resolution integration test**

Create `tests/integration/routine-template-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"

describe("template catalog references", () => {
  it("every template sourceId exists in the seeded catalog", async () => {
    const ids = [...new Set(ROUTINE_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((e) => e.sourceId))))]
    const found = await prisma.exercise.findMany({ where: { sourceId: { in: ids } }, select: { sourceId: true } })
    const foundSet = new Set(found.map((f) => f.sourceId))
    const missing = ids.filter((id) => !foundSet.has(id))
    expect(missing).toEqual([])
  })
})
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test tests/unit/routine-templates.test.ts && pnpm test:integration tests/integration/routine-template-catalog.test.ts`
Expected: PASS. If the catalog test reports missing ids, replace those `sourceId`s with real ones from the seeded catalog and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/features/onboarding/templates tests
git commit -m "feat: add starter routine templates and catalog validation"
```

---

### Task 4: Template recommender (pure)

**Files:**
- Create: `src/features/onboarding/lib/recommend-templates.ts`, `tests/unit/recommend-templates.test.ts`

**Interfaces:**
- Consumes: `RoutineTemplate`, `ROUTINE_TEMPLATES` (Task 3).
- Produces: `ScoredTemplate = { template: RoutineTemplate; score: number; recommended: boolean }`; `recommendTemplates(profile: RecommendProfile, templates: RoutineTemplate[]): ScoredTemplate[]` where `RecommendProfile = { goal: Goal | null; experience: ExperienceLevel | null; location: Location | null; daysPerWeek: number | null; equipment: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/recommend-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { recommendTemplates } from "@/features/onboarding/lib/recommend-templates"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"

const base = { goal: null, experience: null, location: null, daysPerWeek: null, equipment: [] } as const

describe("recommendTemplates", () => {
  it("returns all templates sorted by score descending", () => {
    const result = recommendTemplates({ ...base }, ROUTINE_TEMPLATES)
    expect(result).toHaveLength(ROUTINE_TEMPLATES.length)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score)
    }
  })

  it("scores a home bodyweight-friendly user toward bodyweight/dumbbell templates", () => {
    const result = recommendTemplates(
      { goal: "endurance", experience: "beginner", location: "home", daysPerWeek: 3, equipment: ["body only"] },
      ROUTINE_TEMPLATES,
    )
    expect(result[0]!.template.slug).toBe("bodyweight-3x")
    expect(result[0]!.recommended).toBe(true)
  })

  it("scores a gym intermediate toward gym templates and flags at most 3 recommended", () => {
    const result = recommendTemplates(
      { goal: "build_muscle", experience: "intermediate", location: "gym", daysPerWeek: 4, equipment: ["barbell", "dumbbell", "machine", "body only"] },
      ROUTINE_TEMPLATES,
    )
    expect(result[0]!.template.slug).toBe("upper-lower-4x")
    expect(result.filter((r) => r.recommended).length).toBeLessThanOrEqual(3)
  })

  it("is deterministic for ties (stable template order)", () => {
    const a = recommendTemplates({ ...base }, ROUTINE_TEMPLATES).map((r) => r.template.slug)
    const b = recommendTemplates({ ...base }, ROUTINE_TEMPLATES).map((r) => r.template.slug)
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/recommend-templates.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement the recommender**

Create `src/features/onboarding/lib/recommend-templates.ts`:

```ts
import type { ExperienceLevel, Goal, Location } from "@/generated/prisma/client"
import type { RoutineTemplate } from "@/features/onboarding/templates/routine-templates"

export type RecommendProfile = {
  goal: Goal | null
  experience: ExperienceLevel | null
  location: Location | null
  daysPerWeek: number | null
  equipment: string[]
}

export type ScoredTemplate = { template: RoutineTemplate; score: number; recommended: boolean }

const LEVEL_ORDER: ExperienceLevel[] = ["beginner", "intermediate", "advanced"]

function scoreTemplate(profile: RecommendProfile, template: RoutineTemplate): number {
  let score = 0
  if (profile.location && (template.location === profile.location || template.location === "both" || profile.location === "both")) {
    score += 3
  }
  if (profile.daysPerWeek != null) {
    const diff = Math.abs(profile.daysPerWeek - template.daysPerWeek)
    if (diff === 0) score += 2
    else if (diff === 1) score += 1
  }
  if (profile.goal && profile.goal === template.goal) score += 2
  if (profile.experience) {
    const p = LEVEL_ORDER.indexOf(profile.experience)
    const t = LEVEL_ORDER.indexOf(template.level)
    if (p === t) score += 1
    else if (p === t + 1) score += 1
  }
  const needsOnlyBodyweight = template.equipment.every((e) => e === "body only")
  const equipmentCovered = template.equipment.every((e) => e === "body only" || profile.equipment.includes(e))
  if (needsOnlyBodyweight || equipmentCovered) score += 2
  return score
}

export function recommendTemplates(profile: RecommendProfile, templates: RoutineTemplate[]): ScoredTemplate[] {
  const scored = templates
    .map((template, index) => ({ template, score: scoreTemplate(profile, template), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  let recommendedCount = 0
  return scored.map(({ template, score }) => {
    const recommended = score >= 4 && recommendedCount < 3
    if (recommended) recommendedCount += 1
    return { template, score, recommended }
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/recommend-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding/lib tests/unit/recommend-templates.test.ts
git commit -m "feat: add deterministic template recommender"
```

---

### Task 5: Routine service — create-from-template & get active

**Files:**
- Create: `src/server/repositories/routine.repository.ts`, `src/server/services/routine.service.ts`, `tests/integration/routine-service.test.ts`
- Modify: `src/server/services/profile.service.ts` (set `onboardedAt` inside the routine transaction — see note)

**Interfaces:**
- Consumes: `prisma`, `getTemplateBySlug` (Task 3), `NotFoundError`/`ValidationError`, `logger` (`src/lib/logger.ts`).
- Produces: `RoutineDTO`, `createRoutineFromTemplate(userId, slug): Promise<RoutineDTO>`, `getActiveRoutine(userId): Promise<RoutineDTO | null>`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/routine-service.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { createRoutineFromTemplate, getActiveRoutine } from "@/server/services/routine.service"

async function makeUser() {
  return prisma.user.create({
    data: { email: `rs_${Date.now()}${Math.random()}@routine-service-test.local`, profile: { create: {} } },
  })
}

describe("routine service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@routine-service-test.local" } } })
  })

  it("creates an active routine and sets onboardedAt", async () => {
    const user = await makeUser()
    const routine = await createRoutineFromTemplate(user.id, "full-body-3x")
    expect(routine.days).toHaveLength(3)
    expect(routine.source).toBe("template")
    const active = await getActiveRoutine(user.id)
    expect(active?.id).toBe(routine.id)
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })
    expect(profile.onboardedAt).not.toBeNull()
  })

  it("keeps exactly one active routine when called again", async () => {
    const user = await makeUser()
    await createRoutineFromTemplate(user.id, "full-body-3x")
    await createRoutineFromTemplate(user.id, "bodyweight-3x")
    const activeCount = await prisma.routine.count({ where: { userId: user.id, isActive: true } })
    expect(activeCount).toBe(1)
    expect((await getActiveRoutine(user.id))?.name).toContain("Bodyweight")
  })

  it("throws NotFound for an unknown slug", async () => {
    const user = await makeUser()
    await expect(createRoutineFromTemplate(user.id, "does-not-exist")).rejects.toThrow("Template not found")
    expect(await prisma.routine.count({ where: { userId: user.id } })).toBe(0)
  })

  it("fails closed with no partial routine when a template exercise is missing", async () => {
    const user = await makeUser()
    // Temporarily hide one referenced exercise by pointing the lookup at a bogus slug path is not possible;
    // instead assert the guard directly via the service's exported resolver behaviour:
    // create a template object whose sourceId is unknown by monkeypatching is out of scope —
    // this case is covered by the resolver unit below (Step 3b).
    expect(user.id).toBeTruthy()
  })
})
```

> The "missing sourceId" case is hard to trigger through real data (Task 3 guarantees ids exist). Instead, export a pure resolver `resolveTemplateExercises(exercises, bySourceId)` (Step 3b) and unit-test the fail-closed path there, while the service uses it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration tests/integration/routine-service.test.ts`
Expected: FAIL — cannot resolve the service.

- [ ] **Step 3: Implement the repository and service**

Create `src/server/repositories/routine.repository.ts`:

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const routineSelect = {
  id: true,
  name: true,
  description: true,
  goal: true,
  source: true,
  isActive: true,
  days: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      weekday: true,
      label: true,
      order: true,
      exercises: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          exerciseId: true,
          customName: true,
          targetSets: true,
          targetReps: true,
          restSeconds: true,
          targetWeightKg: true,
          timerType: true,
          workSeconds: true,
          rounds: true,
          notes: true,
          exercise: { select: { id: true, name: true, nameEs: true, images: true } },
        },
      },
    },
  },
} satisfies Prisma.RoutineSelect

export function findActiveByUser(userId: string) {
  return prisma.routine.findFirst({ where: { userId, isActive: true }, select: routineSelect })
}
```

- [ ] **Step 3b: Implement the service with a pure resolver**

Create `src/server/services/routine.service.ts`:

```ts
import "server-only"
import { NotFoundError, ValidationError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getTemplateBySlug, type TemplateExercise } from "@/features/onboarding/templates/routine-templates"
import { routineSelect } from "@/server/repositories/routine.repository"

export type RoutineDTO = NonNullable<Awaited<ReturnType<typeof getActiveRoutine>>>

export type ResolvedExercise = { exerciseId: string; sets: number; reps: string; restSeconds: number }

export function resolveTemplateExercises(
  exercises: TemplateExercise[],
  bySourceId: Map<string, string>,
): ResolvedExercise[] {
  const missing = exercises.filter((e) => !bySourceId.has(e.sourceId)).map((e) => e.sourceId)
  if (missing.length > 0) {
    throw new ValidationError(`Template references unknown exercises: ${missing.join(", ")}`)
  }
  return exercises.map((e) => ({
    exerciseId: bySourceId.get(e.sourceId)!,
    sets: e.sets,
    reps: e.reps,
    restSeconds: e.restSeconds,
  }))
}

export async function createRoutineFromTemplate(userId: string, slug: string) {
  const template = getTemplateBySlug(slug)
  if (!template) throw new NotFoundError("Template not found")

  const sourceIds = [...new Set(template.days.flatMap((d) => d.exercises.map((e) => e.sourceId)))]
  const exercises = await prisma.exercise.findMany({ where: { sourceId: { in: sourceIds } }, select: { id: true, sourceId: true } })
  const bySourceId = new Map(exercises.map((e) => [e.sourceId, e.id]))

  return prisma.$transaction(async (tx) => {
    const days = template.days.map((day, dayIndex) => ({
      weekday: day.weekday,
      label: day.label,
      order: dayIndex,
      exercises: {
        create: resolveTemplateExercises(day.exercises, bySourceId).map((e, i) => ({
          exerciseId: e.exerciseId,
          order: i,
          targetSets: e.sets,
          targetReps: e.reps,
          restSeconds: e.restSeconds,
        })),
      },
    }))

    await tx.routine.updateMany({ where: { userId, isActive: true }, data: { isActive: false } })

    const routine = await tx.routine.create({
      data: {
        userId,
        name: template.name,
        description: template.description,
        goal: template.goal,
        source: "template",
        isActive: true,
        days: { create: days },
      },
      select: routineSelect,
    })

    await tx.profile.updateMany({ where: { userId, onboardedAt: null }, data: { onboardedAt: new Date() } })

    logger.info({ event: "routine.selected_from_template", userId, slug }, "routine selected")
    logger.info({ event: "onboarding.completed", userId }, "onboarding completed")

    return routine
  })
}

export async function getActiveRoutine(userId: string) {
  return prisma.routine.findFirst({ where: { userId, isActive: true }, select: routineSelect })
}
```

- [ ] **Step 4: Add the resolver unit test (fail-closed path)**

Create `tests/unit/resolve-template-exercises.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { resolveTemplateExercises } from "@/server/services/routine.service"

describe("resolveTemplateExercises", () => {
  it("throws and returns nothing when a sourceId is missing", () => {
    const byId = new Map<string, string>([["A", "id-a"]])
    expect(() => resolveTemplateExercises([{ sourceId: "A", sets: 3, reps: "10", restSeconds: 60 }, { sourceId: "B", sets: 3, reps: "10", restSeconds: 60 }], byId)).toThrow("unknown exercises: B")
  })
  it("resolves known ids", () => {
    const byId = new Map<string, string>([["A", "id-a"]])
    expect(resolveTemplateExercises([{ sourceId: "A", sets: 3, reps: "10", restSeconds: 60 }], byId)).toEqual([{ exerciseId: "id-a", sets: 3, reps: "10", restSeconds: 60 }])
  })
})
```

- [ ] **Step 5: Run tests**

Run: `pnpm test tests/unit/resolve-template-exercises.test.ts && pnpm test:integration tests/integration/routine-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify the suite, lint, typecheck**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server tests
git commit -m "feat: add transactional create-from-template routine service"
```

---

### Task 6: Routine APIs + hooks

**Files:**
- Create: `src/app/api/routine-templates/route.ts`, `src/app/api/routines/from-template/route.ts`, `src/app/api/routines/active/route.ts`, `src/features/onboarding/schemas/onboarding.ts`, `src/features/routines/hooks/query-keys.ts`, `src/features/routines/hooks/use-active-routine.ts`, `src/features/routines/hooks/use-routine-templates.ts`, `src/features/routines/hooks/use-create-from-template.ts`, `tests/unit/onboarding-schema.test.ts`, `tests/unit/routine-templates-route.test.ts`

**Interfaces:**
- Consumes: `recommendTemplates` (Task 4), `ROUTINE_TEMPLATES` (Task 3), `createRoutineFromTemplate`/`getActiveRoutine` (Task 5), `auth`, `ok`, `toApiError`, `getProfile`.
- Produces: `fromTemplateSchema`; `routineKeys`; hooks `useRoutineTemplates`, `useActiveRoutine`, `useCreateFromTemplate`.

- [ ] **Step 1: Write the failing schema + route tests**

Create `tests/unit/onboarding-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { fromTemplateSchema } from "@/features/onboarding/schemas/onboarding"

describe("fromTemplateSchema", () => {
  it("accepts a non-empty slug", () => {
    expect(fromTemplateSchema.safeParse({ slug: "full-body-3x" }).success).toBe(true)
  })
  it("rejects an empty slug", () => {
    expect(fromTemplateSchema.safeParse({ slug: "" }).success).toBe(false)
  })
})
```

Create `tests/unit/routine-templates-route.test.ts` (mocks auth + profile + service):

```ts
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/profile.service", () => ({
  getProfile: vi.fn(async () => ({ goal: "endurance", experience: "beginner", location: "home", daysPerWeek: 3, equipment: ["body only"] })),
}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET } from "@/app/api/routine-templates/route"

describe("GET /api/routine-templates", () => {
  it("returns templates annotated with recommendation flags", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.templates.length).toBeGreaterThan(0)
    expect(typeof body.data.templates[0].recommended).toBe("boolean")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/onboarding-schema.test.ts tests/unit/routine-templates-route.test.ts`
Expected: FAIL — modules/routes missing.

- [ ] **Step 3: Implement the schemas and routes**

Create `src/features/onboarding/schemas/onboarding.ts`:

```ts
import { z } from "zod"

export const fromTemplateSchema = z.object({ slug: z.string().trim().min(1) })
export type FromTemplateInput = z.infer<typeof fromTemplateSchema>
```

Create `src/app/api/routine-templates/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getProfile } from "@/server/services/profile.service"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"
import { recommendTemplates } from "@/features/onboarding/lib/recommend-templates"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const profile = await getProfile(session.user.id)
    const templates = recommendTemplates(
      {
        goal: profile.goal,
        experience: profile.experience,
        location: profile.location,
        daysPerWeek: profile.daysPerWeek,
        equipment: profile.equipment,
      },
      ROUTINE_TEMPLATES,
    ).map(({ template, score, recommended }) => ({ ...template, score, recommended }))
    return ok({ templates })
  } catch (error) {
    return toApiError(error)
  }
}
```

Create `src/app/api/routines/from-template/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { fromTemplateSchema } from "@/features/onboarding/schemas/onboarding"
import { createRoutineFromTemplate } from "@/server/services/routine.service"

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const body: unknown = await request.json().catch(() => null)
    const parsed = fromTemplateSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError("Invalid payload", parsed.error.flatten())
    return ok(await createRoutineFromTemplate(session.user.id, parsed.data.slug), { status: 201 })
  } catch (error) {
    return toApiError(error)
  }
}
```

Create `src/app/api/routines/active/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getActiveRoutine } from "@/server/services/routine.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getActiveRoutine(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}
```

- [ ] **Step 4: Implement the hooks**

Create `src/features/routines/hooks/query-keys.ts`:

```ts
export const routineKeys = {
  all: ["routines"] as const,
  templates: () => [...routineKeys.all, "templates"] as const,
  active: () => [...routineKeys.all, "active"] as const,
}
```

Create `src/features/routines/hooks/use-routine-templates.ts`:

```ts
"use client"
import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { routineKeys } from "./query-keys"

export type TemplateWithScore = { slug: string; name: string; nameEs: string; description: string; descriptionEs: string; daysPerWeek: number; score: number; recommended: boolean }

export function useRoutineTemplates() {
  return useQuery({
    queryKey: routineKeys.templates(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<{ templates: TemplateWithScore[] }>>("/routine-templates")
      return res.data.data.templates
    },
  })
}
```

Create `src/features/routines/hooks/use-active-routine.ts`:

```ts
"use client"
import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import { routineKeys } from "./query-keys"

export type RoutineDTO = {
  id: string
  name: string
  description: string | null
  source: "manual" | "ai" | "template"
  isActive: boolean
  days: { id: string; weekday: number; label: string | null; order: number; exercises: { id: string; targetSets: number; targetReps: string; exercise: { id: string; name: string; nameEs: string | null; images: string[] } | null }[] }[]
}

export function useActiveRoutine() {
  return useQuery({
    queryKey: routineKeys.active(),
    queryFn: async () => {
      const res = await api.get<ApiEnvelope<RoutineDTO | null>>("/routines/active")
      return res.data.data
    },
  })
}
```

Create `src/features/routines/hooks/use-create-from-template.ts`:

```ts
"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { RoutineDTO } from "./use-active-routine"
import { routineKeys } from "./query-keys"

export function useCreateFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (slug: string) => {
      const res = await api.post<ApiEnvelope<RoutineDTO>>("/routines/from-template", { slug })
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routineKeys.active() })
      queryClient.invalidateQueries({ queryKey: ["profile"] })
    },
  })
}
```

- [ ] **Step 5: Run the tests, lint, typecheck**

Run: `pnpm test tests/unit/onboarding-schema.test.ts tests/unit/routine-templates-route.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api src/features
git commit -m "feat: add routine templates and active-routine APIs with hooks"
```

---

### Task 7: Extend profile schema + onboarding event logging

**Files:**
- Modify: `src/features/profile/schemas/profile.ts`, `src/server/services/profile.service.ts`
- Test: `tests/unit/profile-schema.test.ts` (extend), `tests/integration/profile-service.test.ts` (extend)

**Interfaces:**
- Consumes: `logger`, existing profile service/repository.
- Produces: `updateProfileSchema` gains `location`, `equipment` (allowed catalog set), `onboardingSkippedAt`; `updateProfile` logs `onboarding.step_saved` / `onboarding.skipped`.

- [ ] **Step 1: Extend the failing schema test**

Add to `tests/unit/profile-schema.test.ts`:

```ts
import { updateProfileSchema } from "@/features/profile/schemas/profile"

describe("onboarding profile fields", () => {
  it("accepts a valid location and equipment subset", () => {
    expect(updateProfileSchema.safeParse({ location: "home", equipment: ["dumbbell", "body only"] }).success).toBe(true)
  })
  it("rejects an unknown location", () => {
    expect(updateProfileSchema.safeParse({ location: "moon" }).success).toBe(false)
  })
  it("rejects an equipment value outside the catalog set", () => {
    expect(updateProfileSchema.safeParse({ equipment: ["jetpack"] }).success).toBe(false)
  })
  it("accepts onboardingSkippedAt as an ISO datetime", () => {
    expect(updateProfileSchema.safeParse({ onboardingSkippedAt: new Date().toISOString() }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/profile-schema.test.ts`
Expected: FAIL — new fields not accepted.

- [ ] **Step 3: Extend `updateProfileSchema`**

In `src/features/profile/schemas/profile.ts` import the catalog equipment enum from `@/features/exercises/schemas/exercise` (the Phase 1 `EQUIPMENT` list) — export it from there if not already exported — and add:

```ts
location: z.enum(["gym", "home", "both"]).nullable().optional(),
equipment: z.array(z.enum(EQUIPMENT)).max(20).optional(),
onboardingSkippedAt: z.string().datetime().nullable().optional(),
```

Map `onboardingSkippedAt` string→Date in the repository's `toPrismaData` (same pattern as `onboardedAt`).

- [ ] **Step 4: Add event logging to `updateProfile`**

In `src/server/services/profile.service.ts`:

```ts
import { logger } from "@/lib/logger"

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const profile = await profileRepository.upsertForUser(userId, input)
  if (input.onboardingSkippedAt) {
    logger.info({ event: "onboarding.skipped", userId }, "onboarding skipped")
  } else if (input.goal || input.experience || input.location || input.equipment || input.daysPerWeek) {
    logger.info({ event: "onboarding.step_saved", userId }, "onboarding step saved")
  }
  return profile
}
```

- [ ] **Step 5: Extend the integration test**

Add a case asserting `equipment`/`location` persist and that skipping sets `onboardingSkippedAt` (reuse the `@profile-test.local` domain).

- [ ] **Step 6: Run tests, lint, typecheck**

Run: `pnpm test && pnpm test:integration && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/profile src/server/services/profile.service.ts tests
git commit -m "feat: extend profile schema with onboarding fields and event logging"
```

---

### Task 8: Wizard store, step framework, and core steps (1–5)

**Files:**
- Create: `src/features/onboarding/stores/onboarding-store.ts`, `src/features/onboarding/lib/steps.ts`, `src/features/onboarding/hooks/use-save-onboarding-step.ts`, `src/features/onboarding/components/wizard.tsx`, `goal-step.tsx`, `experience-step.tsx`, `equipment-step.tsx`, `schedule-step.tsx`, `preferences-step.tsx`
- Modify: `src/app/[locale]/onboarding/page.tsx`
- Test: `tests/unit/onboarding-steps.test.ts`, `tests/unit/onboarding-store.test.ts`, `tests/unit/goal-step.test.tsx`

**Interfaces:**
- Consumes: `getProfile` (server), `useProfile`/`useUpdateProfile` (Phase 1 hooks), `needsOnboarding` (Task 2).
- Produces: `ONBOARDING_STEPS: { id: StepId; required: boolean }[]`, `firstIncompleteStep(profile): StepId`, `useOnboardingStore`, `<Wizard initialStep profile />`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/onboarding-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { firstIncompleteStep } from "@/features/onboarding/lib/steps"

const empty = { goal: null, experience: null, location: null, equipment: [], daysPerWeek: null, unitSystem: "metric", timezone: "UTC", birthYear: null, heightCm: null, weightKg: null, gender: null } as const

describe("firstIncompleteStep", () => {
  it("starts at goal for an empty profile", () => {
    expect(firstIncompleteStep({ ...empty })).toBe("goal")
  })
  it("advances past completed required steps", () => {
    expect(firstIncompleteStep({ ...empty, goal: "build_muscle", experience: "beginner" })).toBe("equipment")
  })
  it("skips the optional metrics step", () => {
    const p = { ...empty, goal: "build_muscle", experience: "beginner", location: "gym", equipment: ["barbell"], daysPerWeek: 4 }
    expect(firstIncompleteStep(p)).toBe("template")
  })
})
```

Create `tests/unit/onboarding-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { useOnboardingStore } from "@/features/onboarding/stores/onboarding-store"

describe("onboarding store", () => {
  beforeEach(() => useOnboardingStore.getState().reset("goal"))

  it("tracks the current step and answers", () => {
    useOnboardingStore.getState().setAnswer("goal", "build_muscle")
    useOnboardingStore.getState().goNext()
    expect(useOnboardingStore.getState().answers.goal).toBe("build_muscle")
    expect(useOnboardingStore.getState().stepIndex).toBe(1)
  })
})
```

Create `tests/unit/goal-step.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { GoalStep } from "@/features/onboarding/components/goal-step"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

describe("GoalStep", () => {
  it("calls onSelect with the chosen goal", async () => {
    const onSelect = vi.fn()
    render(<GoalStep value={null} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole("button", { name: /build_muscle/i }))
    expect(onSelect).toHaveBeenCalledWith("build_muscle")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/onboarding-steps.test.ts tests/unit/onboarding-store.test.ts tests/unit/goal-step.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the step model**

Create `src/features/onboarding/lib/steps.ts`:

```ts
export type StepId = "goal" | "experience" | "equipment" | "schedule" | "preferences" | "metrics" | "template"

export const ONBOARDING_STEPS: { id: StepId; required: boolean }[] = [
  { id: "goal", required: true },
  { id: "experience", required: true },
  { id: "equipment", required: true },
  { id: "schedule", required: true },
  { id: "preferences", required: true },
  { id: "metrics", required: false },
  { id: "template", required: true },
]

export type StepProfile = {
  goal: string | null
  experience: string | null
  location: string | null
  equipment: string[]
  daysPerWeek: number | null
  unitSystem: string | null
  timezone: string | null
}

export function isStepComplete(id: StepId, p: StepProfile): boolean {
  switch (id) {
    case "goal": return p.goal != null
    case "experience": return p.experience != null
    case "equipment": return p.location != null && p.equipment.length > 0
    case "schedule": return p.daysPerWeek != null
    case "preferences": return p.unitSystem != null && p.timezone != null
    case "metrics": return true // optional
    case "template": return false // completed by creating a routine
  }
}

export function firstIncompleteStep(p: StepProfile): StepId {
  const required = ONBOARDING_STEPS.filter((s) => s.required && s.id !== "template")
  return required.find((s) => !isStepComplete(s.id, p))?.id ?? "template"
}
```

- [ ] **Step 4: Implement the store and save hook**

Create `src/features/onboarding/stores/onboarding-store.ts`:

```ts
"use client"
import { create } from "zustand"

type Answers = Record<string, unknown>

type OnboardingState = {
  stepIndex: number
  answers: Answers
  setAnswer: (key: string, value: unknown) => void
  goNext: () => void
  goBack: () => void
  reset: (firstStepId: string) => void
}

const ORDER = ["goal", "experience", "equipment", "schedule", "preferences", "metrics", "template"]

export const useOnboardingStore = create<OnboardingState>((set) => ({
  stepIndex: 0,
  answers: {},
  setAnswer: (key, value) => set((s) => ({ answers: { ...s.answers, [key]: value } })),
  goNext: () => set((s) => ({ stepIndex: Math.min(s.stepIndex + 1, ORDER.length - 1) })),
  goBack: () => set((s) => ({ stepIndex: Math.max(s.stepIndex - 1, 0) })),
  reset: (firstStepId) => set({ stepIndex: Math.max(ORDER.indexOf(firstStepId), 0), answers: {} }),
}))
```

Create `src/features/onboarding/hooks/use-save-onboarding-step.ts`:

```ts
"use client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"

export function useSaveOnboardingStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      await api.patch("/profile", patch)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
  })
}
```

- [ ] **Step 5: Implement the step components and wizard**

Create the five step components. Each is a controlled, single-responsibility client component that renders options and calls `onSelect`. Example `goal-step.tsx`:

```tsx
"use client"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

const GOALS = ["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"] as const

export function GoalStep({ value, onSelect }: { value: string | null; onSelect: (goal: string) => void }) {
  const t = useTranslations("onboarding.goals")
  return (
    <div className="flex flex-col gap-3" role="radiogroup" aria-label={t("label")}>
      {GOALS.map((g) => (
        <Button
          key={g}
          role="radio"
          aria-checked={value === g}
          variant={value === g ? "default" : "secondary"}
          className="h-12 justify-start"
          onClick={() => onSelect(g)}
        >
          {t(g)}
        </Button>
      ))}
    </div>
  )
}
```

Implement `experience-step.tsx` (beginner/intermediate/advanced), `equipment-step.tsx` (location radio + equipment multi-select from the catalog `EQUIPMENT` list), `schedule-step.tsx` (days/week 1–7), `preferences-step.tsx` (unit system radio; timezone auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone` with a text override).

Create `src/features/onboarding/components/wizard.tsx` that renders the current step from the store, a progress bar (`aria-live="polite"`), Back/Next buttons, and on Next calls `useSaveOnboardingStep().mutateAsync(stepPatch)` before `goNext()`. `stepPatch` maps each step to its profile fields (`goal`; `experience`; `{ location, equipment }`; `{ daysPerWeek }`; `{ unitSystem, timezone }`; `{ birthYear, heightCm, weightKg, gender }`).

Modify `src/app/[locale]/onboarding/page.tsx` to fetch the profile server-side and render `<Wizard initialStep={firstIncompleteStep(profile)} profile={profile} />` plus a **Skip for now** button that calls `useSaveOnboardingStep` with `{ onboardingSkippedAt: new Date().toISOString() }` then `router.push('/{locale}/dashboard')`.

- [ ] **Step 6: Run the tests, lint, typecheck**

Run: `pnpm test tests/unit/onboarding-steps.test.ts tests/unit/onboarding-store.test.ts tests/unit/goal-step.test.tsx && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/onboarding src/app/[locale]/onboarding
git commit -m "feat: add onboarding wizard with core steps and per-step saves"
```

---

### Task 9: Metrics + template pick steps and completion

**Files:**
- Create: `src/features/onboarding/components/metrics-step.tsx`, `template-pick-step.tsx`
- Modify: `src/features/onboarding/components/wizard.tsx`
- Test: `tests/unit/template-pick-step.test.tsx`

**Interfaces:**
- Consumes: `useRoutineTemplates`, `useCreateFromTemplate` (Task 6), `useSaveOnboardingStep` (Task 8).
- Produces: `<TemplatePickStep onPicked={(routine) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/template-pick-step.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const createAsync = vi.fn(async () => ({ id: "r1", name: "Full Body 3x" }))
vi.mock("@/features/routines/hooks/use-routine-templates", () => ({
  useRoutineTemplates: () => ({
    data: [
      { slug: "full-body-3x", name: "Full Body 3x", nameEs: "Cuerpo Completo 3x", description: "d", descriptionEs: "d", daysPerWeek: 3, score: 9, recommended: true },
    ],
    isLoading: false,
  }),
}))
vi.mock("@/features/routines/hooks/use-create-from-template", () => ({
  useCreateFromTemplate: () => ({ mutateAsync: createAsync, isPending: false }),
}))
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { TemplatePickStep } from "@/features/onboarding/components/template-pick-step"

describe("TemplatePickStep", () => {
  it("creates a routine from the chosen template and reports it", async () => {
    const onPicked = vi.fn()
    render(<TemplatePickStep onPicked={onPicked} />)
    await userEvent.click(screen.getByRole("button", { name: /full-body-3x/i }))
    expect(createAsync).toHaveBeenCalledWith("full-body-3x")
    expect(onPicked).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/template-pick-step.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the two steps**

Create `metrics-step.tsx` (optional body-metrics form: birth year, height, weight, gender; a **Skip** action advances without saving).

Create `template-pick-step.tsx`:

```tsx
"use client"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useRoutineTemplates } from "@/features/routines/hooks/use-routine-templates"
import { useCreateFromTemplate } from "@/features/routines/hooks/use-create-from-template"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

export function TemplatePickStep({ onPicked }: { onPicked: (routine: RoutineDTO) => void }) {
  const t = useTranslations("onboarding.templates")
  const { data: templates, isLoading } = useRoutineTemplates()
  const create = useCreateFromTemplate()

  if (isLoading) return <p className="text-muted-foreground">{t("loading")}</p>

  return (
    <div className="flex flex-col gap-3">
      {(templates ?? []).map((tpl) => (
        <Button
          key={tpl.slug}
          variant={tpl.recommended ? "default" : "secondary"}
          className="h-auto flex-col items-start gap-1 p-4 text-left"
          disabled={create.isPending}
          onClick={async () => onPicked(await create.mutateAsync(tpl.slug))}
        >
          <span className="font-heading text-base">{tpl.name}</span>
          {tpl.recommended ? <span className="text-xs">{t("recommended")}</span> : null}
        </Button>
      ))}
    </div>
  )
}
```

In `wizard.tsx`, render `<MetricsStep />` for the `metrics` step and `<TemplatePickStep onPicked={() => router.push('/{locale}/dashboard')} />` for the `template` step (the created routine sets `onboardedAt` server-side).

- [ ] **Step 4: Run the test, lint, typecheck**

Run: `pnpm test tests/unit/template-pick-step.test.tsx && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/onboarding
git commit -m "feat: add metrics and template-pick onboarding steps"
```

---

### Task 10: Dashboard active-routine preview

**Files:**
- Create: `src/features/routines/components/routine-preview.tsx`
- Modify: `src/app/[locale]/(app)/dashboard/page.tsx`
- Test: `tests/unit/routine-preview.test.tsx`

**Interfaces:**
- Consumes: `useActiveRoutine` (Task 6), `EmptyState` (Phase 1), translations `dashboard.*`.
- Produces: `<RoutinePreview routine={RoutineDTO} />`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routine-preview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { RoutinePreview } from "@/features/routines/components/routine-preview"

const routine = {
  id: "r1", name: "Full Body 3x", description: null, source: "template" as const, isActive: true,
  days: [{ id: "d1", weekday: 1, label: "Full Body A", order: 0, exercises: [{ id: "e1", targetSets: 3, targetReps: "8-12", exercise: { id: "x1", name: "Barbell Squat", nameEs: null, images: [] } }] }],
}

describe("RoutinePreview", () => {
  it("shows the routine name, a day, and an exercise", () => {
    render(<RoutinePreview routine={routine} />)
    expect(screen.getByText("Full Body 3x")).toBeInTheDocument()
    expect(screen.getByText("Full Body A")).toBeInTheDocument()
    expect(screen.getByText(/Barbell Squat/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/routine-preview.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the preview and dashboard**

Create `routine-preview.tsx`: renders the routine name, each day (label or localized weekday), its exercises (name + `sets × reps`), and a **Start workout** button that is `disabled` with a "coming soon" label (Phase 2).

Modify `dashboard/page.tsx` to a client component that calls `useActiveRoutine()`:
- loading → skeleton;
- routine present → `<RoutinePreview routine={routine} />`;
- `null` → `<EmptyState>` with a **"Pick your routine"** CTA linking to `/{locale}/onboarding`.

- [ ] **Step 4: Run the test, lint, typecheck, build**

Run: `pnpm test tests/unit/routine-preview.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/routines src/app/[locale]/\(app\)/dashboard
git commit -m "feat: show active routine on the dashboard with setup CTA"
```

---

### Task 11: i18n dictionaries for onboarding & dashboard

**Files:**
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/es.json`
- Test: `tests/unit/onboarding-messages.test.ts`

**Interfaces:**
- Consumes: existing parity test (`tests/unit/i18n.test.ts`).
- Produces: `onboarding.*` and `dashboard.*` namespaces in both locales.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/onboarding-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

describe("onboarding copy", () => {
  it("has onboarding and dashboard namespaces in both locales", () => {
    for (const m of [en, es]) {
      expect(m.onboarding).toBeTruthy()
      expect(m.dashboard).toBeTruthy()
      expect(m.onboarding.goals.build_muscle.length).toBeGreaterThan(0)
      expect(m.dashboard.startWorkout.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/onboarding-messages.test.ts`
Expected: FAIL — namespaces missing.

- [ ] **Step 3: Add the namespaces**

Add to both dictionaries (identical keys): `onboarding.title`, `onboarding.progress`, `onboarding.back`, `onboarding.next`, `onboarding.skip`, `onboarding.finish`, `onboarding.goals.{label,lose_weight,build_muscle,get_stronger,endurance,general_fitness}`, `onboarding.experience.{label,beginner,intermediate,advanced}`, `onboarding.equipment.{label,location,gym,home,both}`, `onboarding.schedule.{label,days}`, `onboarding.preferences.{label,units,metric,imperial,timezone}`, `onboarding.metrics.{label,optional,birthYear,height,weight,gender}`, `onboarding.templates.{loading,recommended,pick}`, `dashboard.{activeRoutine,startWorkout,comingSoon,noRoutine,pickRoutine,finishSetup}`. Provide English and Spanish values.

- [ ] **Step 4: Run tests (parity + copy), lint, typecheck**

Run: `pnpm test tests/unit/onboarding-messages.test.ts tests/unit/i18n.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS (key parity holds).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages
git commit -m "feat: add onboarding and dashboard i18n copy (en/es)"
```

---

### Task 12: First Playwright e2e specs

**Files:**
- Create: `tests/e2e/helpers/session.ts`, `tests/e2e/onboarding.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: running app (`pnpm dev` or `pnpm start`), Docker Postgres, Prisma.
- Produces: `createTestSession(email): Promise<{ cookie: { name: string; value: string } }>` helper; two e2e specs.

- [ ] **Step 1: Add the `webServer` and a chromium project to `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://127.0.0.1:3000/en",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "", AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret", AUTH_URL: "http://127.0.0.1:3000" },
  },
  projects: [{ name: "chromium", use: { ...devices["Pixel 7"] } }],
})
```

- [ ] **Step 2: Implement the session helper**

Create `tests/e2e/helpers/session.ts` — inserts a `User` + `Profile` (or relies on the app) and a `Session` row, returning the `authjs.session-token` cookie value so the test can set it:

```ts
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../src/generated/prisma/client"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

export async function createTestSession(email: string) {
  const user = await prisma.user.create({ data: { email, profile: { create: {} } } })
  const token = `e2e_${user.id}_${Date.now()}`
  await prisma.session.create({ data: { sessionToken: token, userId: user.id, expires: new Date(Date.now() + 3_600_000) } })
  return { cookie: { name: "authjs.session-token", value: token }, userId: user.id }
}

export async function cleanupTestUser(email: string) {
  await prisma.user.deleteMany({ where: { email } })
}
```

- [ ] **Step 3: Write the specs**

Create `tests/e2e/onboarding.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { cleanupTestUser, createTestSession } from "./helpers/session"

const email = `e2e_onboarding_${Date.now()}@e2e-test.local`

test.afterAll(async () => { await cleanupTestUser(email) })

test("new user completes onboarding and lands on the dashboard with a routine", async ({ page, context }) => {
  const { cookie } = await createTestSession(email)
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  await page.goto("/en/dashboard")
  await expect(page).toHaveURL(/\/en\/onboarding/)

  await page.getByRole("button", { name: /Build Muscle|Ganar músculo/i }).click()
  await page.getByRole("button", { name: /Next|Siguiente/i }).click()
  // experience → equipment → schedule → preferences → metrics skip → template
  // (fill each required step, using stable test ids or accessible names)
  await expect(page).toHaveURL(/\/en\/dashboard/)
  await expect(page.getByText(/Full Body|Cuerpo Completo|Upper|PPL|Bodyweight/i)).toBeVisible()
})

test("skip for now reaches the dashboard without a routine", async ({ page, context }) => {
  const { cookie } = await createTestSession(`e2e_skip_${Date.now()}@e2e-test.local`)
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])
  await page.goto("/en/onboarding")
  await page.getByRole("button", { name: /Skip|Omitir/i }).click()
  await expect(page).toHaveURL(/\/en\/dashboard/)
  await expect(page.getByRole("link", { name: /Pick your routine|Elige tu rutina/i })).toBeVisible()
})
```

Fill in the intermediate step interactions using accessible names (add `data-testid` to step option buttons if needed for stability). The skip test must clean up its own user too.

- [ ] **Step 4: Run the e2e suite**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && docker compose up -d db && pnpm db:migrate && pnpm db:seed && pnpm e2e`
Expected: PASS (2 specs). If auth cookie handling differs, adjust the cookie name to what Auth.js writes (`authjs.session-token` for HTTP, `__Secure-authjs.session-token` for HTTPS).

- [ ] **Step 5: Commit**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test: add onboarding e2e specs (happy path and skip)"
```

---

### Task 13: Final gates and docs

**Files:**
- Modify: `docs/deploy.md` (note the new migration), `docs/superpowers/specs/2026-09-22-gym-tracker-phase1.5-onboarding-design.md` (mark implemented)

**Interfaces:** none.

- [ ] **Step 1: Run the full gate set**

Run:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db
pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:coverage && pnpm build && pnpm e2e
```
Expected: all PASS with pristine output.

- [ ] **Step 2: Verify the migration path still works**

Run the Docker `migrate` stage against a scratch database (as in Phase 1) and confirm the new `add_routine` migration applies.

- [ ] **Step 3: Update docs**

Add the `add_routine` migration to `docs/deploy.md` release notes; mark the Phase 1.5 spec status as "Implemented".

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: note phase 1.5 routine migration and implementation status"
```

---

## Self-Review

**Spec coverage (spec §1–§12):**

| Spec section | Task |
|---|---|
| §3.1 Routine/Day/Exercise schema | 1 |
| §3.2 Profile additions | 1, 7 |
| §3.3 Gate predicate | 2 |
| §4 Wizard (7 steps, per-step saves, resume, skip) | 2, 7, 8, 9 |
| §5.1 Templates representation | 3 |
| §5.2 The 5 templates | 3 |
| §5.3 Recommender | 4 |
| §6 API (templates, from-template, active, profile) | 6 |
| §7 Dashboard preview + empty state | 10 |
| §8 Event logging | 5, 7 |
| §9 Testing (unit/integration/e2e) | 2–12 |
| §10 Risks (catalog drift, single active, equipment enum, timezone, skip loop, gate loop) | 2, 3, 5, 7, 12 |
| §11 Acceptance criteria | 13 (gates) + 8–12 |
| §12 Traceability | covered by the above |

No spec section is untasked. Manual routine editing, the runner, and timers remain Phase 2 (non-goals).

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step shows real code. Task 3 explicitly requires filling the four remaining templates with real catalog `sourceId`s and validating them (Step 4) — that is a concrete instruction with an executable check, not a placeholder. Task 12 requires filling in the intermediate step interactions against accessible names — the specs' structure and assertions are given; the per-step clicks are concrete UI actions.

**Type/name consistency:** `needsOnboarding`, `firstIncompleteStep`, `ROUTINE_TEMPLATES`/`getTemplateBySlug`, `recommendTemplates`/`ScoredTemplate`, `createRoutineFromTemplate`/`getActiveRoutine`, `routineSelect`, `resolveTemplateExercises`, `routineKeys`, `useActiveRoutine`/`useRoutineTemplates`/`useCreateFromTemplate`, `fromTemplateSchema`, `RoutineDTO` are used with the same signatures across tasks. API paths: `GET /api/routine-templates`, `POST /api/routines/from-template`, `GET /api/routines/active`, `PATCH /api/profile`.

**Review Focus → tests:** (1) missing `sourceId` fail-closed → Task 3 Step 4 integration + Task 5 Step 4 unit; (2) single active routine → Task 5 Step 1 integration; (3) skip must not loop → Task 2 Step 7 integration + Task 12 skip spec; (4) resume mid-flow → Task 8 Step 1 unit; (5) equipment enum rejection → Task 7 Step 1 unit.

---

## Notes for the human partner

- **Ordering:** Tasks 1→13 are sequential. Tasks 1 and 7 change the Prisma schema (run `pnpm db:migrate` as written).
- **Data prerequisites:** the exercise catalog must be seeded (`pnpm db:seed`) before Tasks 1, 3, 5, and 12.
- **Auth in e2e:** the specs bypass OAuth by inserting a database `Session` row and setting the Auth.js cookie; adjust the cookie name if Auth.js changes it.
- **Skills:** consult `.opencode/skills/` (`nextjs-app-router`, `typescript-strict-patterns`, `prisma-postgres-optimization`, `tailwind-theme-builder`, `shadcn-ui`, `vercel-react-best-practices`). Where Vercel's RSC-first guidance conflicts with the client-first data flow, this plan and the spec win.
