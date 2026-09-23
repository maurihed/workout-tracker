# Phase 2C — PWA / Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app an installable PWA that can run a workout end-to-end offline, queueing writes in IndexedDB and syncing them idempotently on reconnect, with wall-clock timers that survive lock/background.

**Architecture:** The client becomes authoritative for session identity: it generates session/exercise/set UUIDs, builds the session from the cached active routine, persists it to IndexedDB, and pushes it through a coalesced outbox with `PUT /api/sessions/{id}` (create-or-replace). A Serwist service worker (configurator mode, Turbopack-compatible) precaches the shell and caches catalog/user GETs and media. Timers become wall-clock deadline-based, persisted alongside the active session.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · TypeScript strict · Serwist (configurator mode) · `idb` + IndexedDB · Zustand · TanStack Query · Zod · Prisma 7/Postgres · Vitest + RTL + `fake-indexeddb` · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase2c-pwa-offline-design.md`

## Global Constraints

- Server data flows only through `app/api/*` Route Handlers; thin handler → service → repository; services/repositories `import "server-only"`.
- Every query is scoped by the `userId` from `auth()`.
- Responses: `{ data }` on success, `{ error: { code, message, details? } }` on failure.
- Prisma 7: import `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client` (**never** `@prisma/client`).
- i18n: `en` + `es` keys must stay in parity (enforced by `tests/unit/i18n.test.ts` and `runner-messages.test.ts`); never hardcode user-facing copy in components.
- UI: mobile-first, tap targets ≥ 44px; no comments in code unless asked.
- TypeScript strict extras: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax` (use `import type`).
- Commands: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:integration` (Docker db + seed) · `pnpm test:coverage` · `pnpm build` · `pnpm e2e`.
- Integration/E2E: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`, `docker compose up -d db`, `pnpm db:seed`.
- Commit after every task. Keep all gates green before finishing the branch.

## Review Focus

Five input classes / failure modes the spec implies but no single task's happy-path test covers. Each has its test pinned in the task that owns the code:

1. **Offline cold-open before the SW is installed** — the app must still load and resume a running session (fallback to a locally persisted session, not a blank screen).
2. **Partial-success replay** — a `PUT` succeeds but `complete` fails; the next flush must not create a duplicate session or error out.
3. **Clock/timer edges** — backgrounded across a work→rest boundary and resuming, a paused timer, and a large time jump must yield the correct remaining seconds without skipping rounds.
4. **Conflicting in-progress sessions** — an offline-started session upserting while a different server session is in progress must abandon the other and leave exactly one in-progress.
5. **Degenerate payloads** — an exercise with 0 prescribed sets, a skipped exercise, reps ranges like `"8-12"`, weight `0`, and a 500-char note must validate and persist without crashing.

---

### Task 1: Wall-clock timer reducer

**Files:**
- Modify: `src/features/workouts/lib/timer.ts`
- Test: `tests/unit/timer.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TimerState` (adds `deadline: number | null`), `startRest(seconds, now?)`, `startInterval({workSeconds,restSeconds,rounds}, now?)`, `tick(state, now?)`, `adjust(state, deltaSeconds, now?)`, `pause(state, now?)`, `resume(state, now?)`, `skipRound(state, now?)`, `skip(state)`. All return a new `TimerState`.

- [ ] **Step 1: Replace the test file with the wall-clock contract**

```ts
import { describe, expect, it } from "vitest"
import {
  adjust, pause, resume, skip, skipRound, startInterval, startRest, tick,
} from "@/features/workouts/lib/timer"

const T0 = 1_000_000

describe("timer reducer (wall-clock)", () => {
  it("counts a rest timer down to idle in exactly its duration", () => {
    let s = startRest(2, T0)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(2)
    expect(s.deadline).toBe(T0 + 2000)
    s = tick(s, T0 + 1000)
    expect(s.remaining).toBe(1)
    s = tick(s, T0 + 2000)
    expect(s.phase).toBe("idle")
    expect(s.running).toBe(false)
    expect(s.deadline).toBeNull()
  })

  it("shows the correct remaining after a long background jump", () => {
    const s = startRest(300, T0)
    const resumed = tick(s, T0 + 65_000)
    expect(resumed.remaining).toBe(235)
  })

  it("carries overshoot across a work→rest boundary instead of skipping rounds", () => {
    let s = startInterval({ workSeconds: 2, restSeconds: 1, rounds: 2 }, T0)
    // Jump 2.5s: work(2s) elapses, 0.5s bleeds into rest → 1s rounded up.
    s = tick(s, T0 + 2500)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(1)
    expect(s.round).toBe(1)
    expect(s.deadline).toBe(T0 + 2500 + 500)
  })

  it("pause freezes remaining and clears the deadline; resume re-arms it", () => {
    let s = startRest(5, T0)
    s = pause(s, T0 + 2000)
    expect(s.running).toBe(false)
    expect(s.remaining).toBe(3)
    expect(s.deadline).toBeNull()
    s = tick(s, T0 + 10_000)
    expect(s.remaining).toBe(3)
    s = resume(s, T0 + 10_000)
    expect(s.deadline).toBe(T0 + 13_000)
    s = tick(s, T0 + 11_000)
    expect(s.remaining).toBe(2)
  })

  it("adjust moves remaining and the deadline while running", () => {
    let s = startRest(10, T0)
    s = adjust(s, 15, T0)
    expect(s.remaining).toBe(25)
    expect(s.deadline).toBe(T0 + 25_000)
    s = adjust(s, -100, T0)
    expect(s.remaining).toBe(0)
    expect(s.phase).toBe("idle")
    expect(s.deadline).toBeNull()
  })

  it("skipRound advances immediately with a fresh deadline", () => {
    let s = startInterval({ workSeconds: 10, restSeconds: 5, rounds: 2 }, T0)
    s = skipRound(s, T0 + 1000)
    expect(s.phase).toBe("rest")
    expect(s.remaining).toBe(5)
    expect(s.deadline).toBe(T0 + 1000 + 5000)
    s = skipRound(s, T0 + 1000)
    expect(s.phase).toBe("work")
    expect(s.round).toBe(2)
    s = skipRound(s, T0 + 1000)
    expect(s.running).toBe(false)
  })

  it("skip ends the current timer", () => {
    expect(skip(startRest(60, T0)).running).toBe(false)
  })

  it("resume is a no-op on a finished timer", () => {
    const finished = tick(tick(startRest(2, T0), T0 + 2000), T0 + 2000)
    const resumed = resume(finished, T0 + 5000)
    expect(resumed.running).toBe(false)
    expect(resumed).toBe(finished)
  })

  it("guards interval inputs", () => {
    const s = startInterval({ workSeconds: -5, restSeconds: -1, rounds: 0 }, T0)
    expect(s.workSeconds).toBe(0)
    expect(s.restSeconds).toBe(0)
    expect(s.rounds).toBe(1)
    expect(s.remaining).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/timer.test.ts`
Expected: FAIL — `startRest` called with 2 args / `deadline` undefined.

- [ ] **Step 3: Rewrite `timer.ts`**

```ts
export type TimerKind = "rest" | "interval"
export type TimerPhase = "work" | "rest" | "idle"

export type TimerState = {
  kind: TimerKind
  phase: TimerPhase
  remaining: number
  total: number
  running: boolean
  round: number
  rounds: number
  workSeconds: number
  restSeconds: number
  deadline: number | null
}

export function startRest(seconds: number, now: number = Date.now()): TimerState {
  const safe = Math.max(0, seconds)
  return {
    kind: "rest",
    phase: "rest",
    remaining: safe,
    total: safe,
    running: true,
    round: 1,
    rounds: 1,
    workSeconds: 0,
    restSeconds: 0,
    deadline: now + safe * 1000,
  }
}

export function startInterval(
  { workSeconds, restSeconds, rounds }: { workSeconds: number; restSeconds: number; rounds: number },
  now: number = Date.now(),
): TimerState {
  const safeWork = Math.max(0, workSeconds)
  const safeRest = Math.max(0, restSeconds)
  const safeRounds = Math.max(1, Math.floor(rounds))
  return {
    kind: "interval",
    phase: "work",
    remaining: safeWork,
    total: safeWork,
    running: true,
    round: 1,
    rounds: safeRounds,
    workSeconds: safeWork,
    restSeconds: safeRest,
    deadline: now + safeWork * 1000,
  }
}

function finish(state: TimerState): TimerState {
  return { ...state, phase: "idle", remaining: 0, running: false, deadline: null }
}

function advance(state: TimerState): TimerState {
  if (state.kind === "rest") return finish(state)
  if (state.phase === "work") {
    if (state.round >= state.rounds) return finish(state)
    if (state.restSeconds > 0) {
      return { ...state, phase: "rest", remaining: state.restSeconds, total: state.restSeconds }
    }
    return { ...state, round: state.round + 1, remaining: state.workSeconds, total: state.workSeconds }
  }
  if (state.phase === "rest") {
    return { ...state, phase: "work", round: state.round + 1, remaining: state.workSeconds, total: state.workSeconds }
  }
  return state
}

function secondsUntil(deadline: number, now: number): number {
  return Math.ceil((deadline - now) / 1000)
}

export function tick(state: TimerState, now: number = Date.now()): TimerState {
  if (!state.running || state.deadline === null) return state
  let next = state
  for (let guard = 0; guard < 10_000; guard += 1) {
    const deadline = next.deadline
    if (deadline === null) return next
    const remainingMs = deadline - now
    if (remainingMs > 0) {
      const remaining = Math.ceil(remainingMs / 1000)
      return remaining === next.remaining ? next : { ...next, remaining }
    }
    const advanced = advance(next)
    if (advanced.phase === "idle") return finish(advanced)
    const nextDeadline = now + advanced.total * 1000 - -remainingMs
    next = { ...advanced, deadline: nextDeadline }
  }
  return next
}

export function skipRound(state: TimerState, now: number = Date.now()): TimerState {
  const advanced = advance(state)
  if (advanced.phase === "idle") return finish(advanced)
  return { ...advanced, deadline: now + advanced.total * 1000 }
}

export function adjust(state: TimerState, deltaSeconds: number, now: number = Date.now()): TimerState {
  const remaining = Math.max(0, state.remaining + deltaSeconds)
  if (remaining === 0) return finish({ ...state, remaining })
  if (state.running && state.deadline !== null) {
    return { ...state, remaining, deadline: state.deadline + deltaSeconds * 1000 }
  }
  return { ...state, remaining }
}

export function pause(state: TimerState, now: number = Date.now()): TimerState {
  if (!state.running || state.deadline === null) return state
  return { ...state, running: false, remaining: secondsUntil(state.deadline, now), deadline: null }
}

export function resume(state: TimerState, now: number = Date.now()): TimerState {
  if (state.phase === "idle" || state.remaining <= 0) return state
  return { ...state, running: true, deadline: now + state.remaining * 1000 }
}

export function skip(state: TimerState): TimerState {
  return finish(state)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/timer.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Fix any type errors from the new `deadline` field**

Run: `pnpm typecheck`
Expected: errors only in `workout-runner.tsx` if it constructs a `TimerState` literal. If a literal is built, add `deadline: null` there (the runner is fully migrated in Task 14; a temporary literal is fine).

- [ ] **Step 6: Commit**

```bash
git add src/features/workouts/lib/timer.ts tests/unit/timer.test.ts
git commit -m "refactor(timers): wall-clock deadline reducer"
```

---

### Task 2: Shared session snapshot + seeded sets

**Files:**
- Create: `src/features/workouts/lib/session-snapshot.ts`
- Test: `tests/unit/session-snapshot.test.ts`

**Interfaces:**
- Consumes: `RoutineDTO` from `@/features/routines/hooks/use-active-routine`.
- Produces:
  - `type RoutineDay = RoutineDTO["days"][number]`
  - `type RoutineExerciseDTO = RoutineDay["exercises"][number]`
  - `type SessionSnapshot = { routineId: string | null; routineDayId: string; name: string; nameEs: string | null; weekday: number; label: string | null; exercises: SnapshotExercise[] }`
  - `type SnapshotExercise = { order: number; name: string; nameEs: string | null; targetSets: number | null; targetReps: string | null; restSeconds: number | null; targetWeightKg: number | null; timerType: string | null; workSeconds: number | null; rounds: number | null }`
  - `parseTargetReps(targetReps: string | null): number | null`
  - `buildSessionSnapshot(routine: RoutineDTO, day: RoutineDay): SessionSnapshot`
  - `seedSets(exercise: RoutineExerciseDTO): { setNumber: number; type: "working"; reps: number | null; weightKg: number | null }[]`
  - `MAX_SEEDED_SETS = 50`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  buildSessionSnapshot, parseTargetReps, seedSets, type RoutineDay,
} from "@/features/workouts/lib/session-snapshot"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1", name: "Push", nameEs: "Empuje", description: null, descriptionEs: null,
  goal: null, source: "manual", isActive: true,
  days: [{
    id: "d1", weekday: 1, label: "Push", order: 0,
    exercises: [{
      id: "re1", order: 0, exerciseId: "e1", customName: null,
      targetSets: 3, targetReps: "8-12", restSeconds: 90, targetWeightKg: 40,
      timerType: "none", workSeconds: null, rounds: null, notes: null,
      exercise: { id: "e1", name: "Squat", nameEs: "Sentadilla", images: [] },
    }],
  }],
}

describe("session snapshot", () => {
  it("parses only exact integer prescriptions", () => {
    expect(parseTargetReps("10")).toBe(10)
    expect(parseTargetReps(" 12 ")).toBe(12)
    expect(parseTargetReps("8-12")).toBeNull()
    expect(parseTargetReps("AMRAP")).toBeNull()
    expect(parseTargetReps(null)).toBeNull()
  })

  it("freezes routine/day identity and per-exercise prescriptions", () => {
    const snap = buildSessionSnapshot(routine, routine.days[0]! as RoutineDay)
    expect(snap).toMatchObject({ routineId: "r1", routineDayId: "d1", name: "Push", nameEs: "Empuje", weekday: 1, label: "Push" })
    expect(snap.exercises[0]).toEqual({
      order: 0, name: "Squat", nameEs: "Sentadilla", targetSets: 3, targetReps: "8-12",
      restSeconds: 90, targetWeightKg: 40, timerType: "none", workSeconds: null, rounds: null,
    })
  })

  it("prefers a custom name and falls back for unknown exercises", () => {
    const day = { ...routine.days[0]!, exercises: [{ ...routine.days[0]!.exercises[0]!, customName: "My Lift", exercise: null }] }
    const snap = buildSessionSnapshot(routine, day as RoutineDay)
    expect(snap.exercises[0]?.name).toBe("My Lift")
    expect(snap.exercises[0]?.nameEs).toBeNull()
  })

  it("seeds clamped, uncompleted prescribed sets", () => {
    const sets = seedSets({ ...routine.days[0]!.exercises[0]!, targetSets: 3, targetReps: "10" })
    expect(sets).toEqual([
      { setNumber: 1, type: "working", reps: 10, weightKg: 40 },
      { setNumber: 2, type: "working", reps: 10, weightKg: 40 },
      { setNumber: 3, type: "working", reps: 10, weightKg: 40 },
    ])
  })

  it("caps seeded sets and tolerates ranges/zero sets", () => {
    expect(seedSets({ ...routine.days[0]!.exercises[0]!, targetSets: 999 }).length).toBe(50)
    expect(seedSets({ ...routine.days[0]!.exercises[0]!, targetSets: 0 })).toEqual([])
    expect(seedSets({ ...routine.days[0]!.exercises[0]!, targetReps: "8-12" })[0]?.reps).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/session-snapshot.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `session-snapshot.ts`**

```ts
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

export type RoutineDay = RoutineDTO["days"][number]
export type RoutineExerciseDTO = RoutineDay["exercises"][number]

export type SnapshotExercise = {
  order: number
  name: string
  nameEs: string | null
  targetSets: number | null
  targetReps: string | null
  restSeconds: number | null
  targetWeightKg: number | null
  timerType: string | null
  workSeconds: number | null
  rounds: number | null
}

export type SessionSnapshot = {
  routineId: string | null
  routineDayId: string
  name: string
  nameEs: string | null
  weekday: number
  label: string | null
  exercises: SnapshotExercise[]
}

export const MAX_SEEDED_SETS = 50

export function parseTargetReps(targetReps: string | null): number | null {
  if (!targetReps) return null
  const trimmed = targetReps.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

function exerciseName(exercise: RoutineExerciseDTO): string {
  return exercise.customName ?? exercise.exercise?.name ?? "Unknown exercise"
}

function exerciseNameEs(exercise: RoutineExerciseDTO): string | null {
  return exercise.exercise?.nameEs ?? null
}

export function buildSessionSnapshot(routine: RoutineDTO, day: RoutineDay): SessionSnapshot {
  return {
    routineId: routine.id,
    routineDayId: day.id,
    name: routine.name,
    nameEs: routine.nameEs,
    weekday: day.weekday,
    label: day.label,
    exercises: day.exercises.map((exercise) => ({
      order: exercise.order,
      name: exerciseName(exercise),
      nameEs: exerciseNameEs(exercise),
      targetSets: exercise.targetSets,
      targetReps: exercise.targetReps,
      restSeconds: exercise.restSeconds,
      targetWeightKg: exercise.targetWeightKg,
      timerType: exercise.timerType,
      workSeconds: exercise.workSeconds,
      rounds: exercise.rounds,
    })),
  }
}

export function seedSets(exercise: RoutineExerciseDTO): {
  setNumber: number
  type: "working"
  reps: number | null
  weightKg: number | null
}[] {
  const count = Math.min(Math.max(exercise.targetSets ?? 0, 0), MAX_SEEDED_SETS)
  const reps = parseTargetReps(exercise.targetReps)
  return Array.from({ length: count }, (_, index) => ({
    setNumber: index + 1,
    type: "working" as const,
    reps,
    weightKg: exercise.targetWeightKg,
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/session-snapshot.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/lib/session-snapshot.ts tests/unit/session-snapshot.test.ts
git commit -m "feat(workouts): shared session snapshot and seed builders"
```

---

### Task 3: Local session builder

**Files:**
- Create: `src/features/workouts/lib/build-local-session.ts`
- Test: `tests/unit/build-local-session.test.ts`

**Interfaces:**
- Consumes: `buildSessionSnapshot`, `seedSets`, `RoutineDay`, `SessionSnapshot` (Task 2); `SessionStoreSource` from `@/features/workouts/stores/session-store`; `RoutineDTO`.
- Produces:
  - `type LocalSession = { source: SessionStoreSource; snapshot: SessionSnapshot; routineDayId: string; startedAt: string; name: string }`
  - `buildLocalSession(routine: RoutineDTO, day: RoutineDay, deps?: { newId?: () => string; now?: () => Date }): LocalSession`
  - `type SessionUpsertPayload = { id: string; routineDayId: string; name: string; startedAt: string; activeSeconds: number; snapshot: SessionSnapshot; exercises: SessionStateInput["exercises"] }`
  - `toUpsertPayload(local: LocalSession, activeSeconds: number): SessionUpsertPayload`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

const routine: RoutineDTO = {
  id: "r1", name: "Push", nameEs: "Empuje", description: null, descriptionEs: null,
  goal: null, source: "manual", isActive: true,
  days: [{
    id: "d1", weekday: 1, label: "Push Day", order: 0,
    exercises: [{
      id: "re1", order: 0, exerciseId: "e1", customName: null,
      targetSets: 2, targetReps: "10", restSeconds: 60, targetWeightKg: 30,
      timerType: "none", workSeconds: null, rounds: null, notes: null,
      exercise: { id: "e1", name: "Squat", nameEs: null, images: [] },
    }],
  }],
}

function seqIds() {
  let n = 0
  return () => `id-${++n}`
}

describe("buildLocalSession", () => {
  it("generates a session, exercise, and set ids", () => {
    const local = buildLocalSession(routine, routine.days[0]!, {
      newId: seqIds(), now: () => new Date("2026-01-01T10:00:00.000Z"),
    })
    expect(local.source.id).toBe("id-1")
    expect(local.source.name).toBe("Push Day")
    expect(local.source.status).toBe("in_progress")
    expect(local.source.startedAt).toBe("2026-01-01T10:00:00.000Z")
    expect(local.source.exercises[0]?.id).toBe("id-2")
    expect(local.source.exercises[0]?.sets.map((s) => s.id)).toEqual(["id-3", "id-4"])
    expect(local.source.exercises[0]?.sets[0]).toMatchObject({ setNumber: 1, reps: 10, weightKg: 30, completedAt: null })
  })

  it("falls back to the routine name when the day has no label", () => {
    const day = { ...routine.days[0]!, label: null }
    const local = buildLocalSession(routine, day, { newId: seqIds() })
    expect(local.source.name).toBe("Push")
  })

  it("builds an upsert payload carrying the snapshot and state", () => {
    const local = buildLocalSession(routine, routine.days[0]!, { newId: seqIds() })
    const payload = toUpsertPayload(local, 42)
    expect(payload.id).toBe(local.source.id)
    expect(payload.routineDayId).toBe("d1")
    expect(payload.activeSeconds).toBe(42)
    expect(payload.snapshot.routineDayId).toBe("d1")
    expect(payload.exercises[0]?.sets).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/build-local-session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `build-local-session.ts`**

```ts
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import type { SessionStateInput } from "@/features/workouts/schemas/session"
import type { SessionStoreSource } from "@/features/workouts/stores/session-store"
import {
  buildSessionSnapshot,
  seedSets,
  type RoutineDay,
  type SessionSnapshot,
} from "./session-snapshot"

export type LocalSession = {
  source: SessionStoreSource
  snapshot: SessionSnapshot
  routineDayId: string
  startedAt: string
  name: string
}

export type SessionUpsertPayload = {
  id: string
  routineDayId: string
  name: string
  startedAt: string
  activeSeconds: number
  snapshot: SessionSnapshot
  exercises: SessionStateInput["exercises"]
}

type Deps = { newId?: () => string; now?: () => Date }

export function buildLocalSession(
  routine: RoutineDTO,
  day: RoutineDay,
  deps: Deps = {},
): LocalSession {
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const now = deps.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const name = day.label ?? routine.name
  const snapshot = buildSessionSnapshot(routine, day)
  const id = newId()

  const exercises: SessionStoreSource["exercises"] = day.exercises.map((exercise) => ({
    id: newId(),
    exerciseId: exercise.exerciseId,
    nameSnapshot: exercise.customName ?? exercise.exercise?.name ?? "Unknown exercise",
    targetSets: exercise.targetSets,
    targetReps: exercise.targetReps,
    restSeconds: exercise.restSeconds,
    timerType: exercise.timerType,
    workSeconds: exercise.workSeconds,
    rounds: exercise.rounds,
    completed: false,
    skipped: false,
    swappedFromId: null,
    notes: null,
    sets: seedSets(exercise).map((set) => ({ ...set, id: newId() })),
  }))

  return {
    source: {
      id,
      name,
      status: "in_progress",
      startedAt,
      activeSeconds: 0,
      exercises,
    },
    snapshot,
    routineDayId: day.id,
    startedAt,
    name,
  }
}

export function toUpsertPayload(
  local: LocalSession,
  activeSeconds: number,
): SessionUpsertPayload {
  return {
    id: local.source.id,
    routineDayId: local.routineDayId,
    name: local.name,
    startedAt: local.startedAt,
    activeSeconds,
    snapshot: local.snapshot,
    exercises: local.source.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      nameSnapshot: exercise.nameSnapshot,
      swappedFromId: exercise.swappedFromId ?? null,
      completed: exercise.completed,
      skipped: exercise.skipped,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        ...(set.id ? { id: set.id } : {}),
        setNumber: set.setNumber,
        type: set.type,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
        rpe: set.rpe,
        restSecondsLogged: set.restSecondsLogged,
        completedAt: set.completedAt,
      })),
    })),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/build-local-session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/lib/build-local-session.ts tests/unit/build-local-session.test.ts
git commit -m "feat(workouts): local session builder"
```

---

### Task 4: UUID schemas and the session upsert input

**Files:**
- Modify: `src/features/workouts/schemas/session.ts`
- Test: `tests/unit/session-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `setInputSchema` (`id?` uuid), `sessionExerciseInputSchema` (`id` uuid), `sessionStateSchema`, `sessionSnapshotSchema`, `sessionUpsertSchema`, `SessionUpsertInput`, `completeSessionSchema`. `startSessionSchema` is removed.

- [ ] **Step 1: Replace the test file**

```ts
import { describe, expect, it } from "vitest"
import { completeSessionSchema, sessionStateSchema, sessionUpsertSchema } from "@/features/workouts/schemas/session"

const SE = "11111111-1111-4111-8111-111111111111"
const SET = "22222222-2222-4222-8222-222222222222"
const set = { id: SET, setNumber: 1, type: "working", reps: 8, weightKg: 40, durationSeconds: null, rpe: 8, restSecondsLogged: 90, completedAt: new Date().toISOString() }
const ex = { id: SE, exerciseId: "e1", nameSnapshot: "Squat", completed: false, skipped: false, notes: null, sets: [set] }
const snapshot = { routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push", exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: 40, timerType: "none", workSeconds: null, rounds: null }] }

describe("session schemas", () => {
  it("requires UUIDs for exercise and set ids", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [ex] }).success).toBe(true)
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [{ ...ex, id: "se1" }] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 120, exercises: [{ ...ex, sets: [{ ...set, id: "s1" }] }] }).success).toBe(false)
  })

  it("accepts a valid session state and rejects a bad rpe/time", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: -1, exercises: [ex] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, sets: [{ ...set, rpe: 11 }] }] }).success).toBe(false)
  })

  it("defaults swap provenance to null and accepts an explicit origin", () => {
    const omitted = sessionStateSchema.parse({ activeSeconds: 0, exercises: [ex] })
    expect(omitted.exercises[0]?.swappedFromId).toBeNull()
    const swapped = sessionStateSchema.parse({ activeSeconds: 0, exercises: [{ ...ex, swappedFromId: "e0" }] })
    expect(swapped.exercises[0]?.swappedFromId).toBe("e0")
  })

  it("validates the upsert envelope and its snapshot", () => {
    const good = { id: "33333333-3333-4333-8333-333333333333", routineDayId: "d1", name: "Push", startedAt: new Date().toISOString(), activeSeconds: 0, snapshot, exercises: [ex] }
    expect(sessionUpsertSchema.safeParse(good).success).toBe(true)
    expect(sessionUpsertSchema.safeParse({ ...good, id: "nope" }).success).toBe(false)
    expect(sessionUpsertSchema.safeParse({ ...good, snapshot: { ...snapshot, weekday: 9 } }).success).toBe(false)
    expect(sessionUpsertSchema.safeParse({ ...good, snapshot: { ...snapshot, exercises: [] } }).success).toBe(false)
  })

  it("rejects an over-long note and a non-integer weight", () => {
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, notes: "x".repeat(501) }] }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ activeSeconds: 0, exercises: [{ ...ex, sets: [{ ...set, weightKg: -1 }] }] }).success).toBe(false)
  })

  it("complete requires non-negative activeSeconds", () => {
    expect(completeSessionSchema.safeParse({ activeSeconds: 0 }).success).toBe(true)
    expect(completeSessionSchema.safeParse({ activeSeconds: -5 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/session-schema.test.ts`
Expected: FAIL — `sessionUpsertSchema` is not exported.

- [ ] **Step 3: Rewrite `session.ts`**

```ts
import { z } from "zod"

export const setTypeSchema = z.enum(["warmup", "working", "drop", "failure"])
export const timerTypeSchema = z.enum(["none", "interval", "emom", "amrap"])

export const setInputSchema = z.object({
  id: z.string().uuid().optional(),
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
  id: z.string().uuid(),
  exerciseId: z.string().min(1).nullable(),
  nameSnapshot: z.string().trim().min(1).max(200),
  swappedFromId: z.string().min(1).nullable().default(null),
  completed: z.boolean(),
  skipped: z.boolean(),
  notes: z.string().trim().max(500).nullable().default(null),
  sets: z.array(setInputSchema).max(50),
})

export const sessionStateSchema = z.object({
  activeSeconds: z.number().int().min(0),
  exercises: z.array(sessionExerciseInputSchema).max(100),
})
export type SessionStateInput = z.infer<typeof sessionStateSchema>

const snapshotExerciseSchema = z.object({
  order: z.number().int().min(0),
  name: z.string().trim().min(1).max(200),
  nameEs: z.string().trim().max(200).nullable().default(null),
  targetSets: z.number().int().min(0).max(50).nullable().default(null),
  targetReps: z.string().trim().max(50).nullable().default(null),
  restSeconds: z.number().int().min(0).max(3600).nullable().default(null),
  targetWeightKg: z.number().min(0).max(1000).nullable().default(null),
  timerType: timerTypeSchema.nullable().default(null),
  workSeconds: z.number().int().min(0).max(86_400).nullable().default(null),
  rounds: z.number().int().min(0).max(1000).nullable().default(null),
})

export const sessionSnapshotSchema = z.object({
  routineId: z.string().min(1).nullable(),
  routineDayId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  nameEs: z.string().trim().max(200).nullable().default(null),
  weekday: z.number().int().min(0).max(6),
  label: z.string().trim().max(200).nullable().default(null),
  exercises: z.array(snapshotExerciseSchema).min(1).max(100),
})

export const sessionUpsertSchema = z.object({
  id: z.string().uuid(),
  routineDayId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  startedAt: z.string().datetime(),
  activeSeconds: z.number().int().min(0),
  snapshot: sessionSnapshotSchema,
  exercises: z.array(sessionExerciseInputSchema).max(100),
})
export type SessionUpsertInput = z.infer<typeof sessionUpsertSchema>

export const completeSessionSchema = z.object({ activeSeconds: z.number().int().min(0) })
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/session-schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/schemas/session.ts tests/unit/session-schema.test.ts
git commit -m "feat(workouts): uuid session schemas and upsert envelope"
```

---

### Task 5: Idempotent upsert service + repository

**Files:**
- Modify: `src/server/repositories/session.repository.ts`
- Modify: `src/server/services/session.service.ts`
- Test: `tests/integration/session-upsert.test.ts`

**Interfaces:**
- Consumes: `SessionUpsertInput` (Task 4); `buildLocalSession`/`toUpsertPayload` (Task 3).
- Produces:
  - Repository: `findOwnedDay(userId, routineDayId)`, `existingExerciseIds(ids): Promise<Set<string>>`, `abandonOtherInProgress(tx, userId, keepId)`, `createSessionFromUpsert(tx, userId, input)`, `replaceSets` (now upsert-by-id; `SetLogWriteInput` gains `id?: string`).
  - Service: `upsertSession(userId, input): Promise<SessionStateAck>`, `completeSession` (idempotent), `abandonSession` (idempotent). `startSession` and `replaceSessionState` are removed.

- [ ] **Step 1: Write the failing integration test**

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  abandonSession, completeSession, getSession, upsertSession,
} from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@session-upsert-test.local"

async function makeRoutine(): Promise<{ userId: string; routine: RoutineDTO }> {
  const user = await prisma.user.create({ data: { email: `su_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true, images: true } })
  const routine = await prisma.routine.create({
    data: {
      userId: user.id, name: "Push", source: "manual", isActive: true,
      days: { create: [{ weekday: 1, label: "Push", order: 0, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 3, targetReps: "10", targetWeightKg: 40, restSeconds: 90 }] } }] },
    },
    include: { days: { include: { exercises: { include: { exercise: true } } } } },
  })
  const dto: RoutineDTO = {
    id: routine.id, name: "Push", nameEs: null, description: null, descriptionEs: null,
    goal: null, source: "manual", isActive: true,
    days: routine.days.map((day) => ({
      id: day.id, weekday: day.weekday, label: day.label, order: day.order,
      exercises: day.exercises.map((re) => ({
        id: re.id, order: re.order, exerciseId: re.exerciseId, customName: re.customName,
        targetSets: re.targetSets, targetReps: re.targetReps, restSeconds: re.restSeconds,
        targetWeightKg: re.targetWeightKg, timerType: re.timerType, workSeconds: re.workSeconds,
        rounds: re.rounds, notes: re.notes,
        exercise: re.exercise ? { id: re.exercise.id, name: re.exercise.name, nameEs: re.exercise.nameEs, images: re.exercise.images } : null,
      })),
    })),
  }
  return { userId: user.id, routine: dto }
}

function payloadFor(routine: RoutineDTO, activeSeconds = 0) {
  const local = buildLocalSession(routine, routine.days[0]!)
  return toUpsertPayload(local, activeSeconds)
}

describe("session upsert", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("creates a session from a client payload and replays idempotently", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    const ack = await upsertSession(userId, payload)
    expect(ack.status).toBe("in_progress")
    expect(await prisma.workoutSession.count({ where: { userId } })).toBe(1)
    expect(await prisma.sessionExercise.count({ where: { sessionId: payload.id } })).toBe(1)
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId: payload.id } } })).toBe(3)

    const replay = await upsertSession(userId, payload)
    expect(replay.id).toBe(payload.id)
    expect(await prisma.workoutSession.count({ where: { userId } })).toBe(1)
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId: payload.id } } })).toBe(3)
  })

  it("abandons a conflicting in-progress session on create", async () => {
    const { userId, routine } = await makeRoutine()
    const first = payloadFor(routine)
    await upsertSession(userId, first)
    const second = payloadFor(routine)
    await upsertSession(userId, second)
    expect(await prisma.workoutSession.count({ where: { userId, status: "in_progress" } })).toBe(1)
    expect(await prisma.workoutSession.count({ where: { userId, status: "abandoned" } })).toBe(1)
  })

  it("edits sets by id without churning row ids", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    const setId = payload.exercises[0]!.sets[0]!.id!
    const edited = { ...payload, exercises: [{ ...payload.exercises[0]!, sets: payload.exercises[0]!.sets.slice(0, 1).map((s) => ({ ...s, reps: 5, completedAt: new Date().toISOString() })) }] }
    await upsertSession(userId, edited)
    const rows = await prisma.setLog.findMany({ where: { sessionExercise: { sessionId: payload.id } } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(setId)
    expect(rows[0]?.reps).toBe(5)
  })

  it("is idempotent on complete and abandon; rejects a write after completion", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine, 120)
    await upsertSession(userId, payload)
    const done = await completeSession(userId, payload.id, 300)
    expect(done.status).toBe("completed")
    expect((await completeSession(userId, payload.id, 999)).activeSeconds).toBe(300)
    await expect(upsertSession(userId, payload)).rejects.toThrow(/not in progress/i)
    await expect(abandonSession(userId, payload.id)).rejects.toThrow(/not in progress/i)
  })

  it("is idempotent on abandon", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    await abandonSession(userId, payload.id)
    await expect(abandonSession(userId, payload.id)).resolves.toBeUndefined()
    expect(await prisma.workoutSession.count({ where: { userId, status: "abandoned" } })).toBe(1)
  })

  it("scopes ownership and validates the routine day", async () => {
    const { userId, routine } = await makeRoutine()
    const other = await prisma.user.create({ data: { email: `su2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    const payload = payloadFor(routine)
    await upsertSession(userId, payload)
    await expect(getSession(other.id, payload.id)).rejects.toThrow("Session not found")
    const bad = { ...payloadFor(routine), routineDayId: "missing-day" }
    await expect(upsertSession(other.id, bad)).rejects.toThrow(/Routine day not found/i)
  })

  it("persists degenerate payloads (no sets, skipped, range reps, weight 0, long note)", async () => {
    const { userId, routine } = await makeRoutine()
    const payload = payloadFor(routine)
    const degenerate = {
      ...payload,
      exercises: [{
        ...payload.exercises[0]!,
        skipped: true,
        completed: false,
        notes: "x".repeat(500),
        sets: [],
      }],
    }
    await upsertSession(userId, degenerate)
    const reopened = await getSession(userId, payload.id)
    expect(reopened.exercises[0]?.skipped).toBe(true)
    expect(reopened.exercises[0]?.sets).toHaveLength(0)
    expect(reopened.exercises[0]?.notes).toHaveLength(500)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && docker compose up -d db && pnpm db:seed && pnpm test:integration -- tests/integration/session-upsert.test.ts`
Expected: FAIL — `upsertSession` is not exported.

- [ ] **Step 3: Update `session.repository.ts`**

Remove `buildSnapshot`, `buildSeededSets`, `parseTargetReps`, `createSessionWithExercises`, and `findOwnedDayWithExercises`. Add the imports and functions below (keep `sessionSelect`, `sessionAckSelect`, `findActiveByUser`, `findByIdForUser`, `updateHeader`, `setStatus`, `findLastPerformance`, `withTransaction` untouched):

```ts
import type { SessionUpsertInput } from "@/features/workouts/schemas/session"
// ...existing imports...

/** True when the routine day exists and its parent routine belongs to `userId`. */
export function findOwnedDay(userId: string, routineDayId: string) {
  return prisma.routineDay.findFirst({
    where: { id: routineDayId, routine: { userId } },
    select: { id: true },
  })
}

/** The subset of `ids` that exist in the catalog (for upsert validation). */
export async function existingExerciseIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await prisma.exercise.findMany({ where: { id: { in: ids } }, select: { id: true } })
  return new Set(rows.map((row) => row.id))
}

/** Marks every other in-progress session for the user abandoned (local wins). */
export function abandonOtherInProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  keepId: string,
) {
  return tx.workoutSession.updateMany({
    where: { userId, status: "in_progress", id: { not: keepId } },
    data: { status: "abandoned" },
  })
}

/** Creates the session (with its client snapshot, exercises, and sets) in one write. */
export function createSessionFromUpsert(
  tx: Prisma.TransactionClient,
  userId: string,
  input: SessionUpsertInput,
) {
  return tx.workoutSession.create({
    data: {
      id: input.id,
      userId,
      routineId: input.snapshot.routineId,
      routineDayId: input.routineDayId,
      name: input.name,
      status: "in_progress",
      startedAt: new Date(input.startedAt),
      activeSeconds: input.activeSeconds,
      snapshot: input.snapshot as Prisma.InputJsonValue,
      exercises: {
        create: input.exercises.map((exercise, index) => ({
          id: exercise.id,
          exerciseId: exercise.exerciseId,
          order: index,
          nameSnapshot: exercise.nameSnapshot,
          completed: exercise.completed,
          skipped: exercise.skipped,
          swappedFromId: exercise.swappedFromId,
          notes: exercise.notes,
          sets: {
            create: exercise.sets.map((set) => ({
              ...(set.id ? { id: set.id } : {}),
              setNumber: set.setNumber,
              type: set.type,
              reps: set.reps,
              weightKg: set.weightKg,
              durationSeconds: set.durationSeconds,
              rpe: set.rpe,
              restSecondsLogged: set.restSecondsLogged,
              completedAt: set.completedAt ? new Date(set.completedAt) : null,
            })),
          },
        })),
      },
    },
    select: sessionSelect,
  })
}
```

Replace `replaceSets` (and `SetLogWriteInput`) with the upsert-by-id version:

```ts
export type SetLogWriteInput = {
  id?: string
  setNumber: number
  type: SetType
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  rpe: number | null
  restSecondsLogged: number | null
  completedAt: string | null
}

function setData(set: SetLogWriteInput) {
  return {
    setNumber: set.setNumber,
    type: set.type,
    reps: set.reps,
    weightKg: set.weightKg,
    durationSeconds: set.durationSeconds,
    rpe: set.rpe,
    restSecondsLogged: set.restSecondsLogged,
    completedAt: set.completedAt ? new Date(set.completedAt) : null,
  }
}

/**
 * Applies the submitted exercises to the session, upserting sets by their
 * client id and deleting only sets the payload dropped, so replaying the same
 * state never churns row ids. Ids that do not belong to the session are ignored.
 */
export async function replaceSets(
  tx: Prisma.TransactionClient,
  sessionId: string,
  exercises: SessionExerciseWriteInput[],
) {
  const owned = await tx.sessionExercise.findMany({ where: { sessionId }, select: { id: true } })
  const ownedIds = new Set(owned.map((row) => row.id))

  for (const exercise of exercises) {
    if (!ownedIds.has(exercise.id)) continue
    await tx.sessionExercise.update({
      where: { id: exercise.id },
      data: {
        exerciseId: exercise.exerciseId,
        nameSnapshot: exercise.nameSnapshot,
        swappedFromId: exercise.swappedFromId,
        completed: exercise.completed,
        skipped: exercise.skipped,
        notes: exercise.notes,
      },
    })
    const keepIds = exercise.sets.map((set) => set.id).filter((id): id is string => Boolean(id))
    await tx.setLog.deleteMany({
      where: { sessionExerciseId: exercise.id, ...(keepIds.length > 0 ? { id: { notIn: keepIds } } : {}) },
    })
    for (const set of exercise.sets) {
      if (set.id) {
        await tx.setLog.upsert({
          where: { id: set.id },
          create: { id: set.id, sessionExerciseId: exercise.id, ...setData(set) },
          update: setData(set),
        })
      } else {
        await tx.setLog.create({ data: { sessionExerciseId: exercise.id, ...setData(set) } })
      }
    }
  }
}
```

- [ ] **Step 4: Update `session.service.ts`**

Remove `startSession` and `replaceSessionState`. Import `ValidationError` from `@/lib/api-error` and `SessionUpsertInput` from the schema. Add/replace:

```ts
export async function upsertSession(
  userId: string,
  input: SessionUpsertInput,
): Promise<SessionStateAck> {
  const existing = await repos.findByIdForUser(userId, input.id)
  if (existing) {
    if (existing.status !== "in_progress") throw new ConflictError("Session is not in progress")
    const updated = await withTransaction(async (tx) => {
      await repos.replaceSets(tx, input.id, input.exercises)
      return repos.updateHeader(tx, input.id, { activeSeconds: input.activeSeconds })
    })
    logger.info({ event: "session.synced", userId, sessionId: input.id }, "session synced")
    return toStateAck(updated)
  }

  const day = await repos.findOwnedDay(userId, input.routineDayId)
  if (!day) throw new NotFoundError("Routine day not found")
  if (input.snapshot.routineDayId !== input.routineDayId) {
    throw new ValidationError("Snapshot does not match the routine day")
  }
  if (input.exercises.length === 0) throw new ConflictError("This day has no exercises")
  const exerciseIds = input.exercises
    .map((exercise) => exercise.exerciseId)
    .filter((id): id is string => id !== null)
  const known = await repos.existingExerciseIds(exerciseIds)
  for (const exerciseId of exerciseIds) {
    if (!known.has(exerciseId)) throw new ValidationError(`Unknown exercise: ${exerciseId}`)
  }

  const created = await withTransaction(async (tx) => {
    const abandoned = await repos.abandonOtherInProgress(tx, userId, input.id)
    if (abandoned.count > 0) {
      logger.info(
        { event: "session.conflict-resolved", userId, sessionId: input.id, abandoned: abandoned.count },
        "conflict resolved",
      )
    }
    return repos.createSessionFromUpsert(tx, userId, input)
  })
  logger.info({ event: "session.started", userId, sessionId: created.id }, "session started")
  return toStateAck(created)
}

export async function completeSession(
  userId: string,
  id: string,
  activeSeconds: number,
): Promise<SessionStateAck> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status === "completed") return toStateAck(session)
  if (session.status === "abandoned") throw new ConflictError("Session is not in progress")
  const done = await repos.setStatus(id, "completed", { completedAt: new Date(), activeSeconds })
  logger.info({ event: "session.completed", userId, sessionId: id }, "session completed")
  return toStateAck(done)
}

export async function abandonSession(userId: string, id: string): Promise<void> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status === "abandoned") return
  if (session.status === "completed") throw new ConflictError("Session is not in progress")
  await repos.setStatus(id, "abandoned", {})
  logger.info({ event: "session.abandoned", userId, sessionId: id }, "session abandoned")
}
```

Also update `SessionExerciseWriteInput` to include `order`? It never had it; `replaceSets` doesn't use order. Keep as-is (it already lacks order). Ensure `toStateAck(session)` type-checks: `SessionRecord` is a superset of `SessionAckRecord`, so it is structurally assignable.

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `pnpm test:integration -- tests/integration/session-upsert.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Update the existing session-service test to the upsert flow**

Rewrite `tests/integration/session-service.test.ts` to use `upsertSession` + `buildLocalSession`/`toUpsertPayload` in place of `startSession`/`replaceSessionState`. Preserve every existing assertion (snapshot freeze, seeded sets, lastPerformance, swap provenance, ownership). The "second start conflicts" case becomes "second upsert abandons the first" (already covered in the new file) — drop the duplicate conflict assertion from this file.

- [ ] **Step 7: Run the whole integration suite**

Run: `pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/repositories/session.repository.ts src/server/services/session.service.ts tests/integration/session-upsert.test.ts tests/integration/session-service.test.ts
git commit -m "feat(sessions): idempotent client-id upsert and terminal-state idempotency"
```

---

### Task 6: API routes for upsert and idempotent terminal states

**Files:**
- Modify: `src/app/api/sessions/[sessionId]/route.ts`
- Delete: `src/app/api/sessions/route.ts`
- Test: `tests/unit/sessions-route.test.ts`

**Interfaces:**
- Consumes: `sessionUpsertSchema` (Task 4), `upsertSession` (Task 5).
- Produces: `PUT /api/sessions/{uuid}` returns the `SessionStateAck`; `POST .../complete` and `.../abandon` unchanged in shape.

- [ ] **Step 1: Replace the route unit test**

```ts
import { describe, expect, expectTypeOf, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/session.service", () => ({
  getActiveSession: vi.fn(async () => null),
  getSession: vi.fn(async () => null),
  upsertSession: vi.fn(async () => ({ id: "s1", status: "in_progress", activeSeconds: 0, completedAt: null })),
}))

import { GET as ACTIVE } from "@/app/api/sessions/active/route"
import { PUT } from "@/app/api/sessions/[sessionId]/route"
import type { SessionDTO as ServerSessionDTO } from "@/server/services/session.service"
import type { SessionDTO } from "@/features/workouts/hooks/use-active-session"

const ID = "33333333-3333-4333-8333-333333333333"
const SE = "11111111-1111-4111-8111-111111111111"
const body = {
  id: ID, routineDayId: "d1", name: "Push", startedAt: new Date().toISOString(), activeSeconds: 0,
  snapshot: { routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push", exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: 40, timerType: "none", workSeconds: null, rounds: null }] },
  exercises: [{ id: SE, exerciseId: "e1", nameSnapshot: "Squat", completed: false, skipped: false, notes: null, sets: [] }],
}

function ctx(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) }
}

describe("/api/sessions", () => {
  it("active returns null when none", async () => {
    const res = await ACTIVE()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: null })
  })
  it("PUT rejects a non-uuid session id", async () => {
    const res = await PUT(new Request("http://x/api/sessions/nope", { method: "PUT", body: JSON.stringify(body) }), ctx("nope"))
    expect(res.status).toBe(400)
  })
  it("PUT rejects a body whose id disagrees with the path", async () => {
    const res = await PUT(new Request("http://x/api/sessions/" + ID, { method: "PUT", body: JSON.stringify(body) }), ctx("44444444-4444-4444-8444-444444444444"))
    expect(res.status).toBe(400)
  })
  it("PUT upserts with 200", async () => {
    const res = await PUT(new Request("http://x/api/sessions/" + ID, { method: "PUT", body: JSON.stringify(body) }), ctx(ID))
    expect(res.status).toBe(200)
  })
})

describe("SessionDTO", () => {
  it("is structurally identical to the server DTO", () => {
    expectTypeOf<ServerSessionDTO>().toEqualTypeOf<SessionDTO>()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/sessions-route.test.ts`
Expected: FAIL — the route still parses `sessionStateSchema`.

- [ ] **Step 3: Rewrite the PUT route**

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { sessionUpsertSchema } from "@/features/workouts/schemas/session"
import { getSession, upsertSession } from "@/server/services/session.service"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, ctx: RouteContext<"/api/sessions/[sessionId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { sessionId } = await ctx.params
    return ok(await getSession(session.user.id, sessionId))
  } catch (error) {
    return toApiError(error)
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/sessions/[sessionId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { sessionId } = await ctx.params
    if (!UUID.test(sessionId)) throw new ValidationError("Invalid session id")
    const parsed = sessionUpsertSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid session state", parsed.error.flatten())
    if (parsed.data.id !== sessionId) throw new ValidationError("Session id mismatch")
    return ok(await upsertSession(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
```

- [ ] **Step 4: Delete the retired start route**

```bash
git rm src/app/api/sessions/route.ts
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/sessions-route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: errors in `use-start-session.ts` and `workout/page.tsx` (they call `POST /sessions`), fixed in Task 12. Errors in `session.service.ts`/repository for removed functions are not expected. If `src/app/api/sessions/route.ts` is referenced by `next typegen`, deleting it is sufficient.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sessions/[sessionId]/route.ts tests/unit/sessions-route.test.ts
git rm --cached src/app/api/sessions/route.ts 2>/dev/null || true
git commit -m "feat(api): upsert sessions by client uuid; retire POST start"
```

---

### Task 7: IndexedDB store

**Files:**
- Create: `src/lib/offline/db.ts`
- Modify: `tests/setup.ts` (add `fake-indexeddb`)
- Modify: `package.json` (add `idb`, `fake-indexeddb`)
- Test: `tests/unit/offline-db.test.ts`

**Interfaces:**
- Consumes: `idb`.
- Produces:
  - `type SyncOp = "upsert" | "complete" | "abandon"`
  - `type OutboxStatus = "pending" | "syncing" | "error"`
  - `type OutboxRecord = { sessionId: string; op: SyncOp; payload: unknown; updatedAt: number; status: OutboxStatus; lastError?: string }`
  - `type ActiveSessionRecord = { id: "active"; value: unknown; updatedAt: number }`
  - `getDb()`, `closeDb()`, `putOutbox`, `getOutbox`, `listOutbox`, `deleteOutbox`, `putActiveSession`, `getActiveSession`, `deleteActiveSession`

- [ ] **Step 1: Add dependencies**

```bash
pnpm add idb
pnpm add -D fake-indexeddb
```

- [ ] **Step 2: Add fake IndexedDB to the unit setup**

Append to `tests/setup.ts`:

```ts
// jsdom ships no IndexedDB; the offline store tests exercise the real `idb`
// API against an in-memory implementation.
import "fake-indexeddb/auto"
```

- [ ] **Step 3: Write the failing test**

```ts
import { afterEach, describe, expect, it } from "vitest"
import {
  closeDb, deleteActiveSession, deleteOutbox, getActiveSession, getOutbox, listOutbox,
  putActiveSession, putOutbox,
} from "@/lib/offline/db"

afterEach(async () => { await closeDb() })

describe("offline db", () => {
  it("round-trips outbox rows keyed by session id", async () => {
    await putOutbox({ sessionId: "s1", op: "upsert", payload: { a: 1 }, updatedAt: 1, status: "pending" })
    await putOutbox({ sessionId: "s2", op: "abandon", payload: null, updatedAt: 2, status: "pending" })
    expect((await getOutbox("s1"))?.payload).toEqual({ a: 1 })
    expect((await listOutbox()).map((r) => r.sessionId).sort()).toEqual(["s1", "s2"])
    await deleteOutbox("s1")
    expect(await getOutbox("s1")).toBeUndefined()
  })

  it("stores a single active-session record", async () => {
    await putActiveSession({ id: "active", value: { sessionId: "s1" }, updatedAt: 5 })
    expect((await getActiveSession())?.value).toEqual({ sessionId: "s1" })
    await deleteActiveSession()
    expect(await getActiveSession()).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/offline-db.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `src/lib/offline/db.ts`**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from "idb"

export type SyncOp = "upsert" | "complete" | "abandon"
export type OutboxStatus = "pending" | "syncing" | "error"

export type OutboxRecord = {
  sessionId: string
  op: SyncOp
  payload: unknown
  updatedAt: number
  status: OutboxStatus
  lastError?: string
}

export type ActiveSessionRecord = {
  id: "active"
  value: unknown
  updatedAt: number
}

interface GymDB extends DBSchema {
  outbox: { key: string; value: OutboxRecord }
  activeSession: { key: string; value: ActiveSessionRecord }
}

const DB_NAME = "gym-offline"
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<GymDB>> | null = null

export function getDb(): Promise<IDBPDatabase<GymDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GymDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("outbox", { keyPath: "sessionId" })
        db.createObjectStore("activeSession", { keyPath: "id" })
      },
    })
  }
  return dbPromise
}

/** Closes and drops the cached handle (used by tests between cases). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  db.close()
  dbPromise = null
}

export async function putOutbox(record: OutboxRecord): Promise<void> {
  await (await getDb()).put("outbox", record)
}

export async function getOutbox(sessionId: string): Promise<OutboxRecord | undefined> {
  return (await getDb()).get("outbox", sessionId)
}

export async function listOutbox(): Promise<OutboxRecord[]> {
  return (await getDb()).getAll("outbox")
}

export async function deleteOutbox(sessionId: string): Promise<void> {
  await (await getDb()).delete("outbox", sessionId)
}

export async function putActiveSession(record: ActiveSessionRecord): Promise<void> {
  await (await getDb()).put("activeSession", record)
}

export async function getActiveSession(): Promise<ActiveSessionRecord | undefined> {
  return (await getDb()).get("activeSession", "active")
}

export async function deleteActiveSession(): Promise<void> {
  await (await getDb()).delete("activeSession", "active")
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/offline-db.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/offline/db.ts tests/setup.ts tests/unit/offline-db.test.ts package.json pnpm-lock.yaml
git commit -m "feat(offline): indexeddb store for outbox and active session"
```

---

### Task 8: Sync engine

**Files:**
- Create: `src/lib/offline/sync.ts`
- Test: `tests/unit/offline-sync.test.ts`

**Interfaces:**
- Consumes: `db` functions (Task 7); `SessionUpsertPayload` (Task 3).
- Produces:
  - `type OutboxPayload = { state: unknown; activeSeconds: number }`
  - `enqueue(op: SyncOp, sessionId: string, payload: OutboxPayload): Promise<void>`
  - `flushOutbox(deps?: SyncDeps): Promise<FlushResult>` where `SyncDeps = { fetchImpl?: typeof fetch; now?: () => number }`, `FlushResult = { synced: number; pending: number; failed: boolean }`
  - `onOutboxChange(listener: () => void): () => void`
  - `registerBackgroundSync(): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, getOutbox, listOutbox, putOutbox } from "@/lib/offline/db"
import { enqueue, flushOutbox } from "@/lib/offline/sync"

beforeEach(async () => { await closeDb() })
afterEach(async () => { await closeDb() })

function json(status: number) {
  return new Response(JSON.stringify({ data: {} }), { status, headers: { "Content-Type": "application/json" } })
}

describe("sync engine", () => {
  it("coalesces an upsert into a later upsert (one row, latest payload)", async () => {
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 1 })
    await enqueue("upsert", "s1", { state: { v: 2 }, activeSeconds: 2 })
    const rows = await listOutbox()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.op).toBe("upsert")
    expect((rows[0]?.payload as { state: { v: number } }).state.v).toBe(2)
  })

  it("lets complete supersede an upsert but keeps the state payload", async () => {
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 1 })
    await enqueue("complete", "s1", { state: { v: 2 }, activeSeconds: 9 })
    const row = await getOutbox("s1")
    expect(row?.op).toBe("complete")
    expect((row?.payload as { activeSeconds: number }).activeSeconds).toBe(9)
  })

  it("flushes upsert with PUT and clears the row", async () => {
    const fetchImpl = vi.fn(async () => json(200)) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: { v: 1 }, activeSeconds: 3 })
    const result = await flushOutbox({ fetchImpl })
    expect(result).toEqual({ synced: 1, pending: 0, failed: false })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe("/api/sessions/s1")
    expect(await listOutbox()).toHaveLength(0)
  })

  it("flushes complete as PUT then POST /complete", async () => {
    const calls: { url: string; method: string }[] = []
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET" })
      return json(200)
    }) as unknown as typeof fetch
    await enqueue("complete", "s1", { state: { v: 1 }, activeSeconds: 7 })
    const result = await flushOutbox({ fetchImpl })
    expect(result.synced).toBe(1)
    expect(calls).toEqual([
      { url: "/api/sessions/s1", method: "PUT" },
      { url: "/api/sessions/s1/complete", method: "POST" },
    ])
  })

  it("keeps the row on a retryable 500 and reports failure", async () => {
    const fetchImpl = vi.fn(async () => json(500)) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 })
    const result = await flushOutbox({ fetchImpl })
    expect(result).toEqual({ synced: 0, pending: 1, failed: true })
    expect((await getOutbox("s1"))?.status).toBe("pending")
  })

  it("marks a non-retryable 400 as error", async () => {
    const fetchImpl = vi.fn(async () => json(400)) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 })
    const result = await flushOutbox({ fetchImpl })
    expect(result.failed).toBe(true)
    expect((await getOutbox("s1"))?.status).toBe("error")
  })

  it("treats a network throw as retryable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline") }) as unknown as typeof fetch
    await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 })
    const result = await flushOutbox({ fetchImpl })
    expect(result).toEqual({ synced: 0, pending: 1, failed: true })
  })

  it("deletes an abandon row on 404 (never synced)", async () => {
    const fetchImpl = vi.fn(async () => json(404)) as unknown as typeof fetch
    await enqueue("abandon", "s1", { state: {}, activeSeconds: 0 })
    await flushOutbox({ fetchImpl })
    expect(await listOutbox()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/offline-sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/offline/sync.ts`**

```ts
import {
  deleteOutbox, getOutbox, listOutbox, putOutbox,
  type OutboxRecord, type SyncOp,
} from "./db"

export type OutboxPayload = { state: unknown; activeSeconds: number }
export type FlushResult = { synced: number; pending: number; failed: boolean }
export type SyncDeps = { fetchImpl?: typeof fetch; now?: () => number }

const listeners = new Set<() => void>()

export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  for (const listener of listeners) listener()
}

export async function enqueue(
  op: SyncOp,
  sessionId: string,
  payload: OutboxPayload,
  deps: { now?: () => number } = {},
): Promise<void> {
  const now = deps.now ?? (() => Date.now())
  const existing = await getOutbox(sessionId)
  const record: OutboxRecord = {
    sessionId,
    op: op === "upsert" && existing && existing.op !== "upsert" ? existing.op : op,
    payload,
    updatedAt: now(),
    status: "pending",
  }
  await putOutbox(record)
  notify()
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function send(
  fetchImpl: typeof fetch,
  url: string,
  method: string,
  body?: unknown,
): Promise<Response> {
  return fetchImpl(url, {
    method,
    credentials: "same-origin",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
}

async function flushRecord(fetchImpl: typeof fetch, record: OutboxRecord): Promise<"synced" | "retry" | "error" | "gone"> {
  const payload = record.payload as OutboxPayload
  try {
    if (record.op === "upsert") {
      const res = await send(fetchImpl, `/api/sessions/${record.sessionId}`, "PUT", payload.state)
      if (res.ok) return "synced"
      return isRetryableStatus(res.status) ? "retry" : "error"
    }
    if (record.op === "abandon") {
      const res = await send(fetchImpl, `/api/sessions/${record.sessionId}/abandon`, "POST")
      if (res.ok || res.status === 404) return "synced"
      return isRetryableStatus(res.status) ? "retry" : "error"
    }
    // complete: push the final state, then finalize.
    const put = await send(fetchImpl, `/api/sessions/${record.sessionId}`, "PUT", payload.state)
    if (!put.ok) return isRetryableStatus(put.status) ? "retry" : "error"
    const post = await send(fetchImpl, `/api/sessions/${record.sessionId}/complete`, "POST", { activeSeconds: payload.activeSeconds })
    if (post.ok) return "synced"
    return isRetryableStatus(post.status) ? "retry" : "error"
  } catch {
    return "retry"
  }
}

let inFlight: Promise<FlushResult> | null = null

export async function flushOutbox(deps: SyncDeps = {}): Promise<FlushResult> {
  if (inFlight) return inFlight
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => Date.now())
  inFlight = (async () => {
    const rows = (await listOutbox()).sort((a, b) => a.updatedAt - b.updatedAt)
    let synced = 0
    let failed = false
    for (const row of rows) {
      await putOutbox({ ...row, status: "syncing" })
      const outcome = await flushRecord(fetchImpl, row)
      if (outcome === "synced") {
        await deleteOutbox(row.sessionId)
        synced += 1
        continue
      }
      if (outcome === "retry") {
        await putOutbox({ ...row, status: "pending", updatedAt: now() })
        failed = true
        break
      }
      await putOutbox({ ...row, status: "error" })
      failed = true
      break
    }
    const pending = (await listOutbox()).length
    notify()
    return { synced, pending, failed }
  })()
  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

export async function registerBackgroundSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.ready
    const sync = (registration as unknown as { sync?: { register: (tag: string) => Promise<void> } })?.sync
    await sync?.register("gym-session-sync")
  } catch {
    // Background Sync is a progressive enhancement.
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/offline-sync.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/sync.ts tests/unit/offline-sync.test.ts
git commit -m "feat(offline): coalescing outbox sync engine"
```

---

### Task 9: Active-session persistence

**Files:**
- Create: `src/features/workouts/lib/session-persistence.ts`
- Test: `tests/unit/session-persistence.test.ts`

**Interfaces:**
- Consumes: `db` functions (Task 7); `SessionStoreSource`; `TimerState` (Task 1); `SessionSnapshot` (Task 2).
- Produces: `type PersistedSession = { source: SessionStoreSource; snapshot: SessionSnapshot | null; routineDayId: string | null; timer: TimerState | null; paused: boolean }`; `saveActiveSession(value, now?)`, `loadActiveSession()`, `clearActiveSession()`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "@/lib/offline/db"
import {
  clearActiveSession, loadActiveSession, saveActiveSession, type PersistedSession,
} from "@/features/workouts/lib/session-persistence"

afterEach(async () => { await closeDb() })

const value: PersistedSession = {
  source: { id: "s1", name: "Push", status: "in_progress", startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 3, exercises: [] },
  snapshot: null, routineDayId: "d1", timer: null, paused: false,
}

describe("session persistence", () => {
  it("round-trips and clears the active session", async () => {
    await saveActiveSession(value)
    expect(await loadActiveSession()).toEqual(value)
    await clearActiveSession()
    expect(await loadActiveSession()).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/session-persistence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `session-persistence.ts`**

```ts
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"
import type { TimerState } from "@/features/workouts/lib/timer"
import type { SessionStoreSource } from "@/features/workouts/stores/session-store"
import { deleteActiveSession, getActiveSession, putActiveSession } from "@/lib/offline/db"

export type PersistedSession = {
  source: SessionStoreSource
  snapshot: SessionSnapshot | null
  routineDayId: string | null
  timer: TimerState | null
  paused: boolean
}

export async function saveActiveSession(
  value: PersistedSession,
  now: number = Date.now(),
): Promise<void> {
  await putActiveSession({ id: "active", value, updatedAt: now })
}

export async function loadActiveSession(): Promise<PersistedSession | undefined> {
  const record = await getActiveSession()
  return record?.value as PersistedSession | undefined
}

export async function clearActiveSession(): Promise<void> {
  await deleteActiveSession()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/session-persistence.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/features/workouts/lib/session-persistence.ts tests/unit/session-persistence.test.ts
git commit -m "feat(offline): persist the active session locally"
```

---

### Task 10: Offline i18n copy

**Files:**
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/es.json`
- Modify: `tests/unit/runner-messages.test.ts`
- Create: `tests/unit/offline-messages.test.ts`

**Interfaces:**
- Produces keys: `offline.status.{offline,syncing,synced,pending}`, `offline.retry`, `offline.install.{title,body,action,dismiss}`, `offline.page.{title,body}`, `timers.{notifyOn,notifyOff,notifyBlocked}`.

- [ ] **Step 1: Add the English keys**

Merge into the top level of `src/i18n/messages/en.json` (keep all existing keys):

```json
"offline": {
  "status": { "offline": "Offline", "syncing": "Syncing ({count})", "synced": "Synced", "pending": "{count} to sync" },
  "retry": "Retry sync",
  "install": { "title": "Install the app", "body": "Add Gym Tracker to your home screen for offline workouts.", "action": "Install", "dismiss": "Not now" },
  "page": { "title": "You're offline", "body": "This page isn't available offline yet. Your workout is saved and will sync when you're back online." }
}
```

And add to the existing `timers` object:

```json
"notifyOn": "Alerts on",
"notifyOff": "Alerts off",
"notifyBlocked": "Alerts blocked"
```

- [ ] **Step 2: Add the Spanish keys (identical key set)**

```json
"offline": {
  "status": { "offline": "Sin conexión", "syncing": "Sincronizando ({count})", "synced": "Sincronizado", "pending": "{count} por sincronizar" },
  "retry": "Reintentar sincronización",
  "install": { "title": "Instala la app", "body": "Añade Gym Tracker a tu pantalla de inicio para entrenar sin conexión.", "action": "Instalar", "dismiss": "Ahora no" },
  "page": { "title": "Estás sin conexión", "body": "Esta página aún no está disponible sin conexión. Tu entrenamiento está guardado y se sincronizará cuando vuelvas a estar en línea." }
}
```

```json
"notifyOn": "Alertas activadas",
"notifyOff": "Alertas desactivadas",
"notifyBlocked": "Alertas bloqueadas"
```

- [ ] **Step 3: Add the new timer keys to the runner copy test**

In `tests/unit/runner-messages.test.ts`, append to `RUNNER_KEYS`:

```ts
  "timers.notifyOn",
  "timers.notifyOff",
  "timers.notifyBlocked",
```

- [ ] **Step 4: Add the offline copy test**

```ts
import { describe, expect, it } from "vitest"

import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

type Dict = Record<string, unknown>
const dicts: [string, Dict][] = [["en", en as Dict], ["es", es as Dict]]

function at(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Dict)[key]
    return undefined
  }, dict)
}

const OFFLINE_KEYS = [
  "offline.status.offline", "offline.status.syncing", "offline.status.synced", "offline.status.pending",
  "offline.retry", "offline.install.title", "offline.install.body", "offline.install.action",
  "offline.install.dismiss", "offline.page.title", "offline.page.body",
] as const

describe("offline copy", () => {
  it("defines every offline key in both locales", () => {
    for (const [locale, m] of dicts) {
      for (const key of OFFLINE_KEYS) {
        const value = at(m, key)
        expect(typeof value === "string" && value.trim().length > 0, `${locale}:${key}`).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 5: Run the i18n tests**

Run: `pnpm test -- tests/unit/i18n.test.ts tests/unit/runner-messages.test.ts tests/unit/offline-messages.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/es.json tests/unit/runner-messages.test.ts tests/unit/offline-messages.test.ts
git commit -m "feat(i18n): offline and timer-alert copy (en/es)"
```

---

### Task 11: Online and sync-status hooks

**Files:**
- Create: `src/lib/offline/use-online.ts`
- Test: `tests/unit/use-online.test.tsx`

**Interfaces:**
- Consumes: `db`/`sync` (Tasks 7–8).
- Produces: `useOnlineStatus(): boolean`; `type SyncStatus = { online: boolean; pending: number; syncing: boolean; flush: () => void }`; `useSyncStatus(): SyncStatus`.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { closeDb } from "@/lib/offline/db"
import { enqueue } from "@/lib/offline/sync"
import { useOnlineStatus, useSyncStatus } from "@/lib/offline/use-online"

afterEach(async () => { await closeDb() })

describe("offline hooks", () => {
  it("reports online status and reflects pending outbox rows", async () => {
    const online = renderHook(() => useOnlineStatus())
    expect(online.result.current).toBe(true)

    const status = renderHook(() => useSyncStatus())
    expect(status.result.current.pending).toBe(0)
    await act(async () => { await enqueue("upsert", "s1", { state: {}, activeSeconds: 0 }) })
    await waitFor(() => expect(status.result.current.pending).toBe(1))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/use-online.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `use-online.ts`**

```ts
"use client"

import { useCallback, useEffect, useState } from "react"
import { listOutbox } from "./db"
import { flushOutbox, onOutboxChange } from "./sync"

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
    }
  }, [])
  return online
}

export type SyncStatus = {
  online: boolean
  pending: number
  syncing: boolean
  flush: () => void
}

export function useSyncStatus(): SyncStatus {
  const online = useOnlineStatus()
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    setPending((await listOutbox()).length)
  }, [])

  const flush = useCallback(() => {
    setSyncing(true)
    void flushOutbox().finally(() => {
      setSyncing(false)
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    void refresh()
    const off = onOutboxChange(() => void refresh())
    const onOnline = () => flush()
    window.addEventListener("online", onOnline)
    return () => {
      off()
      window.removeEventListener("online", onOnline)
    }
  }, [flush, refresh])

  return { online, pending, syncing, flush }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/use-online.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/offline/use-online.ts tests/unit/use-online.test.tsx
git commit -m "feat(offline): online and sync-status hooks"
```

---

### Task 12: Session store snapshot meta, client start, and workout page

**Files:**
- Modify: `src/features/workouts/stores/session-store.ts`
- Modify: `src/features/workouts/hooks/use-start-session.ts`
- Modify: `src/app/[locale]/(app)/workout/page.tsx`
- Test: `tests/unit/session-store.test.ts` (append), `tests/unit/workout-page.test.tsx` (update)

**Interfaces:**
- Consumes: `buildLocalSession`/`toUpsertPayload` (Task 3), `saveActiveSession`/`loadActiveSession` (Task 9), `enqueue` (Task 8), `SessionSnapshot` (Task 2).
- Produces:
  - Store gains `snapshot: SessionSnapshot | null`, `routineDayId: string | null`, `hydrate(session, meta?)`, `toUpsertPayload(activeSeconds): SessionUpsertPayload | null`.
  - `useStartSession()` mutation now takes `{ routine: RoutineDTO; dayId: string }` and returns `LocalSession`.
  - `WorkoutRunner` gains an exported `RunnerSessionInput` type and its prop becomes `{ session: RunnerSessionInput }` (introduced here so `workout/page.tsx` can import it; Task 13 removes the old push machinery).

- [ ] **Step 1: Append store tests**

Add to `tests/unit/session-store.test.ts`:

```ts
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"

const snapshot: SessionSnapshot = {
  routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push",
  exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 3, targetReps: "10", restSeconds: 60, targetWeightKg: 40, timerType: "none", workSeconds: null, rounds: null }],
}

describe("session store upsert meta", () => {
  beforeEach(() => useSessionStore.getState().reset())

  it("builds an upsert payload only once snapshot meta is present", () => {
    useSessionStore.getState().hydrate(session)
    expect(useSessionStore.getState().toUpsertPayload(0)).toBeNull()
    useSessionStore.getState().hydrate(session, { snapshot, routineDayId: "d1" })
    const payload = useSessionStore.getState().toUpsertPayload(42)
    expect(payload?.id).toBe("s1")
    expect(payload?.activeSeconds).toBe(42)
    expect(payload?.snapshot.routineDayId).toBe("d1")
    expect(payload?.exercises[0]?.id).toBe("se1")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/session-store.test.ts`
Expected: FAIL — `toUpsertPayload` is not a function.

- [ ] **Step 3: Update `session-store.ts`**

Add imports and state fields:

```ts
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"
import type { SessionUpsertPayload } from "@/features/workouts/lib/build-local-session"
```

Add to `SessionState`: `snapshot: SessionSnapshot | null`, `routineDayId: string | null`, and change the signatures:

```ts
  hydrate: (
    session: SessionStoreSource,
    meta?: { snapshot?: SessionSnapshot | null; routineDayId?: string | null },
  ) => void
  toUpsertPayload: (activeSeconds: number) => SessionUpsertPayload | null
```

Add to `emptyState`: `snapshot: null, routineDayId: null`.

Replace `hydrate` and add `toUpsertPayload`:

```ts
  hydrate: (session, meta) => {
    const current = get()
    if (session.id === current.sessionId && current.isDirty) {
      set({
        ...(meta?.snapshot !== undefined ? { snapshot: meta.snapshot } : {}),
        ...(meta?.routineDayId !== undefined ? { routineDayId: meta.routineDayId } : {}),
      })
      return
    }
    set({
      sessionId: session.id,
      name: session.name,
      status: session.status,
      startedAt: session.startedAt,
      activeSeconds: session.activeSeconds,
      exercises: withDerivedCompletion(session.exercises.map(toExerciseState)),
      currentIndex: 0,
      isDirty: false,
      snapshot: meta?.snapshot ?? null,
      routineDayId: meta?.routineDayId ?? null,
    })
  },

  toUpsertPayload: (activeSeconds) => {
    const { sessionId, name, startedAt, snapshot, routineDayId, exercises } = get()
    if (!sessionId || !startedAt || !snapshot || !routineDayId) return null
    return {
      id: sessionId,
      routineDayId,
      name,
      startedAt,
      activeSeconds,
      snapshot,
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        nameSnapshot: exercise.nameSnapshot,
        swappedFromId: exercise.swappedFromId,
        completed: exercise.completed,
        skipped: exercise.skipped,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          ...(set.id ? { id: set.id } : {}),
          setNumber: set.setNumber,
          type: set.type,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds,
          rpe: set.rpe,
          restSecondsLogged: set.restSecondsLogged,
          completedAt: set.completedAt,
        })),
      })),
    }
  },
```

- [ ] **Step 4: Replace `use-start-session.ts`**

```ts
"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import {
  buildLocalSession, toUpsertPayload, type LocalSession,
} from "@/features/workouts/lib/build-local-session"
import { saveActiveSession } from "@/features/workouts/lib/session-persistence"
import { useSessionStore } from "@/features/workouts/stores/session-store"
import { enqueue } from "@/lib/offline/sync"
import { sessionKeys } from "./query-keys"

export type StartSessionArgs = { routine: RoutineDTO; dayId: string }

export function useStartSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ routine, dayId }: StartSessionArgs): Promise<LocalSession> => {
      const day = routine.days.find((candidate) => candidate.id === dayId)
      if (!day) throw new Error("Routine day not found")
      const local = buildLocalSession(routine, day)
      useSessionStore.getState().hydrate(local.source, {
        snapshot: local.snapshot,
        routineDayId: local.routineDayId,
      })
      await saveActiveSession({
        source: local.source,
        snapshot: local.snapshot,
        routineDayId: local.routineDayId,
        timer: null,
        paused: false,
      })
      await enqueue("upsert", local.source.id, {
        state: toUpsertPayload(local, 0),
        activeSeconds: 0,
      })
      return local
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.active() })
    },
  })
}
```

- [ ] **Step 5: Rewrite `workout/page.tsx`**

**First**, in `src/features/workouts/components/workout-runner.tsx`, export the narrowed prop type and change the component signature (the push machinery is still present here; Task 13 removes it):

```ts
export type RunnerSessionInput = {
  id: string
  exercises: {
    exerciseId: string | null
    timerType: SessionTimerType | null
    workSeconds: number | null
    restSeconds: number | null
    rounds: number | null
    exercise: { id: string; name: string; nameEs: string | null; images: string[] } | null
    lastPerformance: { reps: number | null; weightKg: number | null; date: string } | null
  }[]
}
```

```ts
export function WorkoutRunner({ session }: { session: RunnerSessionInput }) {
```
Then rewrite `src/app/[locale]/(app)/workout/page.tsx`:

```tsx
"use client"

import { Barbell, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveRoutine } from "@/features/routines/hooks/use-active-routine"
import { DayChooser } from "@/features/workouts/components/day-chooser"
import {
  WorkoutRunner,
  type RunnerSessionInput,
} from "@/features/workouts/components/workout-runner"
import { useActiveSession } from "@/features/workouts/hooks/use-active-session"
import { useStartSession } from "@/features/workouts/hooks/use-start-session"
import {
  loadActiveSession, saveActiveSession, type PersistedSession,
} from "@/features/workouts/lib/session-persistence"
import {
  useSessionStore,
  type SessionStoreSource,
} from "@/features/workouts/stores/session-store"

function WorkoutSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  )
}

function toRunnerInput(persisted: PersistedSession): RunnerSessionInput {
  return {
    id: persisted.source.id,
    exercises: persisted.source.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      timerType: exercise.timerType,
      workSeconds: exercise.workSeconds,
      restSeconds: exercise.restSeconds,
      rounds: exercise.rounds,
      exercise: null,
      lastPerformance: null,
    })),
  }
}

export default function WorkoutPage() {
  const t = useTranslations("runner")
  const tCommon = useTranslations("common")
  const locale = useLocale()

  const session = useActiveSession()
  const routine = useActiveRoutine()
  const start = useStartSession()
  const hydrate = useSessionStore((state) => state.hydrate)

  const [local, setLocal] = useState<PersistedSession | null>(null)
  const [localLoaded, setLocalLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void loadActiveSession().then((value) => {
      if (!active) return
      setLocal(value ?? null)
      setLocalLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  const serverSession = session.data ?? null
  const localSource = local?.source ?? null
  const localWins = Boolean(
    localSource &&
      localSource.status === "in_progress" &&
      (!serverSession || serverSession.id !== localSource.id),
  )
  const chosen: RunnerSessionInput | null = localWins && local
    ? toRunnerInput(local)
    : serverSession

  useEffect(() => {
    if (!chosen) return
    if (useSessionStore.getState().sessionId === chosen.id) return
    const source: SessionStoreSource | null = localWins && local ? local.source : serverSession
    if (!source) return
    hydrate(source, {
      snapshot: localWins && local ? local.snapshot : null,
      routineDayId: localWins && local ? local.routineDayId : serverSession?.routineDayId ?? null,
    })
  }, [chosen, hydrate, local, localWins, serverSession])

  // Adopt a server session into local storage so a later offline reload resumes it.
  useEffect(() => {
    if (!serverSession || !localLoaded) return
    if (local?.source.id === serverSession.id) return
    const value: PersistedSession = {
      source: serverSession,
      snapshot: null,
      routineDayId: serverSession.routineDayId,
      timer: null,
      paused: false,
    }
    setLocal(value)
    void saveActiveSession(value)
  }, [serverSession, local, localLoaded])

  useEffect(() => {
    if (start.data) {
      setLocal({
        source: start.data.source,
        snapshot: start.data.snapshot,
        routineDayId: start.data.routineDayId,
        timer: null,
        paused: false,
      })
    }
  }, [start.data])

  const days = useMemo(() => routine.data?.days ?? [], [routine.data])
  const autoStartedRef = useRef(false)
  const startingRef = useRef(false)

  const requestStart = useCallback(
    (dayId: string) => {
      if (startingRef.current || !routine.data) return
      startingRef.current = true
      start.mutate({ routine: routine.data, dayId })
    },
    [routine.data, start],
  )

  useEffect(() => {
    if (session.isLoading || routine.isLoading || !localLoaded) return
    if (chosen) {
      autoStartedRef.current = true
      return
    }
    if (autoStartedRef.current) return
    if (days.length === 1) {
      autoStartedRef.current = true
      requestStart(days[0]!.id)
    }
  }, [chosen, days, routine.isLoading, session.isLoading, localLoaded, requestStart])

  if (chosen) {
    return <WorkoutRunner session={chosen} />
  }

  if (session.isLoading || routine.isLoading || !localLoaded) {
    return <WorkoutSkeleton label={tCommon("loading")} />
  }

  if (session.isError && !start.isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button type="button" variant="outline" className="h-12" onClick={() => void session.refetch()}>
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  if (routine.isError || start.isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => {
              start.reset()
              autoStartedRef.current = false
              startingRef.current = false
              if (days.length === 1) requestStart(days[0]!.id)
              else void routine.refetch()
            }}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  if (!routine.data || days.length === 0) {
    return (
      <EmptyState
        icon={Barbell}
        title={t("noActiveRoutine")}
        action={
          <Button asChild className="h-12">
            <Link href={`/${locale}/routines`}>{t("emptyCta")}</Link>
          </Button>
        }
      />
    )
  }

  if (days.length === 1) {
    return <WorkoutSkeleton label={tCommon("loading")} />
  }

  return (
    <DayChooser routine={routine.data} onPick={(dayId) => requestStart(dayId)} />
  )
}
```

- [ ] **Step 6: Update `tests/unit/workout-page.test.tsx`**

The existing test stubs `useStartSession`. Update its mock to the new `mutate({ routine, dayId })` shape and to the offline-aware page (mock `@/features/workouts/lib/session-persistence` `loadActiveSession` to resolve `undefined`). Keep the existing assertions (chooser renders, single-day auto-start calls `mutate` once).

- [ ] **Step 7: Run the affected unit tests**

Run: `pnpm test -- tests/unit/session-store.test.ts tests/unit/workout-page.test.tsx tests/unit/day-chooser.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/workouts/stores/session-store.ts src/features/workouts/hooks/use-start-session.ts "src/app/[locale]/(app)/workout/page.tsx" tests/unit/session-store.test.ts tests/unit/workout-page.test.tsx
git commit -m "feat(workouts): client-side offline session start and resume"
```

---

### Task 13: Runner sync integration and wall-clock timers

**Files:**
- Create: `src/features/workouts/hooks/use-session-sync.ts`
- Modify: `src/features/workouts/components/workout-runner.tsx`
- Test: `tests/unit/workout-runner.test.tsx` (update), `tests/unit/use-session-sync.test.tsx`

**Interfaces:**
- Consumes: store `toUpsertPayload` (Task 12), `saveActiveSession`/`clearActiveSession` (Task 9), `enqueue`/`flushOutbox`/`registerBackgroundSync` (Task 8), `useSyncStatus` (Task 11), timer functions (Task 1).
- Produces: `useSessionSync(sessionId, getTimer, getPaused): { status: SyncStatus; enqueueState: () => void; complete: (activeSeconds: number) => Promise<void>; abandon: () => Promise<void> }`; `WorkoutRunner`'s exported `RunnerSessionInput` and its prop is now `{ session: RunnerSessionInput }`.

- [ ] **Step 1: Write the sync-hook test**

```tsx
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { closeDb, listOutbox } from "@/lib/offline/db"
import { useSessionStore } from "@/features/workouts/stores/session-store"
import { useSessionSync } from "@/features/workouts/hooks/use-session-sync"
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"

afterEach(async () => { await closeDb(); vi.unstubAllGlobals() })

const snapshot: SessionSnapshot = {
  routineId: "r1", routineDayId: "d1", name: "Push", nameEs: null, weekday: 1, label: "Push",
  exercises: [{ order: 0, name: "Squat", nameEs: null, targetSets: 1, targetReps: "10", restSeconds: 0, targetWeightKg: null, timerType: "none", workSeconds: null, rounds: null }],
}

describe("useSessionSync", () => {
  it("debounces an upsert through the outbox and flushes it", async () => {
    useSessionStore.getState().hydrate(
      { id: "s1", name: "Push", status: "in_progress", startedAt: "2026-01-01T00:00:00.000Z", activeSeconds: 0, exercises: [{ id: "se1", exerciseId: "e1", nameSnapshot: "Squat", targetSets: 1, targetReps: "10", restSeconds: 0, timerType: "none", workSeconds: null, rounds: null, completed: false, skipped: false, swappedFromId: null, notes: null, sets: [] }] },
      { snapshot, routineDayId: "d1" },
    )
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
    vi.stubGlobal("fetch", fetchImpl)
    const { result } = renderHook(() => useSessionSync("s1", () => null, () => false))
    await act(async () => { result.current.enqueueState() })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2100)) })
    expect(fetchImpl).toHaveBeenCalled()
    expect(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toBe("/api/sessions/s1")
    expect((await listOutbox()).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/use-session-sync.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `use-session-sync.ts`**

```ts
"use client"

import { useCallback, useEffect, useRef } from "react"
import { useSessionStore } from "@/features/workouts/stores/session-store"
import type { TimerState } from "@/features/workouts/lib/timer"
import { clearActiveSession, saveActiveSession } from "@/features/workouts/lib/session-persistence"
import { enqueue, flushOutbox, registerBackgroundSync } from "@/lib/offline/sync"
import { useSyncStatus, type SyncStatus } from "@/lib/offline/use-online"

const PUSH_DEBOUNCE_MS = 2000

export function useSessionSync(
  sessionId: string,
  getTimer: () => TimerState | null,
  getPaused: () => boolean,
): {
  status: SyncStatus
  enqueueState: () => void
  complete: (activeSeconds: number) => Promise<void>
  abandon: () => Promise<void>
} {
  const status = useSyncStatus()
  const timerRef = useRef(getTimer)
  const pausedRef = useRef(getPaused)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    timerRef.current = getTimer
    pausedRef.current = getPaused
  })

  const persist = useCallback(() => {
    const store = useSessionStore.getState()
    void saveActiveSession({
      source: {
        id: store.sessionId ?? sessionId,
        name: store.name,
        status: store.status ?? "in_progress",
        startedAt: store.startedAt ?? new Date().toISOString(),
        activeSeconds: store.activeSeconds,
        exercises: store.exercises,
      },
      snapshot: store.snapshot,
      routineDayId: store.routineDayId,
      timer: timerRef.current(),
      paused: pausedRef.current(),
    })
  }, [sessionId])

  const pushUpsert = useCallback(async () => {
    persist()
    const store = useSessionStore.getState()
    const payload = store.toUpsertPayload(store.activeSeconds)
    if (!payload) return
    await enqueue("upsert", sessionId, { state: payload, activeSeconds: payload.activeSeconds })
    void registerBackgroundSync()
    void flushOutbox()
  }, [persist, sessionId])

  const enqueueState = useCallback(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      void pushUpsert()
    }, PUSH_DEBOUNCE_MS)
  }, [pushUpsert])

  const complete = useCallback(
    async (activeSeconds: number) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      const payload = useSessionStore.getState().toUpsertPayload(activeSeconds)
      if (payload) await enqueue("complete", sessionId, { state: payload, activeSeconds })
      const store = useSessionStore.getState()
      await saveActiveSession({
        source: {
          id: store.sessionId ?? sessionId,
          name: store.name,
          status: "completed",
          startedAt: store.startedAt ?? new Date().toISOString(),
          activeSeconds,
          exercises: store.exercises,
        },
        snapshot: store.snapshot,
        routineDayId: store.routineDayId,
        timer: null,
        paused: true,
      })
      void flushOutbox()
    },
    [sessionId],
  )

  const abandon = useCallback(async () => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    await enqueue("abandon", sessionId, { state: null, activeSeconds: 0 })
    await clearActiveSession()
    void flushOutbox()
  }, [sessionId])

  useEffect(() => {
    const onOnline = () => void flushOutbox()
    const onVisibility = () => {
      if (document.visibilityState === "visible") void flushOutbox()
      else if (useSessionStore.getState().isDirty) void pushUpsert()
    }
    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [pushUpsert])

  return { status, enqueueState, complete, abandon }
}
```

- [ ] **Step 4: Run the hook test to verify it passes**

Run: `pnpm test -- tests/unit/use-session-sync.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Update `workout-runner.tsx`**

1. Replace the imports for `useUpdateSession`, `useCompleteSession`, `useAbandonSession`, `getHttpStatus`, `isRetryableSaveError`, and the `api`-backed save types with:

```ts
import { useSessionSync } from "@/features/workouts/hooks/use-session-sync"
```

2. `RunnerSessionInput` and the narrowed `WorkoutRunner` signature were already introduced in Task 12 — no change needed here.

3. Delete the entire push machinery: `PUSH_DEBOUNCE_MS`, `PUSH_MAX_BACKOFF_MS`, `type SaveStatus`, `update`/`complete`/`abandon` mutations, `pushChainRef`, `pushTimerRef`, `pushKeepaliveRef`, `pushingRef`, `pendingPushRef`, `retryAttemptRef`, `runPushRef`, `schedulePush`, `pushState`, `retrySave`, `enqueuePush`, `updateRef`, `sessionConflictRef`, `onSessionConflict`, and the `saveStatus` state. Replace with:

```ts
const sync = useSessionSync(session.id, () => timerRef.current, () => pausedRef.current)
```

4. The debounced-push effect becomes:

```ts
useEffect(() => {
  if (!isDirty) return
  sync.enqueueState()
}, [exercises, isDirty, sync])
```

5. The visibility-change effect (keepalive push) is removed — `useSessionSync` owns visibility/online flushing.

6. Replace the save-status UI block with sync status:

```tsx
<div
  role="status"
  aria-live="polite"
  className="text-muted-foreground flex min-h-5 items-center gap-2 text-xs"
>
  {!sync.status.online ? <span>{t("save.offline")}</span> : null}
  {sync.status.syncing ? <span>{t("save.saving")}</span> : null}
  {sync.status.online && !sync.status.syncing && sync.status.pending > 0 ? (
    <span>{t("save.pending", { count: sync.status.pending })}</span>
  ) : null}
  {sync.status.online && !sync.status.syncing && sync.status.pending === 0 ? (
    <span>{t("save.saved")}</span>
  ) : null}
</div>
```

Add `runner.save.offline` (`"Offline"`) and `runner.save.pending` (`"{count} to sync"`) to both dictionaries and to `RUNNER_KEYS` in `tests/unit/runner-messages.test.ts` (same pattern as Task 10).

7. `handleTogglePause` ends with `sync.enqueueState()` instead of `schedulePush(0)`.

8. `finishSession` becomes:

```ts
async function finishSession() {
  pausedRef.current = true
  setPaused(true)
  const seconds = useSessionStore.getState().activeSeconds
  await sync.complete(seconds)
  reset()
  router.push(`/${locale}/workout/summary/${session.id}`)
}
```

9. `discardSession` becomes:

```ts
async function discardSession() {
  await sync.abandon()
  reset()
  router.push(`/${locale}/dashboard`)
}
```

10. Wall-clock timer calls: `buildExerciseTimer` passes `Date.now()` into `startIntervalTimer(...)`; the ticker uses `tickTimer(running, Date.now())`; `startRestFor` uses `startRestTimer(seconds, Date.now())`; `onAdjust` uses `adjustTimer(running, delta, Date.now())`; interval `onStart`/`onPause`/`onSkipRound` pass `Date.now()`; `handleTogglePause` passes `Date.now()` to `pauseTimer`/`resumeTimer`. Add an immediate `tickTimer(timerRef.current, Date.now())` on `visibilitychange`→visible so a backgrounded countdown re-syncs. Delete `useUpdateSession`/`useCompleteSession`/`useAbandonSession` imports.

11. Remove `onSessionConflict` from the props and the page (Task 12 already stopped passing it).

- [ ] **Step 6: Update `tests/unit/workout-runner.test.tsx`**

Mock `@/features/workouts/hooks/use-session-sync` to return a no-op `{ status: { online: true, pending: 0, syncing: false, flush: vi.fn() }, enqueueState: vi.fn(), complete: vi.fn(async () => {}), abandon: vi.fn(async () => {}) }`. Update the `session` prop to the `RunnerSessionInput` shape (the existing fixture drops `nameSnapshot`/targets, which the store supplies). Keep all existing behavioral assertions (prefill, rest timer on complete, swap/skip, navigation, summary).

- [ ] **Step 7: Run the runner tests**

Run: `pnpm test -- tests/unit/workout-runner.test.tsx tests/unit/use-session-sync.test.tsx tests/unit/rest-timer-bar.test.tsx tests/unit/interval-timer.test.tsx`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (the earlier `use-start-session`/page errors are resolved).

- [ ] **Step 9: Commit**

```bash
git add src/features/workouts/hooks/use-session-sync.ts src/features/workouts/components/workout-runner.tsx tests/unit/use-session-sync.test.tsx tests/unit/workout-runner.test.tsx src/i18n/messages/en.json src/i18n/messages/es.json tests/unit/runner-messages.test.ts
git commit -m "feat(workouts): runner syncs through the durable outbox; wall-clock timers"
```

---

### Task 14: Timer-end notifications

**Files:**
- Create: `src/features/workouts/lib/timer-notifications.ts`
- Modify: `src/features/workouts/components/workout-runner.tsx`
- Test: `tests/unit/timer-notifications.test.ts`

**Interfaces:**
- Consumes: `TimerState` (Task 1); i18n keys (Task 10).
- Produces: `type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported"`; `notificationPermission(): NotificationPermissionState`; `requestNotificationPermission(): Promise<NotificationPermissionState>`; `notifyTimerEnd(title: string, body: string): Promise<void>`; `scheduleTimerNotification(deadlineMs: number | null, title: string, body: string): () => void`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  notificationPermission, requestNotificationPermission, scheduleTimerNotification,
} from "@/features/workouts/lib/timer-notifications"

afterEach(() => { vi.unstubAllGlobals() })

describe("timer notifications", () => {
  it("reports unsupported when Notification is absent", () => {
    vi.stubGlobal("Notification", undefined)
    expect(notificationPermission()).toBe("unsupported")
  })

  it("requests permission when supported", async () => {
    const requestPermission = vi.fn(async () => "granted")
    vi.stubGlobal("Notification", { permission: "default", requestPermission })
    expect(notificationPermission()).toBe("default")
    expect(await requestNotificationPermission()).toBe("granted")
    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it("fires a notification when the deadline elapses and can be cancelled", async () => {
    const showNotification = vi.fn(async () => undefined)
    vi.stubGlobal("Notification", { permission: "granted" })
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { ready: Promise.resolve({ showNotification }) } })
    const cancel = scheduleTimerNotification(Date.now() + 20, "Rest", "Go")
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(showNotification).toHaveBeenCalledOnce()
    cancel()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/timer-notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `timer-notifications.ts`**

```ts
export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported"

const MAX_TIMEOUT_MS = 2_147_483_647

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported"
  return Notification.permission as NotificationPermissionState
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === "undefined") return "unsupported"
  if (Notification.permission !== "default") return Notification.permission as NotificationPermissionState
  return (await Notification.requestPermission()) as NotificationPermissionState
}

export async function notifyTimerEnd(title: string, body: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return
  try {
    const registration = await navigator.serviceWorker?.ready
    await registration?.showNotification(title, { body, tag: "gym-timer" })
  } catch {
    // Notifications are a progressive enhancement.
  }
}

export function scheduleTimerNotification(
  deadlineMs: number | null,
  title: string,
  body: string,
): () => void {
  if (deadlineMs === null) return () => undefined
  const delay = Math.min(Math.max(0, deadlineMs - Date.now()), MAX_TIMEOUT_MS)
  const id = setTimeout(() => {
    void notifyTimerEnd(title, body)
  }, delay)
  return () => clearTimeout(id)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- tests/unit/timer-notifications.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the toggle and schedule into the runner**

In `workout-runner.tsx`:

```ts
import {
  notificationPermission, requestNotificationPermission, scheduleTimerNotification,
} from "@/features/workouts/lib/timer-notifications"
```

Add state and a toggle button beside the sound toggle:

```ts
const [permission, setPermission] = useState<NotificationPermissionState>(() => notificationPermission())
```

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  className="h-9 shrink-0"
  aria-pressed={permission === "granted"}
  disabled={permission === "unsupported"}
  onClick={async () => setPermission(await requestNotificationPermission())}
>
  {permission === "granted" ? tTimers("notifyOn") : permission === "denied" ? tTimers("notifyBlocked") : tTimers("notifyOff")}
</Button>
```

Add the schedule effect (keyed on the deadline, not the ticking state):

```ts
const timerDeadline = timer?.deadline ?? null
const timerRunning = timer?.running ?? false
useEffect(() => {
  if (!timerRunning || timerDeadline === null || permission !== "granted") return
  const title = tTimers(timer?.kind === "interval" ? "interval" : "rest")
  return scheduleTimerNotification(timerDeadline, title, tTimers("running"))
}, [timerDeadline, timerRunning, permission, timer?.kind, tTimers])
```

- [ ] **Step 6: Run the runner test and typecheck**

Run: `pnpm test -- tests/unit/workout-runner.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/workouts/lib/timer-notifications.ts src/features/workouts/components/workout-runner.tsx tests/unit/timer-notifications.test.ts
git commit -m "feat(timers): best-effort end-of-timer notifications"
```

---

### Task 15: Offline summary fallback

**Files:**
- Modify: `src/features/workouts/components/session-summary.tsx`
- Modify: `src/app/[locale]/(app)/workout/summary/[sessionId]/page.tsx`
- Test: `tests/unit/workout-summary.test.tsx` (new)

**Interfaces:**
- Consumes: `loadActiveSession` (Task 9), `SummaryInput` from `@/features/workouts/lib/summary`.
- Produces: `SessionSummary` now accepts `{ session: SummaryInput }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextIntlClientProvider } from "next-intl"
import en from "@/i18n/messages/en.json"
import { closeDb } from "@/lib/offline/db"
import { saveActiveSession } from "@/features/workouts/lib/session-persistence"
import { SessionSummary } from "@/features/workouts/components/session-summary"

vi.mock("@/features/profile/hooks/use-profile", () => ({ useProfile: () => ({ data: { unitSystem: "metric" } }) }))

afterEach(async () => { await closeDb() })

describe("SessionSummary", () => {
  it("renders from a minimal local input", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SessionSummary session={{ activeSeconds: 65, exercises: [{ sets: [{ reps: 10, weightKg: 20, completedAt: "2026-01-01T00:00:00.000Z" }] }] }} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText("01:05")).toBeInTheDocument()
    expect(screen.getByText("200 kg")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/workout-summary.test.tsx`
Expected: FAIL — `SummaryInput` lacks `id` etc.

- [ ] **Step 3: Loosen `SessionSummary`'s prop**

In `session-summary.tsx`, replace the `SessionDTO` import and prop:

```ts
import { computeSummary, formatDuration, type SummaryInput } from "@/features/workouts/lib/summary"
```

```ts
export function SessionSummary({ session }: { session: SummaryInput }) {
```

- [ ] **Step 4: Add the local fallback to the summary page**

Replace the top of `SessionSummaryPage` (imports + data selection):

```ts
import { useEffect, useState } from "react"
import { loadActiveSession } from "@/features/workouts/lib/session-persistence"
import type { SummaryInput } from "@/features/workouts/lib/summary"
```

```ts
const { data, isLoading, isError, refetch } = useSession(sessionId)
const [localSummary, setLocalSummary] = useState<SummaryInput | null>(null)

useEffect(() => {
  let active = true
  void loadActiveSession().then((value) => {
    if (!active || !value) return
    if (value.source.id === sessionId && value.source.status === "completed") {
      setLocalSummary({ activeSeconds: value.source.activeSeconds, exercises: value.source.exercises })
    }
  })
  return () => {
    active = false
  }
}, [sessionId])

const session = data ?? localSummary
```

Then guard on `!session` instead of `!data`:

```tsx
if (isLoading && !session) return <SummarySkeleton label={tCommon("loading")} />
if ((isError && !session) || !session) {
  // existing error EmptyState, unchanged
}
return (
  <div className="flex flex-col gap-6">
    <SessionSummary session={session} />
    {/* existing done button */}
  </div>
)
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- tests/unit/workout-summary.test.tsx tests/unit/summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/workouts/components/session-summary.tsx "src/app/[locale]/(app)/workout/summary/[sessionId]/page.tsx" tests/unit/workout-summary.test.tsx
git commit -m "feat(workouts): offline summary fallback from the local session"
```

---

### Task 16: Serwist service worker, build wiring, CSP, prefetch

**Files:**
- Create: `serwist.config.js`, `src/app/sw.ts`, `src/lib/offline/use-offline-prefetch.ts`
- Modify: `package.json`, `.gitignore`, `tsconfig.json`, `next.config.ts`, `src/app/[locale]/layout.tsx`, `src/app/[locale]/(app)/workout/page.tsx`
- Test: `tests/unit/use-offline-prefetch.test.tsx`

**Interfaces:**
- Consumes: `flushOutbox` (Task 8).
- Produces: a built `public/sw.js`; `useOfflinePrefetch(urls: readonly string[]): void`.

- [ ] **Step 1: Add dependencies**

```bash
pnpm add @serwist/next
pnpm add -D serwist @serwist/cli esbuild
```

- [ ] **Step 2: Add `serwist.config.js`**

```js
// @ts-check
import { serwist } from "@serwist/next/config"

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Precached page entries are added by the tasks that create those routes
  // (Tasks 17 and 18), so this build never references a URL that does not exist yet.
  additionalPrecacheEntries: [],
})
```

- [ ] **Step 3: Create `src/app/sw.ts`**

```ts
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import {
  CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate,
} from "serwist"
import { flushOutbox } from "@/lib/offline/sync"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const catalog = new StaleWhileRevalidate({
  cacheName: "api-catalog-v1",
  plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
})
const apiData = new NetworkFirst({
  cacheName: "api-data-v1",
  networkTimeoutSeconds: 3,
  plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 })],
})
const images = new CacheFirst({
  cacheName: "images-v1",
  plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })],
})

const API_DATA_PATHS = new Set([
  "/api/sessions/active", "/api/routines/active", "/api/profile", "/api/me",
])

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/exercises"), handler: catalog },
    { matcher: ({ url, request }) => request.method === "GET" && API_DATA_PATHS.has(url.pathname), handler: apiData },
    { matcher: ({ request }) => request.destination === "image", handler: images },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      { url: "/en/offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
})

serwist.addEventListeners()

self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string }
  if (syncEvent.tag === "gym-session-sync") syncEvent.waitUntil(flushOutbox())
})
```

- [ ] **Step 4: Update scripts, ignore, and tsconfig**

`package.json`: `"build": "next build && serwist build"`.

`.gitignore`: append `public/sw*`.

`tsconfig.json`: add `"exclude": ["node_modules", "public/sw.js"]`.

- [ ] **Step 5: Add CSP directives**

In `next.config.ts`, add to the `contentSecurityPolicy` array after `style-src`:

```ts
  "manifest-src 'self'",
  "worker-src 'self'",
```

- [ ] **Step 6: Mount `SerwistProvider`**

In `src/app/[locale]/layout.tsx`:

```tsx
import { SerwistProvider } from "@serwist/next/react"
```

Wrap the providers:

```tsx
<body className="bg-background text-foreground antialiased">
  <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
    <NextIntlClientProvider>
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <QueryProvider>{children}</QueryProvider>
          <Toaster richColors />
        </ThemeProvider>
      </AuthProvider>
    </NextIntlClientProvider>
  </SerwistProvider>
</body>
```

- [ ] **Step 7: Write the prefetch hook test**

```tsx
import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useOfflinePrefetch } from "@/lib/offline/use-offline-prefetch"

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("useOfflinePrefetch", () => {
  it("fetches the given urls after an idle delay when online", () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => new Response("{}"))
    vi.stubGlobal("fetch", fetchImpl)
    renderHook(() => useOfflinePrefetch(["/api/exercises", "/img/a.jpg"]))
    vi.advanceTimersByTime(3000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 8: Implement `use-offline-prefetch.ts`**

```ts
"use client"

import { useEffect } from "react"

const PREFETCH_DELAY_MS = 3000

export function useOfflinePrefetch(urls: readonly string[]): void {
  const key = urls.join("|")
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return
    const list = key ? key.split("|") : []
    if (list.length === 0) return
    const id = window.setTimeout(() => {
      for (const url of list) {
        void fetch(url, { cache: "force-cache" }).catch(() => undefined)
      }
    }, PREFETCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [key])
}
```

- [ ] **Step 9: Wire prefetch into the workout page**

In `src/app/[locale]/(app)/workout/page.tsx` add:

```ts
import { exerciseImageUrl } from "@/lib/exercise-images"
import { useOfflinePrefetch } from "@/lib/offline/use-offline-prefetch"
```

```ts
const prefetchUrls = useMemo(() => {
  const urls = ["/api/exercises"]
  for (const day of routine.data?.days ?? []) {
    for (const exercise of day.exercises) {
      const image = exercise.exercise?.images?.[0]
      if (image) urls.push(exerciseImageUrl(image))
    }
  }
  return urls
}, [routine.data])
useOfflinePrefetch(prefetchUrls)
```

- [ ] **Step 10: Run the prefetch test and a production build**

Run: `pnpm test -- tests/unit/use-offline-prefetch.test.tsx`
Expected: PASS.
Run: `pnpm build`
Expected: build succeeds and `public/sw.js` exists (verify with `ls public/sw.js`).

- [ ] **Step 11: Commit**

```bash
git add serwist.config.js src/app/sw.ts src/lib/offline/use-offline-prefetch.ts "src/app/[locale]/layout.tsx" "src/app/[locale]/(app)/workout/page.tsx" next.config.ts tsconfig.json .gitignore package.json pnpm-lock.yaml tests/unit/use-offline-prefetch.test.tsx
git commit -m "feat(pwa): serwist service worker, runtime caching, and offline prefetch"
```

---

### Task 17: Offline fallback route

**Files:**
- Create: `src/app/[locale]/offline/page.tsx`
- Modify: `src/lib/route-access.ts`
- Test: `tests/unit/route-access.test.ts` (append)

**Interfaces:**
- Consumes: `offline.page.*` copy (Task 10).
- Produces: a public `/offline` route (localized as `/{locale}/offline`), precached at `/en/offline` by the SW (Task 16).

> **Ruling (pre-flight):** The offline page lives inside the existing `[locale]` root layout rather than a separate `(offline)` root layout. Next.js only guarantees multiple root layouts for route groups, and `[locale]` is a dynamic segment, so a second top-level root layout risks a build error. A localized route under `[locale]` reuses the existing root layout and needs only a public-path entry.

- [ ] **Step 1: Append a route-access test**

```ts
import { describe, expect, it } from "vitest"
import { isPublicPath } from "@/lib/route-access"

describe("offline route access", () => {
  it("treats the localized offline route as public", () => {
    expect(isPublicPath("/en/offline")).toBe(true)
    expect(isPublicPath("/es/offline")).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/route-access.test.ts`
Expected: FAIL — `/offline` is not public.

- [ ] **Step 3: Allowlist `/offline`**

In `src/lib/route-access.ts`:

```ts
const PUBLIC_PREFIXES = ["/login", "/legal", "/offline", "/api/health", "/api/auth"] as const
```

- [ ] **Step 4: Create the localized offline page**

`src/app/[locale]/offline/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function OfflinePage({
  params,
}: PageProps<"/[locale]/offline">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("offline.page")
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-heading text-xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("body")}</p>
    </main>
  )
}
```

- [ ] **Step 5: Precache the offline route**

In `serwist.config.js`, set:

```js
  additionalPrecacheEntries: [{ url: "/en/offline", revision: "1" }],
```

- [ ] **Step 6: Run the test and typecheck**

Run: `pnpm test -- tests/unit/route-access.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/offline/page.tsx" serwist.config.js src/lib/route-access.ts tests/unit/route-access.test.ts
git commit -m "feat(pwa): public localized /offline fallback route"
```

---

### Task 18: Manifest, icons, and app metadata

**Files:**
- Create: `src/app/manifest.ts`, `public/icons/icon.svg`, `scripts/generate-icons.mjs`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`
- Modify: `src/app/[locale]/layout.tsx`, `package.json`
- Test: `tests/unit/manifest.test.ts`

**Interfaces:**
- Produces: `src/app/manifest.ts` default-exporting `MetadataRoute.Manifest`; raster + SVG icons.

- [ ] **Step 1: Write the manifest test**

```ts
import { describe, expect, it } from "vitest"
import manifest from "@/app/manifest"

describe("web app manifest", () => {
  it("is installable and points at the icons", () => {
    const m = manifest()
    expect(m.display).toBe("standalone")
    expect(m.start_url).toBe("/")
    const sizes = (m.icons ?? []).map((icon) => icon.sizes)
    expect(sizes).toContain("192x192")
    expect(sizes).toContain("512x512")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- tests/unit/manifest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/manifest.ts`**

```ts
import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gym Tracker",
    short_name: "Gym",
    description: "Log workouts, run routines, and track progress.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }
}
```

- [ ] **Step 4: Precache the manifest**

In `serwist.config.js`, set:

```js
  additionalPrecacheEntries: [
    { url: "/en/offline", revision: "1" },
    { url: "/manifest.webmanifest", revision: "1" },
  ],
```

- [ ] **Step 5: Create the SVG mark and the icon generator**

`public/icons/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Gym Tracker">
  <rect width="512" height="512" rx="96" fill="#0a0a0a"/>
  <g fill="#f5f5f5">
    <rect x="96" y="236" width="320" height="40" rx="20"/>
    <rect x="76" y="196" width="48" height="120" rx="16"/>
    <rect x="388" y="196" width="48" height="120" rx="16"/>
    <rect x="132" y="176" width="40" height="160" rx="14"/>
    <rect x="340" y="176" width="40" height="160" rx="14"/>
  </g>
</svg>
```

`scripts/generate-icons.mjs`:

```js
import { readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"

const svg = await readFile("public/icons/icon.svg")

async function png(size, out) {
  await writeFile(out, await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
}

await png(192, "public/icons/icon-192.png")
await png(512, "public/icons/icon-512.png")
await png(180, "public/icons/apple-touch-icon.png")
```

- [ ] **Step 5: Generate the icons**

```bash
pnpm add -D sharp
node scripts/generate-icons.mjs
ls -1 public/icons
```

Expected: `icon.svg icon-192.png icon-512.png apple-touch-icon.png`.

- [ ] **Step 6: Add metadata and viewport to the locale layout**

In `src/app/[locale]/layout.tsx` add (before the component):

```ts
import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  applicationName: "Gym Tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Gym Tracker" },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}
```

- [ ] **Step 7: Run the test and build**

Run: `pnpm test -- tests/unit/manifest.test.ts && pnpm build`
Expected: PASS; build emits `/manifest.webmanifest`.

- [ ] **Step 8: Commit**

```bash
git add src/app/manifest.ts public/icons scripts/generate-icons.mjs "src/app/[locale]/layout.tsx" tests/unit/manifest.test.ts package.json pnpm-lock.yaml
git commit -m "feat(pwa): manifest, icons, and install metadata"
```

---

### Task 19: Offline end-to-end test

**Files:**
- Create: `tests/e2e/offline.spec.ts`
- Test: `tests/e2e/offline.spec.ts`

**Interfaces:**
- Consumes: the e2e helpers (`tests/e2e/helpers/session.ts`), the production build with the SW.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../src/generated/prisma/client"
import {
  cleanupTestUser, createTestSession, disconnectTestDb, seedActiveRoutine,
} from "./helpers/session"

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const email = `e2e_offline_${Date.now()}@e2e-test.local`
const EXERCISE = "E2E Offline Press"

test.afterAll(async () => {
  await cleanupTestUser(email)
  await disconnectTestDb()
  await prisma.$disconnect()
})

test("runs and finishes a workout entirely offline, then syncs", async ({ page, context }) => {
  const { cookie, userId } = await createTestSession(email, { onboarded: true })
  await seedActiveRoutine(userId, {
    name: "E2E Offline Plan",
    days: [{ weekday: 1, label: "Offline Day", exercises: [{ name: EXERCISE, restSeconds: 0 }] }],
  })
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  // Load once online so the SW installs and the active session is created + synced.
  await page.goto("/en/workout")
  await expect(page.getByRole("heading", { level: 2, name: EXERCISE })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null)
  await expect
    .poll(async () => {
      const session = await prisma.workoutSession.findFirst({
        where: { userId, status: "in_progress" },
        select: { id: true },
      })
      return session?.id ?? null
    }, { timeout: 15_000 })
    .not.toBeNull()

  // Go offline and cold-open: the SW shell + local session must resume the runner.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole("heading", { level: 2, name: EXERCISE })).toBeVisible()

  // Log the prescribed set and finish.
  await page.getByLabel("Weight").first().fill("25")
  await page.getByRole("checkbox", { name: "Mark set complete" }).first().check()
  await page.getByRole("button", { name: "Finish" }).click()
  const finishDialog = page.getByRole("alertdialog")
  if (await finishDialog.isVisible().catch(() => false)) {
    await finishDialog.getByRole("button", { name: "Finish" }).click()
  }
  await expect(page).toHaveURL(/\/en\/workout\/summary\/[^/]+$/)
  await expect(page.getByRole("heading", { name: "Workout summary" })).toBeVisible()

  // Back online: the outbox flushes and the session is completed server-side.
  await context.setOffline(false)
  await expect
    .poll(async () => {
      const session = await prisma.workoutSession.findFirst({
        where: { userId, status: "completed" },
        select: { id: true },
      })
      return session?.id ?? null
    }, { timeout: 15_000 })
    .not.toBeNull()
})
```

- [ ] **Step 2: Run the e2e spec**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && docker compose up -d db && pnpm db:seed && pnpm e2e -- tests/e2e/offline.spec.ts`
Expected: PASS. If the SW controller is not ready, the `waitForFunction` retries until it is.

- [ ] **Step 3: Run the full e2e suite (regressions)**

Run: `pnpm e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/offline.spec.ts
git commit -m "test(e2e): run a workout end-to-end offline and sync on reconnect"
```

---

### Task 20: Final verification and roadmap update

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Run every gate**

```bash
pnpm lint
pnpm typecheck
pnpm test
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && docker compose up -d db && pnpm db:seed
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm e2e
```

Expected: all green. If coverage dropped below the configured thresholds, add unit tests for the new pure modules rather than lowering the thresholds.

- [ ] **Step 2: Update the roadmap**

In `docs/ROADMAP.md`:
- Set the `2C | PWA / Offline` row status to `Done (merged)` and fill its Spec/Plan/SDD paths:
  - Spec: `.../specs/2026-09-22-gym-tracker-phase2c-pwa-offline-design.md`
  - Plan: `.../plans/2026-09-22-gym-tracker-phase2c-pwa-offline.md`
  - SDD: `.superpowers/sdd/2026-09-22-gym-tracker-phase2c-pwa-offline/`
- Remove the 2C bullet from "Remaining phases" and make 3 the next phase in "How to continue".

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark phase 2c pwa/offline complete"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 Serwist configurator mode | 16 |
| §4 client-generated IDs + snapshot | 2, 3, 4, 5, 12 |
| §5 upsert API + idempotent terminal states | 5, 6 |
| §6 IndexedDB outbox + sync engine + start flow | 3, 7, 8, 9, 11, 12, 13 |
| §7 conflict (local wins) | 5 (abandons others), 19 (e2e) |
| §8 wall-clock timers + best-effort notifications | 1, 13, 14 |
| §9 caching + prefetch | 16 |
| §10 manifest/install/offline route/indicator | 11, 13, 16, 17, 18 |
| §11 i18n | 10, 13 |
| §12 testing | every task + 19 |
| §14 acceptance criteria | 20 |

No gaps found.

**2. Placeholder scan**

No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Every code step carries real code. Tasks 13 and 16 describe multi-hunk edits with exact code blocks and precise removal instructions rather than a full-file dump, because the files are large and only listed regions change.

**3. Type consistency**

- `SessionSnapshot`/`RoutineDay` defined in Task 2, used in Tasks 3, 9, 12.
- `SessionUpsertPayload.exercises` is `SessionStateInput["exercises"]`; both `buildLocalSession` (Task 3) and the store `toUpsertPayload` (Task 12) produce that shape.
- `enqueue(op, sessionId, { state, activeSeconds })` (Task 8) is called with exactly those args in Tasks 12 and 13.
- `useSessionSync` returns `{ status, enqueueState, complete, abandon }` (Task 13); the runner uses those names.
- `PersistedSession` (Task 9) gains `snapshot`/`routineDayId` and is constructed with those fields in Tasks 12 and 13.
- `SessionSummary`'s prop changes to `SummaryInput` (Task 15), which `SessionDTO` satisfies.

**4. Review Focus**

1. Offline cold-open before SW install → Task 12's `loadActiveSession` fallback + Task 19's offline reload test.
2. Partial-success replay → Task 8's `flushRecord` (PUT-then-complete) + "keeps the row on a retryable 500" test.
3. Clock/timer edges → Task 1's overshoot/pause/background-jump tests.
4. Conflicting in-progress sessions → Task 5's "abandons a conflicting in-progress session" test.
5. Degenerate payloads → Task 4's long-note/negative-weight tests + Task 5's degenerate-payload test.
