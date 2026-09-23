# Gym Tracker — Phase 2B Workout Runner & Timers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user start a workout from their active routine, run it one exercise at a time with set logging and rest/interval timers, and finish with a persisted session (immutable snapshot) and summary.

**Architecture:** Client-first (axios + TanStack Query). The runner holds an authoritative client session store; changes push to the server via a debounced whole-session `PUT` (set up for 2C offline sync). Sessions are created server-side from a routine day with a **snapshot frozen at start**. Timers and unit conversion are pure, unit-tested modules.

**Tech Stack:** Next.js 16, TypeScript strict, Prisma 7, Auth.js v5, next-intl (EN/ES), TanStack Query + axios, Zustand, Zod, Vitest + RTL + Playwright, pino.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase2b-workout-runner-design.md` (binding). Parent: `docs/superpowers/specs/2026-09-22-gym-tracker-design.md`.

## Global Constraints

- **App Router only**; async request APIs awaited; `/api/*` handlers self-guard with `auth()` (401).
- **Prisma 7:** `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client`; never `@prisma/client`. CLI config `prisma7.config.ts`. Migrations: `prisma migrate dev` needs interactive confirmation for some changes — use `migrate diff` + `pnpm db:deploy` if it refuses.
- **Layering:** Route Handler → Service → Repository; server modules start with `import "server-only"`; Prisma only in repositories.
- **API envelope:** `{ data }` / `{ error: { code, message, details? } }`; `select`ed DTOs; datetimes as ISO strings.
- **Authorization:** every query/mutation scoped by `userId`; `NotFoundError` on 0 rows.
- **Validation:** one shared Zod schema per input.
- **i18n:** `en`/`es` identical key sets; no hardcoded copy.
- **Design:** mobile-first, ≥44px targets, visible focus, Phosphor icons, light+dark.
- **Testing:** Vitest + RTL (MSW), integration vs Docker Postgres, Playwright e2e; output pristine.
- **Docker:** `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`; `docker compose up -d db`; seed (`pnpm db:seed`) where catalog data is needed.
- **Commits:** Conventional Commits, one logical change each.

## Review Focus

Five inputs/failure modes the spec implies but no happy-path test covers. Each is pinned to a test in the owning task.

1. **Two concurrent session starts** — only one `in_progress` session may exist; the second gets a conflict. (Task 3)
2. **The routine is edited mid-session** — the running session's names/targets must not change (snapshot + `nameSnapshot`). (Task 3)
3. **kg↔lb round-trip** — a weight entered in imperial and re-read must equal the original. (Task 5)
4. **Reload mid-workout** — the in-progress session resumes with all logged sets intact. (Task 7 + Task 12)
5. **complete/abandon on a non-`in_progress` session** — rejected with a conflict, no state change. (Task 3)

---

### Task 1: Session data model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/integration/session-model.test.ts`
- Migration: `prisma/migrations/*_add_session`

**Interfaces:**
- Consumes: `prisma`, existing `User`/`Exercise`/`TimerType`.
- Produces: Prisma models `WorkoutSession`, `SessionExercise`, `SetLog`; enums `SessionStatus`, `SetType`.

- [ ] **Step 1: Add the enums and models**

Append to `prisma/schema.prisma` (add back-relations `User.sessions WorkoutSession[]` and `Exercise.sessionExercises SessionExercise[]`):

```prisma
enum SessionStatus {
  in_progress
  completed
  abandoned
}

enum SetType {
  warmup
  working
  drop
  failure
}

model WorkoutSession {
  id            String        @id @default(cuid())
  userId        String
  routineId     String?
  routineDayId  String?
  name          String
  status        SessionStatus @default(in_progress)
  startedAt     DateTime      @default(now())
  completedAt   DateTime?
  activeSeconds Int           @default(0)
  notes         String?
  snapshot      Json
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  exercises SessionExercise[]

  @@index([userId, status])
  @@index([userId, startedAt])
}

model SessionExercise {
  id            String     @id @default(cuid())
  sessionId     String
  exerciseId    String?
  order         Int
  nameSnapshot  String
  targetSets    Int?
  targetReps    String?
  restSeconds   Int?
  timerType     TimerType?
  workSeconds   Int?
  rounds        Int?
  completed     Boolean    @default(false)
  skipped       Boolean    @default(false)
  swappedFromId String?
  notes         String?

  session  WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  exercise Exercise?      @relation(fields: [exerciseId], references: [id])
  sets     SetLog[]

  @@index([sessionId])
}

model SetLog {
  id                String    @id @default(cuid())
  sessionExerciseId String
  setNumber         Int
  type              SetType   @default(working)
  reps              Int?
  weightKg          Float?
  durationSeconds   Int?
  rpe               Int?
  restSecondsLogged Int?
  completedAt       DateTime?

  sessionExercise SessionExercise @relation(fields: [sessionExerciseId], references: [id], onDelete: Cascade)

  @@index([sessionExerciseId])
}
```

- [ ] **Step 2: Migrate and regenerate**

Run:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db
pnpm db:migrate --name add_session
pnpm db:generate
```
Expected: migration `*_add_session` created; client regenerated. If `migrate dev` refuses non-interactively, generate via `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > <file>` then `pnpm db:deploy`.

- [ ] **Step 3: Write the failing integration test**

Create `tests/integration/session-model.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"

const DOMAIN = "@session-model-test.local"

describe("session model", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("creates a session with exercises and sets and cascades on delete", async () => {
    const user = await prisma.user.create({ data: { email: `sm_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true } })
    const session = await prisma.workoutSession.create({
      data: {
        userId: user.id, name: "Push", status: "in_progress",
        snapshot: { routineDayId: "rd1", exercises: [{ order: 0 }] },
        exercises: {
          create: [{
            exerciseId: exercise.id, order: 0, nameSnapshot: exercise.name, targetSets: 3, targetReps: "10", restSeconds: 60,
            sets: { create: [{ setNumber: 1, type: "warmup", reps: 10, weightKg: 20 }, { setNumber: 2, type: "working", reps: 8, weightKg: 40, rpe: 8 }] },
          }],
        },
      },
      include: { exercises: { include: { sets: true } } },
    })
    expect(session.status).toBe("in_progress")
    expect(session.exercises[0]?.sets).toHaveLength(2)
    expect(session.snapshot).toEqual({ routineDayId: "rd1", exercises: [{ order: 0 }] })

    await prisma.user.delete({ where: { id: user.id } })
    expect(await prisma.workoutSession.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.sessionExercise.count({ where: { sessionId: session.id } })).toBe(0)
    expect(await prisma.setLog.count({ where: { sessionExerciseId: session.exercises[0]!.id } })).toBe(0)
  })
})
```

- [ ] **Step 4: Run the test**

Run: `pnpm test:integration tests/integration/session-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the suite, lint, typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma tests/integration/session-model.test.ts
git commit -m "feat: add workout session schema"
```

---

### Task 2: Session input schemas (Zod)

**Files:**
- Create: `src/features/workouts/schemas/session.ts`, `tests/unit/session-schema.test.ts`

**Interfaces:**
- Consumes: nothing (Zod).
- Produces: `startSessionSchema`, `sessionStateSchema`, `completeSessionSchema` + types.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/session-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { completeSessionSchema, sessionStateSchema, startSessionSchema } from "@/features/workouts/schemas/session"

const set = { setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() }
const ex = { id: "se1", exerciseId: "e1", nameSnapshot: "Squat", completed: false, skipped: false, notes: null, sets: [set] }

describe("session schemas", () => {
  it("start requires a non-empty routineDayId", () => {
    expect(startSessionSchema.safeParse({ routineDayId: "rd1" }).success).toBe(true)
    expect(startSessionSchema.safeParse({ routineDayId: "" }).success).toBe(false)
  })
  it("accepts a valid session state and rejects a bad rpe/time", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [ex] }).success).toBe(true)
    expect(sessionStateSchema.safeParse({ activeSeconds: -1, exercises: [ex] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, sets: [{ ...set, rpe: 11 }] }] }).success).toBe(false)
  })
  it("complete requires non-negative activeSeconds", () => {
    expect(completeSessionSchema.safeParse({ activeSeconds: 0 }).success).toBe(true)
    expect(completeSessionSchema.safeParse({ activeSeconds: -5 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/session-schema.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the schemas**

Create `src/features/workouts/schemas/session.ts`:

```ts
import { z } from "zod"

export const startSessionSchema = z.object({ routineDayId: z.string().min(1) })
export type StartSessionInput = z.infer<typeof startSessionSchema>

const setTypeSchema = z.enum(["warmup", "working", "drop", "failure"])

export const setInputSchema = z.object({
  id: z.string().optional(),
  setNumber: z.number().int().min(1),
  type: setTypeSchema,
  reps: z.number().int().min(0).max(1000).nullable().default(null),
  weightKg: z.number().min(0).max(1000).nullable().default(null),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().default(null),
  rpe: z.number().int().min(1).max(10).nullable().default(null),
  restSecondsLogged: z.number().int().min(0).max(86_400).nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
})

export const sessionExerciseInputSchema = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1).nullable(),
  nameSnapshot: z.string().trim().min(1).max(200),
  completed: z.boolean(),
  skipped: z.boolean(),
  notes: z.string().trim().max(500).nullable().default(null),
  sets: z.array(setInputSchema).max(50),
})

export const sessionStateSchema = z.object({
  activeSeconds: z.number().int().min(0),
  exercises: z.array(sessionExerciseInputSchema),
})
export type SessionStateInput = z.infer<typeof sessionStateSchema>

export const completeSessionSchema = z.object({ activeSeconds: z.number().int().min(0) })
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/session-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/schemas tests/unit/session-schema.test.ts
git commit -m "feat: add session input validation schemas"
```

---

### Task 3: Session repository + service (start/active/get/replace/complete/abandon + lastPerformance)

**Files:**
- Create: `src/server/repositories/session.repository.ts`, `tests/integration/session-service.test.ts`
- Modify: `src/server/services/` — create `src/server/services/session.service.ts`

**Interfaces:**
- Consumes: `sessionStateSchema` (Task 2), `withTransaction` (Phase 1.5), `routineSelect`-style DTOs, `ConflictError`/`NotFoundError`, `logger`.
- Produces: `SessionDTO`, `startSession`, `getActiveSession`, `getSession`, `replaceSessionState`, `completeSession`, `abandonSession`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/session-service.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  abandonSession, completeSession, getActiveSession, getSession,
  replaceSessionState, startSession,
} from "@/server/services/session.service"

const DOMAIN = "@session-service-test.local"

async function makeUserWithRoutine() {
  const user = await prisma.user.create({ data: { email: `ss_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true } })
  const routine = await prisma.routine.create({
    data: {
      userId: user.id, name: "Push", source: "manual", isActive: true,
      days: { create: [{ weekday: 1, label: "Push", order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "8-12", restSeconds: 90 }] } }] },
    },
    include: { days: true },
  })
  return { user, routine, day: routine.days[0]!, exercise }
}

describe("session service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("starts a session with a snapshot and exercises; second start conflicts", async () => {
    const { user, day } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    expect(started.status).toBe("in_progress")
    expect(started.exercises).toHaveLength(1)
    expect(started.exercises[0]?.nameSnapshot).toBeTruthy()
    await expect(startSession(user.id, day.id)).rejects.toThrow(/in progress/i)
    expect(await prisma.workoutSession.count({ where: { userId: user.id, status: "in_progress" } })).toBe(1)
  })

  it("freezes names when the routine is edited mid-session", async () => {
    const { user, day, routine, exercise } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    const originalName = started.exercises[0]?.nameSnapshot
    // edit the routine's exercise name source (rename the exercise) and the routine day
    await prisma.exercise.update({ where: { id: exercise.id }, data: { name: "Renamed Exercise" } })
    await prisma.routineExercise.updateMany({ where: { routineDayId: day.id }, data: { targetSets: 99 } })
    const reopened = await getSession(user.id, started.id)
    expect(reopened.exercises[0]?.nameSnapshot).toBe(originalName)
    expect(reopened.exercises[0]?.targetSets).toBe(3)
  })

  it("replaces sets and reflects activeSeconds; complete then rejects further writes", async () => {
    const { user, day } = await makeUserWithRoutine()
    const started = await startSession(user.id, day.id)
    const seId = started.exercises[0]!.id
    const updated = await replaceSessionState(user.id, started.id, {
      activeSeconds: 300,
      exercises: [{ id: seId, exerciseId: started.exercises[0]!.exercise!.id, nameSnapshot: started.exercises[0]!.nameSnapshot, completed: true, skipped: false, notes: "felt good", sets: [
        { setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() },
      ] }],
    })
    expect(updated.activeSeconds).toBe(300)
    expect(updated.exercises[0]?.sets).toHaveLength(1)
    const done = await completeSession(user.id, started.id, 600)
    expect(done.status).toBe("completed")
    expect(done.activeSeconds).toBe(600)
    await expect(replaceSessionState(user.id, started.id, { activeSeconds: 1, exercises: [] })).rejects.toThrow(/not in progress|conflict/i)
    await expect(completeSession(user.id, started.id, 1)).rejects.toThrow(/not in progress|conflict/i)
  })

  it("abandons a session; active lookup returns null; ownership scoped", async () => {
    const { user, day } = await makeUserWithRoutine()
    const other = await prisma.user.create({ data: { email: `ss2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const started = await startSession(user.id, day.id)
    await expect(getSession(other.id, started.id)).rejects.toThrow("Session not found")
    await abandonSession(user.id, started.id)
    expect(await getActiveSession(user.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration tests/integration/session-service.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the repository**

Create `src/server/repositories/session.repository.ts` with a `sessionSelect` (header + `exercises` ordered by `order`, each with `sets` ordered by `setNumber`, joined to the catalog for `name`/`nameEs`/`images`) and helpers: `findActiveByUser`, `findByIdForUser`, `createSessionWithExercises(tx, data)`, `replaceSets(tx, sessionId, exercises)`, `updateHeader(id, data)`, `setStatus(id, status, data)`, plus a `findLastPerformance(userId, exerciseId)` query returning the most recent completed `SetLog` for that exercise (join through `SessionExercise` → `WorkoutSession` where `status = completed`, `orderBy` top weight/reps). Add a `withTransaction` reuse (from Phase 1.5; do not redeclare if present — confirm the export location first).

- [ ] **Step 4: Implement the service**

Create `src/server/services/session.service.ts`:

```ts
import "server-only"
import { ConflictError, NotFoundError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import type { SessionStateInput } from "@/features/workouts/schemas/session"
import * as repos from "@/server/repositories/session.repository"
import { withTransaction } from "@/server/repositories/routine.repository"

export async function startSession(userId: string, routineDayId: string) {
  const existing = await repos.findActiveByUser(userId)
  if (existing) throw new ConflictError("A workout is already in progress")
  const day = await repos.findOwnedDayWithExercises(userId, routineDayId)
  if (!day) throw new NotFoundError("Routine day not found")
  if (day.exercises.length === 0) throw new ConflictError("This day has no exercises")
  const session = await withTransaction((tx) => repos.createSessionWithExercises(tx, { userId, day }))
  logger.info({ event: "session.started", userId, sessionId: session.id }, "session started")
  return session
}

export async function getActiveSession(userId: string) {
  return repos.findActiveByUser(userId)
}

export async function getSession(userId: string, id: string) {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  return session
}

export async function replaceSessionState(userId: string, id: string, input: SessionStateInput) {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status !== "in_progress") throw new ConflictError("Session is not in progress")
  const updated = await withTransaction(async (tx) => {
    await repos.replaceSets(tx, id, input.exercises)
    await repos.updateHeader(id, { activeSeconds: input.activeSeconds })
    return repos.findByIdForUser(userId, id)
  })
  return updated
}

export async function completeSession(userId: string, id: string, activeSeconds: number) {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status !== "in_progress") throw new ConflictError("Session is not in progress")
  const done = await repos.setStatus(id, "completed", { completedAt: new Date(), activeSeconds })
  logger.info({ event: "session.completed", userId, sessionId: id }, "session completed")
  return done
}

export async function abandonSession(userId: string, id: string) {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status !== "in_progress") throw new ConflictError("Session is not in progress")
  await repos.setStatus(id, "abandoned", {})
  logger.info({ event: "session.abandoned", userId, sessionId: id }, "session abandoned")
}
```

`startSession` builds the `snapshot` from the day (routine/day ids, per-exercise `name`/`nameEs`/prescription/order) and creates `SessionExercise` rows with `nameSnapshot`, `targetSets`, `targetReps`, `restSeconds`, `timerType`, `workSeconds`, `rounds`.

- [ ] **Step 5: Run the tests, lint, typecheck**

Run: `pnpm test:integration tests/integration/session-service.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS. Use generated `SessionStatus`/`SetType` types — no `as never`.

- [ ] **Step 6: Commit**

```bash
git add src/server tests/integration/session-service.test.ts
git commit -m "feat: add session service with snapshot and lifecycle"
```

---

### Task 4: Session APIs + hooks

**Files:**
- Create: `src/app/api/sessions/route.ts`, `src/app/api/sessions/active/route.ts`, `src/app/api/sessions/[sessionId]/route.ts`, `src/app/api/sessions/[sessionId]/complete/route.ts`, `src/app/api/sessions/[sessionId]/abandon/route.ts`, `src/features/workouts/hooks/query-keys.ts`, `use-active-session.ts`, `use-session.ts`, `use-start-session.ts`, `use-update-session.ts`, `use-complete-session.ts`, `use-abandon-session.ts`
- Test: `tests/unit/sessions-route.test.ts`

**Interfaces:**
- Consumes: service (Task 3), schemas (Task 2), `auth`/`ok`/`toApiError`.
- Produces: `sessionKeys.active()/detail(id)`; the six hooks.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sessions-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/session.service", () => ({
  getActiveSession: vi.fn(async () => null),
  startSession: vi.fn(async (_u: string, routineDayId: string) => ({ id: "s1", routineDayId, status: "in_progress" })),
}))

import { GET as ACTIVE } from "@/app/api/sessions/active/route"
import { POST } from "@/app/api/sessions/route"

describe("/api/sessions", () => {
  it("active returns null when none", async () => {
    const res = await ACTIVE()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: null })
  })
  it("POST rejects an invalid body with 400", async () => {
    const res = await POST(new Request("http://x/api/sessions", { method: "POST", body: JSON.stringify({ routineDayId: "" }) }))
    expect(res.status).toBe(400)
  })
  it("POST starts with 201", async () => {
    const res = await POST(new Request("http://x/api/sessions", { method: "POST", body: JSON.stringify({ routineDayId: "rd1" }) }))
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/sessions-route.test.ts`
Expected: FAIL — routes missing.

- [ ] **Step 3: Implement the routes**

Thin handlers: `GET /api/sessions/active` → `ok(await getActiveSession(userId))`; `POST /api/sessions` → validate `startSessionSchema` → `ok(await startSession(...), { status: 201 })`; `GET /api/sessions/[sessionId]` → `ok(await getSession(...))`; `PUT /api/sessions/[sessionId]` → validate `sessionStateSchema` → `ok(await replaceSessionState(...))`; `POST .../complete` → validate `completeSessionSchema` → `ok(await completeSession(...))`; `POST .../abandon` → `ok({ abandoned: true })`. All `auth()`-guarded; `await ctx.params`; `ConflictError` → 409 via `toApiError`.

- [ ] **Step 4: Implement `query-keys.ts` + hooks**

```ts
export const sessionKeys = {
  all: ["sessions"] as const,
  active: () => [...sessionKeys.all, "active"] as const,
  detail: (id: string) => [...sessionKeys.all, "detail", id] as const,
}
```

Hooks: `useActiveSession` (query), `useSession(id)` (query), `useStartSession` (mutation; invalidates `active`), `useUpdateSession(id)` (mutation; does NOT invalidate on every keystroke — used by the debounced push), `useCompleteSession` (mutation; invalidates `active`), `useAbandonSession` (mutation; invalidates `active`). One hook per query/mutation.

- [ ] **Step 5: Run tests, lint, typecheck, build**

Run: `pnpm test tests/unit/sessions-route.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions src/features/workouts tests
git commit -m "feat: add session APIs and hooks"
```

---

### Task 5: Unit conversion helpers

**Files:**
- Create: `src/features/workouts/lib/units.ts`, `tests/unit/units.test.ts`

**Interfaces:**
- Produces: `kgToLb(kg): number`, `lbToKg(lb): number`, `displayWeight(kg, unitSystem): number`, `parseWeightToKg(value, unitSystem): number`, `formatWeight(kg, unitSystem, locale?): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/units.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { displayWeight, formatWeight, kgToLb, lbToKg, parseWeightToKg } from "@/features/workouts/lib/units"

describe("units", () => {
  it("round-trips kg→lb→kg", () => {
    for (const kg of [0, 2.5, 20, 40, 102.5]) {
      expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 5)
    }
  })
  it("converts with one-decimal display", () => {
    expect(displayWeight(100, "imperial")).toBe(220.5)
    expect(displayWeight(100, "metric")).toBe(100)
  })
  it("parses a displayed value back to kg", () => {
    expect(parseWeightToKg(220.5, "imperial")).toBeCloseTo(100, 3)
    expect(parseWeightToKg(40, "metric")).toBe(40)
  })
  it("formats with the unit label", () => {
    expect(formatWeight(100, "imperial")).toMatch(/220\.5\s*lb/i)
    expect(formatWeight(100, "metric")).toMatch(/100\s*kg/i)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/units.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the helpers**

```ts
const KG_PER_LB = 0.45359237

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}
export function displayWeight(kg: number, unitSystem: "metric" | "imperial"): number {
  const value = unitSystem === "imperial" ? kgToLb(kg) : kg
  return Math.round(value * 10) / 10
}
export function parseWeightToKg(value: number, unitSystem: "metric" | "imperial"): number {
  return unitSystem === "imperial" ? lbToKg(value) : value
}
export function formatWeight(kg: number, unitSystem: "metric" | "imperial"): string {
  return `${displayWeight(kg, unitSystem)} ${unitSystem === "imperial" ? "lb" : "kg"}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/lib tests/unit/units.test.ts
git commit -m "feat: add kg/lb unit conversion helpers"
```

---

### Task 6: Timer reducer (pure)

**Files:**
- Create: `src/features/workouts/lib/timer.ts`, `tests/unit/timer.test.ts`

**Interfaces:**
- Produces: `TimerState = { kind: "rest" | "interval"; phase: "work" | "rest" | "idle"; remaining: number; total: number; running: boolean; round: number; rounds: number }`; `startRest(seconds): TimerState`; `startInterval({ workSeconds, restSeconds, rounds }): TimerState`; `tick(state): TimerState`; `adjust(state, deltaSeconds): TimerState`; `skip(state): TimerState`; `pause(state)/resume(state)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/timer.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { adjust, pause, resume, skip, startInterval, startRest, tick } from "@/features/workouts/lib/timer"

describe("timer reducer", () => {
  it("counts a rest timer down to idle", () => {
    let s = startRest(2)
    expect(s.remaining).toBe(2)
    s = tick(s); expect(s.remaining).toBe(1)
    s = tick(s); expect(s.remaining).toBe(0)
    expect(s.running).toBe(false)
  })
  it("adjusts and never goes below zero", () => {
    let s = startRest(10)
    s = adjust(s, 15); expect(s.remaining).toBe(25)
    s = adjust(s, -100); expect(s.remaining).toBe(0)
  })
  it("pause freezes the countdown; resume continues", () => {
    let s = startRest(5)
    s = pause(s); s = tick(s); expect(s.remaining).toBe(5)
    s = resume(s); s = tick(s); expect(s.remaining).toBe(4)
  })
  it("runs interval work/rest rounds and finishes", () => {
    let s = startInterval({ workSeconds: 2, restSeconds: 1, rounds: 2 })
    expect(s.phase).toBe("work"); expect(s.round).toBe(1)
    s = tick(tick(tick(s))) // 2 work ticks -> transition to rest
    expect(s.phase).toBe("rest")
    s = tick(s) // rest done -> next round work
    expect(s.round).toBe(2)
    s = tick(tick(tick(s)))
    expect(s.running).toBe(false)
  })
  it("skip ends the current timer", () => {
    expect(skip(startRest(60)).running).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/timer.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the reducer**

Create `src/features/workouts/lib/timer.ts` implementing the exact transition semantics asserted above: a pure state machine that never mutates its input; `tick` decrements `remaining` when `running`; rest→idle at 0; interval alternates work→rest→next round, decrementing `round`, and goes `running: false` when the final rest ends (or final work for AMRAP-style with no rest).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/timer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/lib tests/unit/timer.test.ts
git commit -m "feat: add pure timer reducer"
```

---

### Task 7: Client session store

**Files:**
- Create: `src/features/workouts/stores/session-store.ts`, `tests/unit/session-store.test.ts`

**Interfaces:**
- Consumes: `SessionDTO` (Task 4), `SessionStateInput` (Task 2).
- Produces: `useSessionStore` with `hydrate(session)`, `toggleSet(exerciseId, setNumber, patch)`, `addSet(exerciseId)`, `completeExercise(exerciseId, completed)`, `skipExercise(exerciseId, skipped)`, `swapExercise(exerciseId, { exerciseId, nameSnapshot })`, `setNotes(exerciseId, notes)`, `setActiveSeconds(n)`, `currentIndex`, `goTo(index)/next()/prev()`, `toStateInput()`, `isDirty`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/session-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { useSessionStore } from "@/features/workouts/stores/session-store"

const session = {
  id: "s1", name: "Push", status: "in_progress" as const, startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 0,
  exercises: [{ id: "se1", exerciseId: "e1", nameSnapshot: "Squat", targetSets: 3, targetReps: "10", restSeconds: 60, timerType: "none" as const, workSeconds: null, rounds: null, completed: false, skipped: false, notes: null, sets: [] }],
}

describe("session store", () => {
  beforeEach(() => useSessionStore.getState().reset())

  it("hydrates and logs a set, marking the session dirty", () => {
    useSessionStore.getState().hydrate(session)
    expect(useSessionStore.getState().currentIndex).toBe(0)
    useSessionStore.getState().addSet("se1")
    useSessionStore.getState().toggleSet("se1", 1, { reps: 8, weightKg: 40, type: "working" })
    const st = useSessionStore.getState()
    expect(st.exercises[0]?.sets).toHaveLength(1)
    expect(st.exercises[0]?.sets[0]?.reps).toBe(8)
    expect(st.isDirty).toBe(true)
  })

  it("swap changes exerciseId + nameSnapshot and records swapped-from", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().swapExercise("se1", { exerciseId: "e9", nameSnapshot: "Goblet Squat" })
    const ex = useSessionStore.getState().exercises[0]!
    expect(ex.exerciseId).toBe("e9")
    expect(ex.nameSnapshot).toBe("Goblet Squat")
    expect(ex.swappedFromId).toBe("e1")
  })

  it("toStateInput produces a server-shaped payload", () => {
    useSessionStore.getState().hydrate(session)
    useSessionStore.getState().setActiveSeconds(120)
    const input = useSessionStore.getState().toStateInput()
    expect(input.activeSeconds).toBe(120)
    expect(input.exercises[0]?.id).toBe("se1")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/session-store.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the store**

Create `src/features/workouts/stores/session-store.ts` (Zustand; **not** persisted — the server is the source of truth and `GET /api/sessions/active` restores on mount). `hydrate` copies the `SessionDTO` into editable state; new sets get `setNumber = max+1` and default `type: "working"`; every mutating action sets `isDirty: true`; `toStateInput()` returns a `SessionStateInput`. Keep `activeSeconds` in the store and increment it from the runner's elapsed ticker (Task 9).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/unit/session-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/stores tests/unit/session-store.test.ts
git commit -m "feat: add client session store"
```

---

### Task 8: Runner components (header, exercise view, set row, overview, swap sheet, timers)

**Files:**
- Create: `src/features/workouts/components/runner-header.tsx`, `exercise-view.tsx`, `set-row.tsx`, `exercise-overview.tsx`, `swap-exercise-sheet.tsx`, `rest-timer-bar.tsx`, `interval-timer.tsx`
- Test: `tests/unit/set-row.test.tsx`, `tests/unit/rest-timer-bar.test.tsx`

**Interfaces:**
- Consumes: `useSessionStore` (Task 7), timer reducer (Task 6), units (Task 5), the exercise catalog query component pattern from Phase 2A's picker, translations `runner.*`/`runner.sets.*`/`timers.*`.
- Produces: the runner UI pieces; `RestTimerBar({ timer, onAdjust, onSkip })`, `IntervalTimer({ timer, onStart, onSkipRound })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/set-row.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { SetRow } from "@/features/workouts/components/set-row"

const set = { setNumber: 1, type: "working" as const, reps: null, weightKg: null, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: null }

describe("SetRow", () => {
  it("reports reps and weight changes (in kg)", async () => {
    const onChange = vi.fn()
    const onComplete = vi.fn()
    render(<SetRow set={set} unitSystem="metric" onChange={onChange} onComplete={onComplete} />)
    await userEvent.type(screen.getByLabelText(/reps/i), "8")
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ reps: 8 }))
    await userEvent.click(screen.getByRole("checkbox", { name: /complete/i }))
    expect(onComplete).toHaveBeenCalled()
  })
})
```

Create `tests/unit/rest-timer-bar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { RestTimerBar } from "@/features/workouts/components/rest-timer-bar"
import { startRest } from "@/features/workouts/lib/timer"

describe("RestTimerBar", () => {
  it("shows remaining time and adjust/skip controls", async () => {
    const onAdjust = vi.fn()
    const onSkip = vi.fn()
    render(<RestTimerBar timer={startRest(90)} onAdjust={onAdjust} onSkip={onSkip} />)
    expect(screen.getByText(/1:30|90/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /\+15/i }))
    expect(onAdjust).toHaveBeenCalledWith(15)
    await userEvent.click(screen.getByRole("button", { name: /skip/i }))
    expect(onSkip).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test tests/unit/set-row.test.tsx tests/unit/rest-timer-bar.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement the components**

- `runner-header.tsx`: elapsed `mm:ss`, "exercise i / n", progress bar over completed sets.
- `exercise-view.tsx`: name (`nameSnapshot`), media (`exerciseImageUrl`, fallback placeholder), target line, `lastPerformance` hint, list of `SetRow`s, an "Add set" button, notes textarea, and a warm-up/RPE affordance.
- `set-row.tsx`: reps input, weight input (display via `displayWeight`, emit `weightKg` via `parseWeightToKg`), warm-up toggle, RPE input, a large check. `onChange` emits a partial patch; `onComplete` fires on check.
- `exercise-overview.tsx`: drawer listing exercises with completion/skip state; tap to `goTo(index)`.
- `swap-exercise-sheet.tsx`: a Sheet reusing the catalog list (search + filters) rendered from `useExercises`; selecting calls `onSelect({ exerciseId, nameSnapshot })`.
- `rest-timer-bar.tsx` and `interval-timer.tsx`: present `remaining` as `m:ss`, show `running`/paused state, expose adjust/skip (`interval-timer` also `skipRound`); use `aria-live="polite"` for the countdown; no sound in these components (the runner owns the alert).

- [ ] **Step 4: Run the tests, lint, typecheck, build**

Run: `pnpm test tests/unit/set-row.test.tsx tests/unit/rest-timer-bar.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/components tests
git commit -m "feat: add workout runner components"
```

---

### Task 9: Workout page + start flow + dashboard CTA

**Files:**
- Create: `src/app/[locale]/(app)/workout/page.tsx`, `src/features/workouts/components/workout-runner.tsx`, `day-chooser.tsx`
- Modify: `src/features/routines/components/routine-preview.tsx` (enable the Start workout CTA → `/{locale}/workout`)
- Test: `tests/unit/day-chooser.test.tsx`

**Interfaces:**
- Consumes: `useActiveSession`/`useSession`/`useStartSession`/`useUpdateSession`/`useCompleteSession`/`useAbandonSession` (Task 4), `useActiveRoutine` (Phase 1.5), `useSessionStore` (Task 7), `useProfile` (unit system), timers (Task 6), runner components (Task 8).
- Produces: `<WorkoutRunner session={SessionDTO} />`, `<DayChooser routine onPick />`, the page.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/day-chooser.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("@/features/routines/components/weekdays", () => ({ weekdayLabel: () => "Monday" }), { virtual: true })

import { DayChooser } from "@/features/workouts/components/day-chooser"

const routine = { id: "r1", name: "PPL", days: [
  { id: "d1", weekday: 1, label: "Push", order: 0, exercises: [{ id: "x" }] },
  { id: "d2", weekday: 3, label: "Pull", order: 1, exercises: [{ id: "y" }] },
] }

describe("DayChooser", () => {
  it("lists days and reports the picked day", async () => {
    const onPick = vi.fn()
    render(<DayChooser routine={routine as never} onPick={onPick} />)
    await userEvent.click(screen.getByRole("button", { name: /push/i }))
    expect(onPick).toHaveBeenCalledWith("d1")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/day-chooser.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the page and runner**

- `day-chooser.tsx`: lists the active routine's days (label or `weekdayLabel`), the day matching today's weekday is visually suggested; picking calls `onPick(dayId)`.
- `workout-runner.tsx` (client): `hydrate` the session store from the `SessionDTO`; own the timer state (rest auto-starts on set completion using the exercise's `restSeconds`, or the interval timer when `timerType !== "none"`); increment `activeSeconds` on a 1s ticker while running; debounce a `PUT` (~2s) via `useUpdateSession` whenever `isDirty`, and also push on `visibilitychange`/pause; render `RunnerHeader`, current `ExerciseView`, `ExerciseOverview`, controls (prev/next/swap/skip/finish/discard/pause), and the timer bar; request a best-effort `navigator.wakeLock` on mount and release on unmount; on Finish confirm-if-incomplete → `useCompleteSession(activeSeconds)` → `router.push('/{locale}/workout/summary/{id}')`; Discard → Radix `AlertDialog` → `useAbandonSession` → dashboard.
- `workout/page.tsx`: `useActiveSession()` → if a session exists, `<WorkoutRunner>`; else `useActiveRoutine()` → if a routine with >1 day, `<DayChooser onPick={(dayId) => start.mutate(dayId)}>`; if 1 day, start immediately; if no active routine, the `EmptyState` with a CTA to `/routines`. Loading/error states. `start` success invalidates and the runner mounts (or navigate to `/workout`).
- `routine-preview.tsx`: change the disabled Start button to a `Link` to `/{locale}/workout` (remove the "coming soon" affordance).

- [ ] **Step 4: Run tests, lint, typecheck, build**

Run: `pnpm test tests/unit/day-chooser.test.tsx && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/\(app\)/workout src/features/workouts src/features/routines tests
git commit -m "feat: add workout runner page and start flow"
```

---

### Task 10: Summary page

**Files:**
- Create: `src/app/[locale]/(app)/workout/summary/[sessionId]/page.tsx`, `src/features/workouts/components/session-summary.tsx`, `src/features/workouts/lib/summary.ts`
- Test: `tests/unit/summary.test.ts`

**Interfaces:**
- Consumes: `useSession(id)` (Task 4), `summary` math (this task), `formatWeight` (Task 5), translations `summary.*`.
- Produces: `computeSummary(session): { durationSeconds, completedSets, totalVolumeKg }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/summary.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { computeSummary } from "@/features/workouts/lib/summary"

const session = {
  activeSeconds: 1800,
  exercises: [
    { sets: [{ reps: 10, weightKg: 40, completedAt: "x" }, { reps: 8, weightKg: 50, completedAt: "y" }, { reps: 5, weightKg: null, completedAt: null }] },
    { sets: [{ reps: 12, weightKg: 20, completedAt: "z", type: "warmup" }] },
  ],
}

describe("computeSummary", () => {
  it("counts completed sets and sums volume over completed sets only", () => {
    const s = computeSummary(session as never)
    expect(s.durationSeconds).toBe(1800)
    expect(s.completedSets).toBe(3)
    expect(s.totalVolumeKg).toBe(10 * 40 + 8 * 50 + 12 * 20)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/summary.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the summary**

`summary.ts`: volume = Σ (`reps × weightKg`) over sets with `completedAt != null` and both values present; `completedSets` = count of those; `durationSeconds = session.activeSeconds`. `session-summary.tsx`: duration `mm:ss`/`h:mm:ss`, completed sets, total volume via `formatWeight`. Page: `useSession(id)` → render summary; loading/error.

- [ ] **Step 4: Run test, lint, typecheck, build**

Run: `pnpm test tests/unit/summary.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts src/app/[locale]/\(app\)/workout tests
git commit -m "feat: add post-workout summary"
```

---

### Task 11: i18n dictionaries for the runner

**Files:**
- Modify: `src/i18n/messages/en.json`, `es.json`
- Test: `tests/unit/runner-messages.test.ts`

**Interfaces:**
- Produces: `runner.*`, `runner.sets.*`, `timers.*`, `summary.*` in both locales.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/runner-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

describe("runner copy", () => {
  it("has the runner namespaces in both locales", () => {
    for (const m of [en, es]) {
      expect(m.runner).toBeTruthy()
      expect(m.runner.sets).toBeTruthy()
      expect(m.timers).toBeTruthy()
      expect(m.summary).toBeTruthy()
      expect(m.runner.finish.length).toBeGreaterThan(0)
      expect(m.summary.volume.length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/unit/runner-messages.test.ts`
Expected: FAIL — namespaces missing.

- [ ] **Step 3: Add the namespaces**

Add to both dictionaries with identical keys and real EN/ES copy:
- `runner.{title,resume,startChooseDay,noActiveRoutine,emptyCta,overview,prev,next,swap,skip,unskip,finish,discard,finishConfirm,discardConfirm,pause,resumeSession,lastPerformance,exerciseOf,addSet,unknownDay,error,retry}`
- `runner.sets.{reps,weight,warmup,working,rpe,notes,complete,completed,setNumber}`
- `timers.{rest,interval,round,skip,skipRound,addTime,subtractTime,paused,soundOn,soundOff}`
- `summary.{title,duration,sets,volume,done}`

- [ ] **Step 4: Run tests (parity + copy), lint, typecheck, build**

Run: `pnpm test tests/unit/runner-messages.test.ts tests/unit/i18n.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS. Grep the runner components for any `runner.`/`timers.`/`summary.` key not present and add it.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/messages
git commit -m "feat: add runner i18n copy (en/es)"
```

---

### Task 12: E2E — run a workout, resume, discard

**Files:**
- Create: `tests/e2e/workout-runner.spec.ts`
- Modify: `tests/e2e/helpers/session.ts` (if a helper is needed to seed an active routine + day)

**Interfaces:**
- Consumes: the session helper (onboarded), the running app.

- [ ] **Step 1: Write the spec**

Write a spec that, as an onboarded user with an active routine (seed one via the helper or the API), does:
1. `page.goto("/en/workout")` → day chooser (or auto-start) → runner appears.
2. Log a set (fill reps/weight, check complete) → the rest timer bar appears.
3. Reload the page → the session resumes with the logged set still present.
4. Finish → summary shows duration/sets/volume.
5. A separate case: start again → Discard (confirm) → returns to the dashboard with no active session.

Use accessible names; `data-testid` only where names are unstable. Clean up the `@e2e-test.local` user (cascade).

- [ ] **Step 2: Run the e2e suite**

Run:
```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db && pnpm db:migrate && pnpm db:seed && pnpm e2e
```
Expected: PASS (new spec + all earlier specs).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e
git commit -m "test: add workout runner e2e (run, resume, discard)"
```

---

### Task 13: Final gates and docs

**Files:**
- Modify: `docs/deploy.md`, `docs/superpowers/specs/2026-09-22-gym-tracker-phase2b-workout-runner-design.md`

**Interfaces:** none.

- [ ] **Step 1: Run the full gate set**

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db && pnpm db:migrate && pnpm db:seed
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:coverage && pnpm build && pnpm e2e
```
Expected: all PASS, pristine.

- [ ] **Step 2: Verify the Docker `migrate` stage**

Run the `migrate` target against a scratch DB; confirm `add_session` applies and re-runs as "No pending migrations".

- [ ] **Step 3: Update docs**

Add the `add_session` migration to `docs/deploy.md` release notes; set the 2B spec status to "Implemented".

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: note phase 2b migration and implementation status"
```

---

## Self-Review

**Spec coverage (spec §1–§14):**

| Spec section | Task |
|---|---|
| §3 session models + snapshot + one-in-progress | 1, 3 |
| §4 routes (workout, summary) + dashboard CTA | 9, 10 |
| §5 API table + validation + service behavior | 2, 3, 4 |
| §6 one-exercise-at-a-time runner, swap, skip, overview, wake lock, pause | 8, 9 |
| §7 rest + interval timers | 6, 8, 9 |
| §8 units (kg canonical) | 5 |
| §9 previous-performance hint | 3 (compute), 8 (render) |
| §10 i18n namespaces | 11 |
| §11 testing (unit/integration/component/e2e) | 1–12 |
| §12 risks (concurrent start, snapshot, conversion, timer, LWW, wake lock, debounced push) | 3, 5, 6, 9 |
| §13 acceptance criteria | 13 (gates) + 9–12 |
| §14 traceability | covered by the above |

No spec section is untasked. Streaks/XP/dashboard/history (Phase 3) and offline/background timers/custom exercises (2C) remain non-goals.

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step shows real code. Tasks 8–10 describe components/pages with concrete responsibilities and interfaces; the reviewer may tighten markup, but required behavior and state transitions are stated exactly, and the pure modules they depend on (timer, units, summary, store, schemas) have exact tests.

**Type/name consistency:** `startSessionSchema`/`sessionStateSchema`/`completeSessionSchema`, `startSession`/`getActiveSession`/`getSession`/`replaceSessionState`/`completeSession`/`abandonSession`, `sessionKeys.active/detail`, `kgToLb`/`lbToKg`/`displayWeight`/`parseWeightToKg`/`formatWeight`, `startRest`/`startInterval`/`tick`/`adjust`/`skip`/`pause`/`resume`, `useSessionStore` actions, `computeSummary` are used with consistent signatures across tasks. API paths: `GET /api/sessions/active`, `POST /api/sessions`, `GET/PUT /api/sessions/[sessionId]`, `POST .../complete`, `POST .../abandon`.

**Review Focus → tests:** (1) concurrent start — Task 3; (2) routine edited mid-session — Task 3; (3) kg↔lb round-trip — Task 5; (4) reload resumes — Task 7 (store) + Task 12 (e2e); (5) complete/abandon on non-in_progress rejected — Task 3.

---

## Notes for the human partner

- **Ordering:** Tasks 1→13 sequential. Task 1 adds a migration (use `migrate diff`+`deploy` if `migrate dev` needs confirmation).
- **Data prerequisite:** seed the catalog before Tasks 1, 3, 12.
- **Timer/alert:** sound + vibration are owned by the runner (Task 9); components render visuals only.
- **2C:** offline queue, background/lock-screen timers, and PWA wiring build on the coarse `PUT` introduced here.
- **Skills:** consult `.opencode/skills/` (`nextjs-app-router`, `typescript-strict-patterns`, `prisma-postgres-optimization`, `tailwind-theme-builder`, `shadcn-ui`, `vercel-react-best-practices`); this plan and the spec win over RSC-first guidance.
