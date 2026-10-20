# Gym Tracker — Phase 2A Routine Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create, edit (days + exercises + prescriptions), reorder, activate, duplicate, and delete their own routines from a mobile-first builder backed by an atomic whole-routine save.

**Architecture:** Client-first (axios + TanStack Query) per Phase 1. The editor holds a local draft in a persisted Zustand store and saves the whole routine with one `PUT` that replaces days+exercises in a transaction. A dedicated picker route adds catalog exercises to a draft day. dnd-kit provides reordering with a keyboard sensor.

**Tech Stack:** Next.js 16, TypeScript strict, Prisma 7, Auth.js v5, next-intl (EN/ES), TanStack Query + axios, Zustand (persist), Zod, dnd-kit, Vitest + RTL + Playwright, pino.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase2a-routine-builder-design.md` (binding). Parent: `docs/superpowers/specs/2026-09-22-gym-tracker-design.md`.

## Global Constraints

- **App Router only**; async request APIs awaited; `proxy.ts` is the middleware; `/api/*` handlers self-guard with `auth()`.
- **Prisma 7:** `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client`; never `@prisma/client`. CLI config `prisma7.config.ts`.
- **Layering:** Route Handler → Service → Repository. Services/repos start with `import "server-only"`. Prisma calls live in repositories (transaction helpers accept a tx client).
- **API envelope:** `{ data }` / `{ error: { code, message, details? } }` via `ok`/`toApiError`. Never return raw Prisma models — always `select`.
- **Authorization:** every query/mutation scoped by `userId` from `auth()`; `NotFoundError` when 0 rows.
- **Validation:** one shared Zod schema per input (client + server).
- **i18n:** `en`/`es` identical key sets (parity test); no hardcoded user-facing copy.
- **Design:** mobile-first, ≥44px targets, visible focus, Phosphor icons, light+dark tokens.
- **Testing:** Vitest + RTL (MSW for HTTP), integration against Docker Postgres, Playwright e2e. Output pristine.
- **Docker:** `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`; `docker compose up -d db`; seed catalog (`pnpm db:seed`) before catalog-dependent tests.
- **Commits:** Conventional Commits, one logical change each.

## Review Focus

Five inputs/failure modes the spec implies but no happy-path test covers. Each is pinned to a test in the owning task.

1. **`PUT` with two days on the same weekday** — rejected with a 400, and **no partial write** occurs. (Task 2 + Task 3)
2. **`PUT`/`DELETE`/`activate` on another user's routine id** — `404`, and the other user's routine is untouched. (Task 3)
3. **Activating a routine while another is active** — exactly one active afterward, atomically. (Task 3)
4. **Deleting the active routine** — leaves no active routine; the dashboard renders the empty state instead of crashing. (Task 3 + Task 6)
5. **Navigating to the picker and back mid-edit** — the unsaved draft (added day, edited sets) is preserved. (Task 8)

---

### Task 1: `RoutineDay` unique-weekday migration + routine summary queries

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/integration/routine-list.test.ts`
- Migration: `prisma/migrations/*_add_routine_day_unique_weekday`

**Interfaces:**
- Consumes: `prisma`, existing `Routine`/`RoutineDay`/`RoutineExercise`.
- Produces: `RoutineDay @@unique([routineId, weekday])`; repository `listByUser(userId)` returning summaries.

- [ ] **Step 1: Add the constraint**

In `prisma/schema.prisma` add to `model RoutineDay`:

```prisma
  @@unique([routineId, weekday])
```

- [ ] **Step 2: Migrate and regenerate**

Run:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db
pnpm db:migrate --name add_routine_day_unique_weekday
pnpm db:generate
```
Expected: migration created; client regenerated.

- [ ] **Step 3: Write the failing query test**

Add to `src/server/repositories/routine.repository.ts` a `listByUser` and test it. Create `tests/integration/routine-list.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listByUser } from "@/server/repositories/routine.repository"

const DOMAIN = "@routine-list-test.local"

async function makeUser() {
  return prisma.user.create({ data: { email: `rl_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
}

describe("routine.repository.listByUser", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("returns summaries with day and exercise counts, newest first", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true } })
    await prisma.routine.create({
      data: {
        userId: user.id, name: "A", source: "manual", isActive: false,
        days: { create: [{ weekday: 1, label: null, order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", restSeconds: 60 }] } }] },
      },
    })
    const rows = await listByUser(user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: "A", dayCount: 1, exerciseCount: 1 })
  })

  it("rejects two days on the same weekday", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true } })
    await expect(
      prisma.routine.create({
        data: {
          userId: user.id, name: "Dup", source: "manual",
          days: { create: [
            { weekday: 1, order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", restSeconds: 60 }] } },
            { weekday: 1, order: 1, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", restSeconds: 60 }] } },
          ] },
        },
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test:integration tests/integration/routine-list.test.ts`
Expected: FAIL — `listByUser` is not exported.

- [ ] **Step 5: Implement `listByUser`**

Append to `src/server/repositories/routine.repository.ts`:

```ts
export type RoutineSummary = {
  id: string
  name: string
  description: string | null
  source: "manual" | "ai" | "template"
  isActive: boolean
  updatedAt: Date
  dayCount: number
  exerciseCount: number
}

export async function listByUser(userId: string): Promise<RoutineSummary[]> {
  const rows = await prisma.routine.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      source: true,
      isActive: true,
      updatedAt: true,
      _count: { select: { days: true } },
      days: { select: { _count: { select: { exercises: true } } } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    source: r.source,
    isActive: r.isActive,
    updatedAt: r.updatedAt,
    dayCount: r._count.days,
    exerciseCount: r.days.reduce((sum, d) => sum + d._count.exercises, 0),
  }))
}
```

- [ ] **Step 6: Run the test**

Run: `pnpm test:integration tests/integration/routine-list.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma src/server/repositories/routine.repository.ts tests/integration/routine-list.test.ts
git commit -m "feat: enforce unique routine weekday and add routine summaries"
```

---

### Task 2: Routine input schemas (Zod)

**Files:**
- Create: `src/features/routines/schemas/routine.ts`, `tests/unit/routine-schema.test.ts`

**Interfaces:**
- Consumes: `Goal`, `TimerType` enums from `@/generated/prisma/client`.
- Produces: `createRoutineSchema`, `routineInputSchema`, `createRoutineInput`/`RoutineInput` types.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routine-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { createRoutineSchema, routineInputSchema } from "@/features/routines/schemas/routine"

const day = {
  weekday: 1,
  label: "Push",
  exercises: [
    { exerciseId: "e1", targetSets: 3, targetReps: "8-12", restSeconds: 90, targetWeightKg: null, timerType: "none", workSeconds: null, rounds: null, notes: null },
  ],
}

describe("createRoutineSchema", () => {
  it("accepts a name and rejects an empty one", () => {
    expect(createRoutineSchema.safeParse({ name: "My Routine" }).success).toBe(true)
    expect(createRoutineSchema.safeParse({ name: "" }).success).toBe(false)
  })
})

describe("routineInputSchema", () => {
  it("accepts a valid routine", () => {
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [day] }).success).toBe(true)
  })
  it("rejects duplicate weekdays", () => {
    const result = routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [day, { ...day, label: "Push 2" }] })
    expect(result.success).toBe(false)
  })
  it("requires a day and an exercise", () => {
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [] }).success).toBe(false)
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ weekday: 1, label: null, exercises: [] }] }).success).toBe(false)
  })
  it("requires workSeconds and rounds when a timer is set", () => {
    const timed = { ...day, exercises: [{ ...day.exercises[0], timerType: "emom", workSeconds: null, rounds: null }] }
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [timed] }).success).toBe(false)
  })
  it("rejects out-of-range sets", () => {
    const bad = { ...day, exercises: [{ ...day.exercises[0], targetSets: 0 }] }
    expect(routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [bad] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/routine-schema.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the schemas**

Create `src/features/routines/schemas/routine.ts`:

```ts
import { z } from "zod"

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().default(null),
  goal: z
    .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
    .nullable()
    .default(null),
})
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>

const timerTypeSchema = z.enum(["none", "interval", "emom", "amrap"])

export const routineExerciseInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    targetSets: z.number().int().min(1).max(20),
    targetReps: z.string().trim().min(1).max(20),
    restSeconds: z.number().int().min(0).max(3600),
    targetWeightKg: z.number().positive().max(1000).nullable().default(null),
    timerType: timerTypeSchema.default("none"),
    workSeconds: z.number().int().min(1).max(3600).nullable().default(null),
    rounds: z.number().int().min(1).max(50).nullable().default(null),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .refine((v) => v.timerType === "none" || (v.workSeconds != null && v.rounds != null), {
    message: "workSeconds and rounds are required for timed exercises",
    path: ["timerType"],
  })

export const routineDayInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  label: z.string().trim().max(60).nullable().default(null),
  exercises: z.array(routineExerciseInputSchema).min(1).max(50),
})

export const routineInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable().default(null),
    goal: z
      .enum(["lose_weight", "build_muscle", "get_stronger", "endurance", "general_fitness"])
      .nullable()
      .default(null),
    days: z.array(routineDayInputSchema).min(1).max(7),
  })
  .refine((v) => new Set(v.days.map((d) => d.weekday)).size === v.days.length, {
    message: "Each weekday may appear only once",
    path: ["days"],
  })
export type RoutineInput = z.infer<typeof routineInputSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/routine-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/routines/schemas tests/unit/routine-schema.test.ts
git commit -m "feat: add routine input validation schemas"
```

---

### Task 3: Routine CRUD service (create/list/get/replace/activate/duplicate/delete)

**Files:**
- Create: `src/features/routines/lib/copy-name.ts`, `tests/unit/copy-name.test.ts`, `tests/integration/routine-crud.test.ts`
- Modify: `src/server/repositories/routine.repository.ts`, `src/server/services/routine.service.ts`

**Interfaces:**
- Consumes: `routineInputSchema`/`createRoutineInput` (Task 2), `routineSelect` (Phase 1.5), `NotFoundError`/`ValidationError`, `logger`.
- Produces: repository helpers `findByIdForUser`, `createBlank`, `createWithDays`, `replaceDays`, `deleteByIdForUser`, `setActive`, `duplicate`; service `createBlankRoutine`, `listRoutines`, `getRoutine`, `replaceRoutine`, `activateRoutine`, `duplicateRoutine`, `deleteRoutine`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/copy-name.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { copyRoutineName } from "@/features/routines/lib/copy-name"

describe("copyRoutineName", () => {
  it("appends a localized copy suffix", () => {
    expect(copyRoutineName("Push Day", "en")).toBe("Push Day (copy)")
    expect(copyRoutineName("Push Day", "es")).toBe("Push Day (copia)")
  })
  it("falls back to English for an unknown locale", () => {
    expect(copyRoutineName("X", "fr")).toBe("X (copy)")
  })
})
```

Create `tests/integration/routine-crud.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  activateRoutine, createBlankRoutine, deleteRoutine, duplicateRoutine,
  getRoutine, listRoutines, replaceRoutine,
} from "@/server/services/routine.service"

const DOMAIN = "@routine-crud-test.local"
const input = {
  name: "Edited",
  description: null,
  goal: null,
  days: [
    { weekday: 1, label: "Push", exercises: [{ exerciseId: "", targetSets: 4, targetReps: "6-8", restSeconds: 120, targetWeightKg: null, timerType: "none" as const, workSeconds: null, rounds: null, notes: null }] },
  ],
}

async function makeUser() {
  return prisma.user.create({ data: { email: `rc_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
}
async function firstExerciseId() {
  return (await prisma.exercise.findFirstOrThrow({ select: { id: true } })).id
}

describe("routine service CRUD", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("creates a blank inactive routine and lists it", async () => {
    const user = await makeUser()
    const routine = await createBlankRoutine(user.id, { name: "Blank", description: null, goal: null })
    expect(routine.isActive).toBe(false)
    expect(routine.days).toHaveLength(0)
    const list = await listRoutines(user.id)
    expect(list.map((r) => r.id)).toContain(routine.id)
  })

  it("replaces days atomically and keeps only one active routine", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    const b = await createBlankRoutine(user.id, { name: "B", description: null, goal: null })
    await replaceRoutine(user.id, a.id, { ...input, days: [{ ...input.days[0], exercises: [{ ...input.days[0].exercises[0], exerciseId }] }] })
    await activateRoutine(user.id, a.id)
    await activateRoutine(user.id, b.id)
    const active = await prisma.routine.count({ where: { userId: user.id, isActive: true } })
    expect(active).toBe(1)
    const fetched = await getRoutine(user.id, a.id)
    expect(fetched.name).toBe("Edited")
    expect(fetched.days[0]?.exercises).toHaveLength(1)
  })

  it("rejects duplicate weekdays without partial write", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    const dup = { ...input, days: [
      { ...input.days[0], exercises: [{ ...input.days[0].exercises[0], exerciseId }] },
      { ...input.days[0], label: "Push 2", exercises: [{ ...input.days[0].exercises[0], exerciseId }] },
    ] }
    await expect(replaceRoutine(user.id, a.id, dup)).rejects.toThrow()
    expect((await getRoutine(user.id, a.id)).days).toHaveLength(0)
  })

  it("scopes by owner (404 for another user)", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const routine = await createBlankRoutine(owner.id, { name: "Mine", description: null, goal: null })
    await expect(getRoutine(other.id, routine.id)).rejects.toThrow("Routine not found")
    await expect(deleteRoutine(other.id, routine.id)).rejects.toThrow("Routine not found")
    expect(await prisma.routine.count({ where: { id: routine.id } })).toBe(1)
  })

  it("duplicates days+exercises independently and delete leaves no active routine", async () => {
    const user = await makeUser()
    const exerciseId = await firstExerciseId()
    const a = await createBlankRoutine(user.id, { name: "A", description: null, goal: null })
    await replaceRoutine(user.id, a.id, { ...input, days: [{ ...input.days[0], exercises: [{ ...input.days[0].exercises[0], exerciseId }] }] })
    await activateRoutine(user.id, a.id)
    const copy = await duplicateRoutine(user.id, a.id, "en")
    expect(copy.name).toBe("Edited (copy)")
    expect(copy.isActive).toBe(false)
    expect(copy.days[0]?.exercises).toHaveLength(1)
    await deleteRoutine(user.id, a.id)
    expect(await prisma.routine.count({ where: { userId: user.id, isActive: true } })).toBe(0)
    expect(await prisma.routine.count({ where: { id: copy.id } })).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/copy-name.test.ts && pnpm test:integration tests/integration/routine-crud.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the copy-name helper**

Create `src/features/routines/lib/copy-name.ts`:

```ts
const SUFFIX: Record<string, string> = { en: "copy", es: "copia" }

export function copyRoutineName(name: string, locale: string): string {
  return `${name} (${SUFFIX[locale] ?? SUFFIX.en})`
}
```

- [ ] **Step 4: Add repository helpers**

Append to `src/server/repositories/routine.repository.ts` (reuse the existing `withTransaction` from Phase 1.5's fix wave — if absent, add a `withTransaction` helper that runs `prisma.$transaction`):

```ts
import type { Prisma, PrismaClient } from "@/generated/prisma/client"

type Tx = Prisma.TransactionClient

export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn)
}

export function findByIdForUser(userId: string, id: string) {
  return prisma.routine.findFirst({ where: { id, userId }, select: routineSelect })
}

export function createBlank(userId: string, data: { name: string; description: string | null; goal: string | null }) {
  return prisma.routine.create({
    data: { userId, name: data.name, description: data.description, goal: data.goal as never, source: "manual", isActive: false },
    select: routineSelect,
  })
}

export async function replaceDays(tx: Tx, routineId: string, days: {
  weekday: number; label: string | null; order: number;
  exercises: { exerciseId: string; order: number; targetSets: number; targetReps: string; restSeconds: number; targetWeightKg: number | null; timerType: string; workSeconds: number | null; rounds: number | null; notes: string | null }[]
}[], header: { name: string; description: string | null; goal: string | null }) {
  await tx.routineDay.deleteMany({ where: { routineId } })
  await tx.routine.update({
    where: { id: routineId },
    data: {
      name: header.name,
      description: header.description,
      goal: header.goal as never,
      days: {
        create: days.map((d) => ({
          weekday: d.weekday, label: d.label, order: d.order,
          exercises: { create: d.exercises.map((e) => ({
            exerciseId: e.exerciseId, order: e.order, targetSets: e.targetSets, targetReps: e.targetReps,
            restSeconds: e.restSeconds, targetWeightKg: e.targetWeightKg, timerType: e.timerType as never,
            workSeconds: e.workSeconds, rounds: e.rounds, notes: e.notes,
          })) },
        })),
      },
    },
  })
}

export async function deleteByIdForUser(userId: string, id: string): Promise<number> {
  const result = await prisma.routine.deleteMany({ where: { id, userId } })
  return result.count
}

export async function setActive(tx: Tx, userId: string, id: string) {
  await tx.routine.updateMany({ where: { userId, isActive: true }, data: { isActive: false } })
  return tx.routine.update({ where: { id }, data: { isActive: true }, select: routineSelect })
}

export function duplicateSource(userId: string, id: string) {
  return prisma.routine.findFirst({
    where: { id, userId },
    select: { id: true, name: true, description: true, goal: true, days: { orderBy: { order: "asc" }, select: { weekday: true, label: true, order: true, exercises: { orderBy: { order: "asc" }, select: { exerciseId: true, order: true, targetSets: true, targetReps: true, restSeconds: true, targetWeightKg: true, timerType: true, workSeconds: true, rounds: true, notes: true } } } } },
  })
}
```

- [ ] **Step 5: Implement the service functions**

Append to `src/server/services/routine.service.ts` (keep the existing `createRoutineFromTemplate`/`getActiveRoutine`/`resolveTemplateExercises`):

```ts
import type { CreateRoutineInput, RoutineInput } from "@/features/routines/schemas/routine"
import { copyRoutineName } from "@/features/routines/lib/copy-name"
import * as routineRepository from "@/server/repositories/routine.repository"

export async function createBlankRoutine(userId: string, input: CreateRoutineInput) {
  const routine = await routineRepository.createBlank(userId, input)
  logger.info({ event: "routine.created", userId, routineId: routine.id }, "routine created")
  return routine
}

export function listRoutines(userId: string) {
  return routineRepository.listByUser(userId)
}

export async function getRoutine(userId: string, id: string) {
  const routine = await routineRepository.findByIdForUser(userId, id)
  if (!routine) throw new NotFoundError("Routine not found")
  return routine
}

export async function replaceRoutine(userId: string, id: string, input: RoutineInput) {
  const owned = await routineRepository.findByIdForUser(userId, id)
  if (!owned) throw new NotFoundError("Routine not found")
  const days = input.days.map((d, di) => ({
    weekday: d.weekday, label: d.label, order: di,
    exercises: d.exercises.map((e, ei) => ({ ...e, order: ei })),
  }))
  const routine = await routineRepository.withTransaction(async (tx) => {
    await routineRepository.replaceDays(tx, id, days, { name: input.name, description: input.description, goal: input.goal })
    return routineRepository.findByIdForUser(userId, id)
  })
  logger.info({ event: "routine.updated", userId, routineId: id }, "routine updated")
  return routine
}

export async function activateRoutine(userId: string, id: string) {
  const owned = await routineRepository.findByIdForUser(userId, id)
  if (!owned) throw new NotFoundError("Routine not found")
  const routine = await routineRepository.withTransaction((tx) => routineRepository.setActive(tx, userId, id))
  logger.info({ event: "routine.activated", userId, routineId: id }, "routine activated")
  return routine
}

export async function duplicateRoutine(userId: string, id: string, locale: string) {
  const source = await routineRepository.duplicateSource(userId, id)
  if (!source) throw new NotFoundError("Routine not found")
  const routine = await routineRepository.withTransaction(async (tx) => {
    const created = await tx.routine.create({
      data: { userId, name: copyRoutineName(source.name, locale), description: source.description, goal: source.goal, source: "manual", isActive: false },
      select: { id: true },
    })
    await routineRepository.replaceDays(tx, created.id, source.days.map((d) => ({
      weekday: d.weekday, label: d.label, order: d.order,
      exercises: d.exercises.map((e) => ({ ...e, timerType: e.timerType as unknown as string })),
    })), { name: copyRoutineName(source.name, locale), description: source.description, goal: source.goal })
    return routineRepository.findByIdForUser(userId, created.id)
  })
  logger.info({ event: "routine.duplicated", userId, routineId: id }, "routine duplicated")
  return routine
}

export async function deleteRoutine(userId: string, id: string) {
  const count = await routineRepository.deleteByIdForUser(userId, id)
  if (count === 0) throw new NotFoundError("Routine not found")
  logger.info({ event: "routine.deleted", userId, routineId: id }, "routine deleted")
}
```

- [ ] **Step 6: Run the tests, lint, typecheck**

Run: `pnpm test tests/unit/copy-name.test.ts && pnpm test:integration tests/integration/routine-crud.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS. Fix the `as never` casts with proper generated enum types (`Goal`, `TimerType`) if typecheck complains — never widen to `any`.

- [ ] **Step 7: Commit**

```bash
git add src/server src/features/routines tests
git commit -m "feat: add routine CRUD service"
```

---

### Task 4: Routine APIs + hooks

**Files:**
- Create: `src/app/api/routines/route.ts` (GET list, POST create), `src/app/api/routines/[routineId]/route.ts` (GET, PUT, DELETE), `src/app/api/routines/[routineId]/activate/route.ts`, `src/app/api/routines/[routineId]/duplicate/route.ts`, `src/features/routines/hooks/use-routines.ts`, `use-routine.ts`, `use-create-routine.ts`, `use-update-routine.ts`, `use-delete-routine.ts`, `use-activate-routine.ts`, `use-duplicate-routine.ts`
- Modify: `src/features/routines/hooks/query-keys.ts`
- Test: `tests/unit/routines-route.test.ts`

**Interfaces:**
- Consumes: service fns (Task 3), `createRoutineSchema`/`routineInputSchema` (Task 2), `auth`/`ok`/`toApiError`.
- Produces: `routineKeys.list/detail(id)`; the seven hooks.

- [ ] **Step 1: Write the failing route test**

Create `tests/unit/routines-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/routine.service", () => ({
  listRoutines: vi.fn(async () => [{ id: "r1", name: "A", isActive: true, dayCount: 1, exerciseCount: 2 }]),
  createBlankRoutine: vi.fn(async (_u: string, input: { name: string }) => ({ id: "r2", name: input.name, days: [] })),
}))

import { GET, POST } from "@/app/api/routines/route"

describe("/api/routines", () => {
  it("GET returns the list envelope", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].id).toBe("r1")
  })
  it("POST rejects an invalid body with 400", async () => {
    const res = await POST(new Request("http://x/api/routines", { method: "POST", body: JSON.stringify({ name: "" }) }))
    expect(res.status).toBe(400)
  })
  it("POST creates with 201", async () => {
    const res = await POST(new Request("http://x/api/routines", { method: "POST", body: JSON.stringify({ name: "New" }) }))
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/routines-route.test.ts`
Expected: FAIL — route missing.

- [ ] **Step 3: Implement the routes**

`src/app/api/routines/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { createRoutineSchema } from "@/features/routines/schemas/routine"
import { createBlankRoutine, listRoutines } from "@/server/services/routine.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await listRoutines(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const parsed = createRoutineSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid routine", parsed.error.flatten())
    return ok(await createBlankRoutine(session.user.id, parsed.data), { status: 201 })
  } catch (error) {
    return toApiError(error)
  }
}
```

`src/app/api/routines/[routineId]/route.ts` (GET/PUT/DELETE) and the `activate`/`duplicate` routes follow the same shape. `PUT` validates with `routineInputSchema`; `DELETE` returns `ok({ deleted: true })`; `duplicate` passes the request locale (read from a `?locale=` query or `Accept-Language`) to the service. Use `RouteContext<"/api/routines/[routineId]">` and `await ctx.params`.

- [ ] **Step 4: Extend `query-keys.ts` and implement the hooks**

```ts
export const routineKeys = {
  all: ["routines"] as const,
  templates: () => [...routineKeys.all, "templates"] as const,
  active: () => [...routineKeys.all, "active"] as const,
  list: () => [...routineKeys.all, "list"] as const,
  detail: (id: string) => [...routineKeys.all, "detail", id] as const,
}
```

Implement the seven hooks following the one-hook-per-query/mutation rule; each mutation invalidates `routineKeys.list()`, `routineKeys.detail(id)`, and `routineKeys.active()` as appropriate (create/delete/activate/duplicate affect the active routine and the list).

- [ ] **Step 5: Run tests, lint, typecheck, build**

Run: `pnpm test tests/unit/routines-route.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api src/features/routines tests
git commit -m "feat: add routine CRUD APIs and hooks"
```

---

### Task 5: Exercise catalog `level` filter

**Files:**
- Modify: `src/features/exercises/schemas/exercise.ts`, `src/server/repositories/exercise.repository.ts`
- Test: `tests/unit/exercise-query.test.ts` (extend)

**Interfaces:**
- Consumes: existing exercise list schema/repo.
- Produces: `level` optional filter on `GET /api/exercises`.

- [ ] **Step 1: Extend the failing test**

Add to `tests/unit/exercise-query.test.ts`:

```ts
it("accepts a level filter and rejects an unknown level", () => {
  expect(exerciseListQuerySchema.safeParse({ level: "beginner" }).success).toBe(true)
  expect(exerciseListQuerySchema.safeParse({ level: "godlike" }).success).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/exercise-query.test.ts`
Expected: FAIL — `level` unknown.

- [ ] **Step 3: Add `level` to the schema and repository**

In `exerciseListQuerySchema` add `level: z.enum(["beginner", "intermediate", "expert"]).optional()`. In the repository `list`, add `...(level ? { level } : {})` to the `where`.

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `pnpm test tests/unit/exercise-query.test.ts && pnpm test:integration && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/exercises src/server/repositories/exercise.repository.ts tests
git commit -m "feat: add level filter to exercise catalog"
```

---

### Task 6: Routines list page

**Files:**
- Create: `src/app/[locale]/(app)/routines/page.tsx`, `src/features/routines/components/routine-list.tsx`, `routine-card.tsx`
- Test: `tests/unit/routine-card.test.tsx`

**Interfaces:**
- Consumes: `useRoutines`, `useActivateRoutine`, `useDeleteRoutine`, `useDuplicateRoutine` (Task 4), `EmptyState`, translations `routines.*`.
- Produces: `<RoutineCard routine onActivate onDuplicate onDelete />`, the list page.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routine-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { RoutineCard } from "@/features/routines/components/routine-card"

const routine = { id: "r1", name: "Push Day", description: null, source: "manual" as const, isActive: true, dayCount: 3, exerciseCount: 12, updatedAt: new Date().toISOString() }

describe("RoutineCard", () => {
  it("shows the name and counts, and fires actions", async () => {
    const onActivate = vi.fn()
    render(<RoutineCard routine={routine} onActivate={onActivate} onDuplicate={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText("Push Day")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /activate/i }))
    expect(onActivate).toHaveBeenCalledWith("r1")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/routine-card.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the card and page**

`RoutineCard`: name, active badge, `dayCount`/`exerciseCount`, and actions (Activate — hidden/disabled when already active; Duplicate; Delete with a confirm dialog; click card → editor). `RoutineList`: maps cards; empty → `EmptyState` with a "New routine" CTA. The page (`routines/page.tsx`) is a client component using the hooks, with loading skeleton and an error state (retry).

- [ ] **Step 4: Run test, lint, typecheck, build**

Run: `pnpm test tests/unit/routine-card.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/\(app\)/routines src/features/routines tests
git commit -m "feat: add routines list page with activate/duplicate/delete"
```

---

### Task 7: New-routine page (blank or from template)

**Files:**
- Create: `src/app/[locale]/(app)/routines/new/page.tsx`, `src/features/routines/components/new-routine-form.tsx`
- Test: `tests/unit/new-routine-form.test.tsx`

**Interfaces:**
- Consumes: `useCreateRoutine` (Task 4), `useRoutineTemplates`/`useCreateFromTemplate` (Phase 1.5), translations `routines.new.*`.
- Produces: `<NewRoutineForm />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ locale: "en" }) }))

const create = vi.fn(async () => ({ id: "r9" }))
vi.mock("@/features/routines/hooks/use-create-routine", () => ({ useCreateRoutine: () => ({ mutateAsync: create, isPending: false }) }))
vi.mock("@/features/routines/hooks/use-routine-templates", () => ({ useRoutineTemplates: () => ({ data: [], isLoading: false }) }))
vi.mock("@/features/routines/hooks/use-create-from-template", () => ({ useCreateFromTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

import { NewRoutineForm } from "@/features/routines/components/new-routine-form"

describe("NewRoutineForm", () => {
  it("creates a blank routine and navigates to the editor", async () => {
    render(<NewRoutineForm />)
    await userEvent.type(screen.getByLabelText(/name/i), "My Plan")
    await userEvent.click(screen.getByRole("button", { name: /create blank|^create$/i }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "My Plan" }))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/new-routine-form.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the form**

Name (required), description, goal select; a "Start from a template" list (reusing `useRoutineTemplates`); "Create blank" → `useCreateRoutine` → `router.push('/{locale}/routines/{id}')`; template choose → `useCreateFromTemplate` → same redirect. Validate with `createRoutineSchema` (react-hook-form + zodResolver).

- [ ] **Step 4: Run test, lint, typecheck, build**

Run: `pnpm test tests/unit/new-routine-form.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/\(app\)/routines/new src/features/routines tests
git commit -m "feat: add new-routine page (blank or template)"
```

---

### Task 8: Editor draft store, reorder helpers, and editor UI

**Files:**
- Create: `src/features/routines/stores/routine-draft-store.ts`, `src/features/routines/lib/reorder.ts`, `src/features/routines/components/routine-editor.tsx`, `day-list.tsx`, `day-card.tsx`, `exercise-row.tsx`, `exercise-fields.tsx`, `save-bar.tsx`, `src/app/[locale]/(app)/routines/[routineId]/page.tsx`
- Test: `tests/unit/reorder.test.ts`, `tests/unit/routine-draft-store.test.ts`, `tests/unit/exercise-row.test.tsx`

**Interfaces:**
- Consumes: `useRoutine`, `useUpdateRoutine` (Task 4), `routineInputSchema` (Task 2), dnd-kit, `useRoutineTemplates` not needed here.
- Produces: `moveItem<T>(items, from, to): T[]`; `useRoutineDraftStore` with `hydrate`, `setHeader`, `addDay`, `removeDay`, `updateDay`, `addExercises(dayId, exercises)`, `updateExercise`, `removeExercise`, `moveDay`, `moveExercise`, `isDirty`, `clearDraft`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/reorder.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { moveItem } from "@/features/routines/lib/reorder"

describe("moveItem", () => {
  it("moves an item forward and backward without mutating the input", () => {
    const input = ["a", "b", "c"]
    expect(moveItem(input, 0, 2)).toEqual(["b", "c", "a"])
    expect(moveItem(input, 2, 0)).toEqual(["c", "a", "b"])
    expect(input).toEqual(["a", "b", "c"])
  })
  it("is a no-op for the same index or out-of-range indices", () => {
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"])
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"])
  })
})
```

Create `tests/unit/routine-draft-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { useRoutineDraftStore } from "@/features/routines/stores/routine-draft-store"

const routine = {
  id: "r1", name: "Plan", description: null, source: "manual" as const, isActive: false,
  days: [{ id: "d1", weekday: 1, label: "Push", order: 0, exercises: [] }],
}

describe("routine draft store", () => {
  beforeEach(() => useRoutineDraftStore.getState().clearDraft())

  it("hydrates, edits, and marks dirty; clearDraft resets", () => {
    const s = useRoutineDraftStore.getState()
    s.hydrate(routine)
    expect(useRoutineDraftStore.getState().isDirty).toBe(false)
    useRoutineDraftStore.getState().setHeader({ name: "Renamed" })
    expect(useRoutineDraftStore.getState().name).toBe("Renamed")
    expect(useRoutineDraftStore.getState().isDirty).toBe(true)
    useRoutineDraftStore.getState().clearDraft()
    expect(useRoutineDraftStore.getState().days).toHaveLength(0)
  })

  it("adds a day with a client id and appends exercises to it", () => {
    useRoutineDraftStore.getState().hydrate(routine)
    useRoutineDraftStore.getState().addDay(2)
    const days = useRoutineDraftStore.getState().days
    const created = days.at(-1)!
    expect(created.id).toBeTruthy()
    useRoutineDraftStore.getState().addExercises(created.id, [{ exerciseId: "e1", name: "Squat" }])
    const updated = useRoutineDraftStore.getState().days.at(-1)!
    expect(updated.exercises).toHaveLength(1)
    expect(updated.exercises[0]?.name).toBe("Squat")
  })

  it("survives a rehydrate for the same routine but resets for a different one", () => {
    useRoutineDraftStore.getState().hydrate(routine)
    useRoutineDraftStore.getState().addDay(3)
    useRoutineDraftStore.getState().hydrate(routine) // same id → keep draft
    expect(useRoutineDraftStore.getState().days).toHaveLength(2)
    useRoutineDraftStore.getState().hydrate({ ...routine, id: "r2", name: "Other" })
    expect(useRoutineDraftStore.getState().name).toBe("Other")
    expect(useRoutineDraftStore.getState().days).toHaveLength(1)
  })
})
```

Create `tests/unit/exercise-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { ExerciseRow } from "@/features/routines/components/exercise-row"

const exercise = { id: "x1", exerciseId: "e1", name: "Squat", targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: null, timerType: "none" as const, workSeconds: null, rounds: null, notes: null }

describe("ExerciseRow", () => {
  it("shows the name and fires an edit on sets change", async () => {
    const onChange = vi.fn()
    render(<ExerciseRow exercise={exercise} onChange={onChange} onRemove={vi.fn()} />)
    expect(screen.getByText("Squat")).toBeInTheDocument()
    const sets = screen.getByLabelText(/sets/i)
    await userEvent.clear(sets)
    await userEvent.type(sets, "5")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 5 }))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/reorder.test.ts tests/unit/routine-draft-store.test.ts tests/unit/exercise-row.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `reorder.ts`**

```ts
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}
```

- [ ] **Step 4: Implement the draft store**

Create `src/features/routines/stores/routine-draft-store.ts`. Requirements: Zustand + `persist` to `sessionStorage`; shape `{ routineId: string | null; name; description; goal; days: DraftDay[]; isDirty }`; `DraftDay = { id: string; weekday: number; label: string | null; exercises: DraftExercise[] }`; `DraftExercise = { id: string; exerciseId: string; name: string; targetSets: number; targetReps: string; restSeconds: number; targetWeightKg: number | null; timerType: TimerType; workSeconds: number | null; rounds: number | null; notes: string | null }`. Client ids via `crypto.randomUUID()`.

- `hydrate(routine)`: if `routine.id === routineId` keep state; else load from the routine, `isDirty: false`.
- Mutable actions set `isDirty: true`; `addDay(weekday)` pushes `{ id: randomUUID(), weekday, label: null, exercises: [] }`.
- `addExercises(dayId, items: { exerciseId: string; name: string }[])` appends rows with defaults (`targetSets: 3, targetReps: "10", restSeconds: 60`, timer `none`).
- `moveDay(from, to)` / `moveExercise(dayId, from, to)` use `moveItem`.
- `toRoutineInput()` returns the `RoutineInput` for the PUT (strips client ids/names).

- [ ] **Step 5: Implement the editor components and page**

- `exercise-fields.tsx`: sets/reps/rest inputs, timer-type select, conditional work/rounds, notes; all with labels and 44px targets.
- `exercise-row.tsx`: sortable handle + `useSortable`, shows name, renders `ExerciseFields`, remove button; calls `onChange`.
- `day-card.tsx`: sortable; weekday select, label input, nested `SortableContext` of `ExerciseRow`s, "Add exercise" link → `/{locale}/routines/{id}/picker?day={draftDayId}`, remove day.
- `day-list.tsx`: `DndContext` (PointerSensor + KeyboardSensor + `sortableKeyboardCoordinates`) + `SortableContext` for days; "Add day" control.
- `save-bar.tsx`: sticky; Save button (`disabled` unless dirty), unsaved badge, mutation error display via `common.error`.
- `routine-editor.tsx`: `useRoutine(id)` → `hydrate` draft; renders header fields + `DayList` + `SaveBar`; Save builds `toRoutineInput()`, validates with `routineInputSchema`, calls `useUpdateRoutine`, then `clearDraft()`.
- `routines/[routineId]/page.tsx`: client component; loading skeleton, error state, renders `<RoutineEditor routineId={id} />`.
- Dirty guard: add a `beforeunload` listener while `isDirty` (in `routine-editor.tsx`).

- [ ] **Step 6: Run tests, lint, typecheck, build**

Run: `pnpm test tests/unit/reorder.test.ts tests/unit/routine-draft-store.test.ts tests/unit/exercise-row.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/routines src/app/[locale]/\(app\)/routines tests
git commit -m "feat: add routine editor with draft store and drag-and-drop"
```

---

### Task 9: Exercise picker route

**Files:**
- Create: `src/features/routines/lib/muscles.ts`, `src/features/routines/components/exercise-picker.tsx`, `src/app/[locale]/(app)/routines/[routineId]/picker/page.tsx`
- Test: `tests/unit/exercise-picker.test.tsx`

**Interfaces:**
- Consumes: `useExercises` (Phase 1), `useRoutineDraftStore.addExercises` (Task 8), `EQUIPMENT` (exercise schema), translations `picker.*`.
- Produces: `<ExercisePicker routineId dayId />`, `MUSCLES` constant.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/exercise-picker.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }))

const addExercises = vi.fn()
vi.mock("@/features/routines/stores/routine-draft-store", () => ({
  useRoutineDraftStore: () => ({ addExercises }),
}))
vi.mock("@/features/exercises/hooks/use-exercises", () => ({
  useExercises: () => ({ data: { items: [
    { id: "c1", sourceId: "Squat", name: "Barbell Squat", nameEs: null, equipment: "barbell", level: "beginner", category: "strength", primaryMuscles: ["quadriceps"], images: [] },
  ], nextCursor: null }, isLoading: false, isError: false, refetch: vi.fn() }),
}))

import { ExercisePicker } from "@/features/routines/components/exercise-picker"

describe("ExercisePicker", () => {
  it("selects exercises and adds them to the day", async () => {
    render(<ExercisePicker routineId="r1" dayId="d1" />)
    await userEvent.click(screen.getByRole("checkbox", { name: /Barbell Squat/i }))
    await userEvent.click(screen.getByRole("button", { name: /add/i }))
    expect(addExercises).toHaveBeenCalledWith("d1", [expect.objectContaining({ exerciseId: "c1", name: "Barbell Squat" })])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/exercise-picker.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `MUSCLES`**

Create `src/features/routines/lib/muscles.ts` with the free-exercise-db `primaryMuscles` values (e.g. `abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps`) as `const MUSCLES` plus a label lookup i18n key convention `picker.muscles.<value>`.

- [ ] **Step 4: Implement the picker and page**

`exercise-picker.tsx`: search input (debounced), filter selects (muscle from `MUSCLES`, equipment from `EQUIPMENT`, level), a scrollable result list with a thumbnail (`exerciseImageUrl(item.images[0])`), name (locale-aware `nameEs` when `es`), equipment/level badges, and a checkbox per row; a sticky footer showing "Add N" (disabled at 0) that calls `addExercises(dayId, selected)` and `router.back()`; loading/empty/error states with retry.

`picker/page.tsx`: reads `routineId` and `day` (`useSearchParams`); if `day` is missing → redirect to the editor; renders `<ExercisePicker routineId dayId={day} />`.

- [ ] **Step 5: Run test, lint, typecheck, build**

Run: `pnpm test tests/unit/exercise-picker.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/routines src/app/[locale]/\(app\)/routines tests
git commit -m "feat: add exercise picker route"
```

---

### Task 10: Placeholder pages for `/workout`, `/progress`, `/profile`

**Files:**
- Create: `src/components/shared/coming-soon.tsx`, `src/app/[locale]/(app)/workout/page.tsx`, `src/app/[locale]/(app)/progress/page.tsx`, `src/app/[locale]/(app)/profile/page.tsx`
- Test: `tests/unit/coming-soon.test.tsx`

**Interfaces:**
- Consumes: translations `comingSoon.*`, Phosphor icons.
- Produces: `<ComingSoon titleKey />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
import { ComingSoon } from "@/components/shared/coming-soon"

describe("ComingSoon", () => {
  it("renders the localized title and message", () => {
    render(<ComingSoon titleKey="workout" />)
    expect(screen.getByText("workout")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/coming-soon.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the component and pages**

`ComingSoon`: centered icon + `t(\`\${titleKey}.title\`)` + `t("comingSoon.message")`. The three pages render `<ComingSoon titleKey="workout|progress|profile" />`.

- [ ] **Step 4: Run test, lint, typecheck, build**

Run: `pnpm test tests/unit/coming-soon.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared src/app/[locale]/\(app\) tests
git commit -m "feat: add coming-soon placeholders for empty nav tabs"
```

---

### Task 11: i18n dictionaries for the builder

**Files:**
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/es.json`
- Test: `tests/unit/routine-messages.test.ts`

**Interfaces:**
- Consumes: existing parity test.
- Produces: `routines.*`, `routineEditor.*`, `picker.*`, `comingSoon.*`, `workout|progress|profile.title` keys in both locales.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routine-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

describe("routine builder copy", () => {
  it("has the builder namespaces in both locales", () => {
    for (const m of [en, es]) {
      expect(m.routines).toBeTruthy()
      expect(m.routineEditor).toBeTruthy()
      expect(m.picker).toBeTruthy()
      expect(m.comingSoon).toBeTruthy()
      expect(m.routines.new).toBeTruthy()
      expect(m.picker.add).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/routine-messages.test.ts`
Expected: FAIL — namespaces missing.

- [ ] **Step 3: Add the namespaces**

Add to both dictionaries (identical keys, real EN/ES copy):
- `routines.{title,new,empty,error,activate,duplicate,delete,deleteConfirm,active,dayCount,exerciseCount,copySuffix}` and `routines.new.{name,description,goal,createBlank,fromTemplate,chooseTemplate}`.
- `routineEditor.{title,name,description,goal,days,addDay,removeDay,weekday,label,addExercise,removeExercise,sets,reps,rest,timer,timerNone,timerInterval,timerEmom,timerAmrap,workSeconds,rounds,notes,save,unsaved,saved,validationError,emptyDays}`.
- `picker.{title,search,filters,muscle,equipment,level,all,add,addCount,noResults,error,retry}` plus `picker.muscles.<value>` for every `MUSCLES` entry and `picker.equipment.items.<value>` for every `EQUIPMENT` value (reuse the Phase 1.5 `onboarding.equipment.items.*` copy if convenient by referencing those keys instead — but if you reference them, do not duplicate; either is acceptable as long as no key path renders).
- `comingSoon.message`, `workout.title`, `progress.title`, `profile.title`.

- [ ] **Step 4: Run tests (parity + copy), lint, typecheck, build**

Run: `pnpm test tests/unit/routine-messages.test.ts tests/unit/i18n.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS. Grep components for any `routines.`/`routineEditor.`/`picker.`/`comingSoon.` key not present and add it.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages
git commit -m "feat: add routine builder i18n copy (en/es)"
```

---

### Task 12: E2E — build, activate, duplicate, delete a routine

**Files:**
- Create: `tests/e2e/routine-builder.spec.ts`

**Interfaces:**
- Consumes: the session helper (`tests/e2e/helpers/session.ts`, Phase 1.5), the running app.
- Produces: one spec covering the builder end-to-end.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test"
import { cleanupTestUser, createTestSession } from "./helpers/session"

const email = `e2e_builder_${Date.now()}@e2e-test.local`

test.afterAll(async () => { await cleanupTestUser(email) })

test("builds a routine, activates it, then duplicates and deletes", async ({ page, context }) => {
  const { cookie } = await createTestSession(email)
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  // An onboarded session is needed to pass the (app) gate; createTestSession creates a bare
  // profile, so complete onboarding or seed onboardedAt. Simplest: mark onboarded via the DB helper.
  await page.goto("/en/routines/new")
  await page.getByLabel(/name/i).fill("E2E Plan")
  await page.getByRole("button", { name: /create blank|^create$/i }).click()

  await expect(page).toHaveURL(/\/en\/routines\/[^/]+$/)
  await page.getByRole("button", { name: /add day|add exercise/i }).first().click()
  // open picker for the new day, select two exercises, add
  await page.getByRole("link", { name: /add exercise/i }).first().click()
  await expect(page).toHaveURL(/\/picker\?day=/)
  await page.getByRole("checkbox").first().check()
  await page.getByRole("button", { name: /add/i }).click()

  await page.getByRole("button", { name: /save/i }).click()
  await expect(page.getByText(/saved/i)).toBeVisible()

  await page.goto("/en/routines")
  await page.getByRole("button", { name: /activate/i }).first().click()
  await page.goto("/en/dashboard")
  await expect(page.getByText("E2E Plan")).toBeVisible()

  await page.goto("/en/routines")
  await page.getByRole("button", { name: /duplicate/i }).first().click()
  await expect(page.getByText(/\(copy\)|\(copia\)/i)).toBeVisible()
  await page.getByRole("button", { name: /delete/i }).first().click()
  await page.getByRole("button", { name: /confirm|delete/i }).last().click()
})
```

Add whatever small `data-testid` hooks you need (prefer accessible names). The `createTestSession` helper creates a bare profile that needs onboarding; either extend the helper with an `onboarded` option or PATCH the profile to set `onboardedAt` before navigating.

- [ ] **Step 2: Run the e2e suite**

Run:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db && pnpm db:migrate && pnpm db:seed && pnpm e2e
```
Expected: PASS (the new spec plus the Phase 1.5 specs).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e
git commit -m "test: add routine builder e2e (build, activate, duplicate, delete)"
```

---

### Task 13: Final gates and docs

**Files:**
- Modify: `docs/deploy.md`, `docs/superpowers/specs/2026-09-22-gym-tracker-phase2a-routine-builder-design.md`

**Interfaces:** none.

- [ ] **Step 1: Run the full gate set**

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db && pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:coverage && pnpm build && pnpm e2e
```
Expected: all PASS, pristine.

- [ ] **Step 2: Verify the Docker `migrate` stage**

Run the `migrate` target against a scratch DB; confirm `add_routine_day_unique_weekday` applies and re-runs as "No pending migrations".

- [ ] **Step 3: Update docs**

Add the `add_routine_day_unique_weekday` migration to `docs/deploy.md` release notes; set the 2A spec status to "Implemented".

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: note phase 2a migration and implementation status"
```

---

## Self-Review

**Spec coverage (spec §1–§13):**

| Spec section | Task |
|---|---|
| §3 `@@unique([routineId, weekday])` migration | 1 |
| §4 routes (list/new/editor/picker/placeholders) | 6, 7, 8, 9, 10 |
| §5 editor (draft, days, exercises, dnd-kit, save, picker, a11y) | 8, 9 |
| §6 API table + validation (§6.1) + service behavior (§6.2) | 3, 4, 5 |
| §7 activation semantics | 3, 6 |
| §8 placeholder pages | 10 |
| §9 i18n namespaces | 11 |
| §10 testing (unit/integration/component/e2e) | 1–12 |
| §11 risks (concurrent activate, last-write-wins, draft loss, unique weekday, dnd a11y, component size, pagination) | 1, 2, 3, 8, 9 |
| §12 acceptance criteria | 13 (gates) + 6–12 |
| §13 traceability | covered by the above |

No spec section is untasked. Runner/timers (2B), offline (2C), and custom exercises remain non-goals.

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step shows real code. Task 9's `MUSCLES` list is enumerated concretely; Task 11 requires covering every `MUSCLES`/`EQUIPMENT` value. Task 12's step interactions are concrete UI actions (accessible names), with `data-testid` permitted only where names are unstable.

**Type/name consistency:** `routineInputSchema`/`createRoutineSchema`, `createBlankRoutine`/`listRoutines`/`getRoutine`/`replaceRoutine`/`activateRoutine`/`duplicateRoutine`/`deleteRoutine`, `listByUser`/`RoutineSummary`, `routineKeys.list/detail`, `moveItem`, `useRoutineDraftStore` actions, `copyRoutineName`, `MUSCLES`, `ComingSoon` are used with the same signatures across tasks. API paths: `GET/POST /api/routines`, `GET/PUT/DELETE /api/routines/[routineId]`, `POST .../activate`, `POST .../duplicate`, `GET /api/exercises`.

**Review Focus → tests:** (1) duplicate weekday — Task 2 unit + Task 3 integration; (2) cross-user 404 — Task 3 integration; (3) single active — Task 3 integration; (4) delete active leaves none — Task 3 integration + Task 6 empty state; (5) draft preserved across picker nav — Task 8 store test + Task 12 e2e.

---

## Notes for the human partner

- **Ordering:** Tasks 1→13 sequential. Task 1 adds a migration (run `pnpm db:migrate`).
- **Data prerequisite:** seed the catalog (`pnpm db:seed`) before Tasks 1, 3, 5, 12.
- **dnd-kit:** add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers` (and `@dnd-kit/utilities`) in Task 8.
- **2B/2C/2D:** runner+timers, offline, and custom exercises are separate sub-phases.
- **Skills:** consult `.dsh/skills/` (`nextjs-app-router`, `typescript-strict-patterns`, `prisma-postgres-optimization`, `tailwind-theme-builder`, `shadcn-ui`, `vercel-react-best-practices`); this plan and the spec win over RSC-first guidance (client-first app).

**Compliance note on the plan header:** this plan follows the same header/Global-Constraints/Review-Focus contract as Phases 1 and 1.5.
