# Per-Set Prescribed Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a routine prescribe reps, weight and RPE per set, and pre-fill every set when a workout starts so the user only adjusts values while training.

**Architecture:** Add a nullable `setTargets` JSON column to `RoutineExercise` holding `RoutineSetTarget[]`. Keep legacy `targetReps`/`targetWeightKg` in sync as fallback so pre-existing routines keep working. Thread the typed array through Zod → repository → DTO → draft store → editor UI, then seed session sets (including RPE) from it.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, Prisma 7 + PostgreSQL, Zod, Zustand, TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-23-routine-set-targets-design.md`

## Global Constraints

- Follow repo conventions in `AGENTS.md`: no code comments, semantic Tailwind tokens only, i18n keys in EN/ES parity, mobile-first, no new dependencies.
- Prisma 7: import `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client` (never `@prisma/client`).
- Every existing gate must stay green: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Integration tests/migrations need Docker: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`, `docker compose up -d db`.
- Do not touch: `src/app/api/**`, session persistence/offline flow, templates, `SetType` (all seeded sets stay `working`).
- `targetSets` must always equal `setTargets.length` when `setTargets` is non-null.

## Review Focus

- **Malformed / legacy JSON in `setTargets`:** a row whose JSON is not a valid target array must read as `null` (fallback), never crash the request or the editor.
- **Length drift:** editor mutations (add/remove/edit) must never leave `targetSets !== setTargets.length`.
- **Legacy fallback:** a routine with `setTargets = null` but `targetReps = "8-12"` / `targetWeightKg` must still seed sensible sets and render editable rows.
- **Null writes:** clearing/omitting `setTargets` must persist as SQL `NULL`, not the JSON string `"null"`.
- **Unit round-trip:** entering a weight in lb must persist the kg equivalent and redisplay without drift.

---

### Task 1: Shared per-set target schema and pure helpers

**Files:**
- Modify: `src/features/routines/schemas/routine.ts`
- Create: `src/features/routines/lib/set-targets.ts`
- Test: `tests/unit/set-targets.test.ts`
- Test: `tests/unit/routine-schema.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `routineSetTargetSchema`, `routineSetTargetsSchema`, `type RoutineSetTarget = { reps: number | null; weightKg: number | null; rpe: number | null }`
  - `parseSetTargets(value: unknown): RoutineSetTarget[] | null`
  - `legacyTargetsToSetTargets(targetSets: number, targetReps: string | null, targetWeightKg: number | null): RoutineSetTarget[]`
  - `syncSetTargets(next: RoutineSetTarget[]): { setTargets: RoutineSetTarget[]; targetSets: number; targetReps: string; targetWeightKg: number | null }`
  - `normalizeRoutineSetTargets<T extends { days: { exercises: { setTargets: unknown }[] }[] }>(routine: T): T`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/set-targets.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  legacyTargetsToSetTargets,
  normalizeRoutineSetTargets,
  parseSetTargets,
  syncSetTargets,
} from "@/features/routines/lib/set-targets"

describe("parseSetTargets", () => {
  it("returns null for null, undefined and non-arrays", () => {
    expect(parseSetTargets(null)).toBeNull()
    expect(parseSetTargets(undefined)).toBeNull()
    expect(parseSetTargets({ reps: 10 })).toBeNull()
    expect(parseSetTargets("nope")).toBeNull()
  })

  it("parses a valid array", () => {
    expect(parseSetTargets([{ reps: 10, weightKg: 40, rpe: 8 }])).toEqual([
      { reps: 10, weightKg: 40, rpe: 8 },
    ])
  })

  it("returns null for malformed entries", () => {
    expect(parseSetTargets([{ reps: "ten" }])).toBeNull()
    expect(parseSetTargets([{ reps: 10, rpe: 11 }])).toBeNull()
    expect(parseSetTargets([])).toBeNull()
  })
})

describe("legacyTargetsToSetTargets", () => {
  it("repeats the legacy prescription across every set", () => {
    expect(legacyTargetsToSetTargets(3, "10", 40)).toEqual([
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
    ])
  })

  it("keeps ranges as null reps and never returns zero rows", () => {
    expect(legacyTargetsToSetTargets(2, "8-12", null)[0]).toEqual({
      reps: null,
      weightKg: null,
      rpe: null,
    })
    expect(legacyTargetsToSetTargets(0, "10", null)).toHaveLength(1)
  })
})

describe("syncSetTargets", () => {
  it("derives targetSets, targetReps and targetWeightKg from the rows", () => {
    const next = [
      { reps: 12, weightKg: 40, rpe: 7 },
      { reps: 8, weightKg: 50, rpe: 9 },
    ]
    expect(syncSetTargets(next)).toEqual({
      setTargets: next,
      targetSets: 2,
      targetReps: "12",
      targetWeightKg: 40,
    })
  })

  it("uses an empty string when the first set has no reps", () => {
    expect(syncSetTargets([{ reps: null, weightKg: null, rpe: null }]).targetReps).toBe("")
  })
})

describe("normalizeRoutineSetTargets", () => {
  it("parses raw json per exercise and leaves malformed as null", () => {
    const routine = {
      days: [
        {
          exercises: [
            { setTargets: [{ reps: 10, weightKg: 40, rpe: 8 }] },
            { setTargets: "garbage" },
          ],
        },
      ],
    }
    const out = normalizeRoutineSetTargets(routine)
    expect(out.days[0]!.exercises[0]!.setTargets).toEqual([
      { reps: 10, weightKg: 40, rpe: 8 },
    ])
    expect(out.days[0]!.exercises[1]!.setTargets).toBeNull()
  })
})
```

Add to `tests/unit/routine-schema.test.ts` inside `describe("routineInputSchema")`:

```ts
  it("accepts per-set targets that match the set count", () => {
    const ex = {
      ...day.exercises[0],
      targetSets: 2,
      setTargets: [
        { reps: 12, weightKg: 40, rpe: 7 },
        { reps: 10, weightKg: 45, rpe: 8 },
      ],
    }
    expect(
      routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ ...day, exercises: [ex] }] })
        .success,
    ).toBe(true)
  })

  it("rejects per-set targets whose length differs from targetSets", () => {
    const ex = { ...day.exercises[0], targetSets: 3, setTargets: [{ reps: 10, weightKg: null, rpe: null }] }
    expect(
      routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ ...day, exercises: [ex] }] })
        .success,
    ).toBe(false)
  })

  it("rejects an out-of-range RPE", () => {
    const ex = { ...day.exercises[0], targetSets: 1, setTargets: [{ reps: 10, weightKg: null, rpe: 11 }] }
    expect(
      routineInputSchema.safeParse({ name: "R", description: null, goal: null, days: [{ ...day, exercises: [ex] }] })
        .success,
    ).toBe(false)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/set-targets.test.ts tests/unit/routine-schema.test.ts`
Expected: FAIL — cannot resolve `@/features/routines/lib/set-targets`; new schema cases fail.

- [ ] **Step 3: Add the schema**

In `src/features/routines/schemas/routine.ts`, after `const timerTypeSchema = ...` add:

```ts
export const routineSetTargetSchema = z.object({
  reps: z.number().int().min(1).max(100).nullable().default(null),
  weightKg: z.number().positive().max(1000).nullable().default(null),
  rpe: z.number().int().min(1).max(10).nullable().default(null),
})
export type RoutineSetTarget = z.infer<typeof routineSetTargetSchema>

export const routineSetTargetsSchema = z.array(routineSetTargetSchema).min(1).max(20)
```

Add the field to `routineExerciseInputSchema` (after `targetWeightKg`):

```ts
    setTargets: routineSetTargetsSchema.nullable().default(null),
```

Add a second `.refine` to `routineExerciseInputSchema` (chained after the existing timer refine):

```ts
  .refine((v) => v.setTargets == null || v.setTargets.length === v.targetSets, {
    message: "setTargets length must match targetSets",
    path: ["setTargets"],
  })
```

- [ ] **Step 4: Add the helpers**

Create `src/features/routines/lib/set-targets.ts`:

```ts
import {
  routineSetTargetsSchema,
  type RoutineSetTarget,
} from "@/features/routines/schemas/routine"

export function parseSetTargets(value: unknown): RoutineSetTarget[] | null {
  const result = routineSetTargetsSchema.safeParse(value)
  return result.success ? result.data : null
}

export function legacyTargetsToSetTargets(
  targetSets: number,
  targetReps: string | null,
  targetWeightKg: number | null,
): RoutineSetTarget[] {
  const count = Math.min(Math.max(targetSets, 1), 20)
  const trimmed = targetReps?.trim() ?? ""
  const reps = /^\d+$/.test(trimmed) ? Number(trimmed) : null
  return Array.from({ length: count }, () => ({
    reps,
    weightKg: targetWeightKg,
    rpe: null,
  }))
}

export type SyncedSetTargets = {
  setTargets: RoutineSetTarget[]
  targetSets: number
  targetReps: string
  targetWeightKg: number | null
}

export function syncSetTargets(next: RoutineSetTarget[]): SyncedSetTargets {
  const first = next[0] ?? { reps: null, weightKg: null, rpe: null }
  return {
    setTargets: next,
    targetSets: next.length,
    targetReps: first.reps == null ? "" : String(first.reps),
    targetWeightKg: first.weightKg,
  }
}

export function normalizeRoutineSetTargets<
  T extends { days: { exercises: { setTargets: unknown }[] }[] },
>(routine: T): T {
  for (const day of routine.days) {
    for (const exercise of day.exercises) {
      ;(exercise as { setTargets: RoutineSetTarget[] | null }).setTargets =
        parseSetTargets(exercise.setTargets)
    }
  }
  return routine
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test tests/unit/set-targets.test.ts tests/unit/routine-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/routines/schemas/routine.ts src/features/routines/lib/set-targets.ts tests/unit/set-targets.test.ts tests/unit/routine-schema.test.ts
git commit -m "feat(routines): add per-set target schema and helpers"
```

---

### Task 2: Prisma column and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/**` (generated)

**Interfaces:**
- Produces: `RoutineExercise.setTargets Json?` available on the generated Prisma client and types.

TDD exception (config/migration): the schema change is infrastructure; it is verified by `prisma migrate dev` + `pnpm typecheck`, and its runtime behavior is covered by Task 3/Task 6 tests.

- [ ] **Step 1: Add the column**

In `prisma/schema.prisma`, inside `model RoutineExercise`, after `targetWeightKg Float?`:

```prisma
  setTargets     Json?
```

- [ ] **Step 2: Create the migration**

Ensure Docker is up, then run:

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker compose up -d db
pnpm exec prisma migrate dev --name routine_set_targets
```

Expected: a new folder under `prisma/migrations/` and `RoutineExercise.setTargets` in the generated client.

- [ ] **Step 3: Verify types**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add routine exercise set targets column"
```

---

### Task 3: Repository and service plumbing

**Files:**
- Modify: `src/server/repositories/routine.repository.ts`
- Test: `tests/unit/set-targets.test.ts` (already covers `normalizeRoutineSetTargets`)

**Interfaces:**
- Consumes: `parseSetTargets`, `normalizeRoutineSetTargets` (Task 1); `RoutineSetTarget` type.
- Produces: repository read/create/update functions whose DTOs carry a typed `setTargets`; `RoutineDayWriteInput.exercises[].setTargets: RoutineSetTarget[] | null`.

- [ ] **Step 1: Extend the select and write input**

In `src/server/repositories/routine.repository.ts`:

Add to `routineSelect` exercise select, after `targetWeightKg: true,`:

```ts
          setTargets: true,
```

Add the import at the top:

```ts
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
import {
  normalizeRoutineSetTargets,
  parseSetTargets,
} from "@/features/routines/lib/set-targets"
```

Add to `RoutineDayWriteInput["exercises"][number]`, after `targetWeightKg: number | null`:

```ts
    setTargets: RoutineSetTarget[] | null
```

- [ ] **Step 2: Normalize reads and writes**

Replace the bodies of the read/write functions so each returned routine passes through `normalizeRoutineSetTargets`:

```ts
export async function findActiveByUser(userId: string) {
  const routine = await prisma.routine.findFirst({
    where: { userId, isActive: true },
    select: routineSelect,
  })
  return routine ? normalizeRoutineSetTargets(routine) : null
}

export async function findByIdForUser(userId: string, id: string) {
  const routine = await prisma.routine.findFirst({
    where: { id, userId },
    select: routineSelect,
  })
  return routine ? normalizeRoutineSetTargets(routine) : null
}

export async function createBlank(userId: string, data: RoutineHeaderInput) {
  const routine = await prisma.routine.create({
    data: {
      userId,
      name: data.name,
      description: data.description,
      goal: data.goal,
      source: "manual",
      isActive: false,
    },
    select: routineSelect,
  })
  return normalizeRoutineSetTargets(routine)
}

export async function createWithDays(
  tx: Prisma.TransactionClient,
  data: Prisma.RoutineUncheckedCreateInput,
) {
  const routine = await tx.routine.create({ data, select: routineSelect })
  return normalizeRoutineSetTargets(routine)
}

export async function setActive(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) {
  await deactivateActive(tx, userId)
  const routine = await tx.routine.update({
    where: { id },
    data: { isActive: true },
    select: routineSelect,
  })
  return normalizeRoutineSetTargets(routine)
}
```

In `replaceDays`, add `setTargets` to the create payload:

```ts
              targetWeightKg: e.targetWeightKg,
              setTargets: e.setTargets ?? Prisma.JsonNull,
```

and wrap its return with `normalizeRoutineSetTargets(...)`:

```ts
  await tx.routineDay.deleteMany({ where: { routineId } })
  const routine = await tx.routine.update({
    // ...unchanged data...
    select: routineSelect,
  })
  return normalizeRoutineSetTargets(routine)
```

- [ ] **Step 3: Carry set targets through duplication**

In `duplicateSource`, add `setTargets: true,` to the inner exercise select, and normalize the result:

```ts
export async function duplicateSource(userId: string, id: string) {
  const source = await prisma.routine.findFirst({
    where: { id, userId },
    select: {
      // ...unchanged...
    },
  })
  if (!source) return null
  for (const day of source.days) {
    for (const exercise of day.exercises) {
      ;(exercise as { setTargets: RoutineSetTarget[] | null }).setTargets =
        parseSetTargets(exercise.setTargets)
    }
  }
  return source
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Run: `pnpm test`
Expected: PASS (repository behavior is exercised by route/unit tests against mocks; `normalizeRoutineSetTargets` is unit-tested in Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/routine.repository.ts
git commit -m "feat(routines): persist and normalize per-set targets"
```

---

### Task 4: Client DTO and draft store hydration

**Files:**
- Modify: `src/features/routines/hooks/use-active-routine.ts`
- Modify: `src/features/routines/stores/routine-draft-store.ts`
- Test: `tests/unit/routine-draft-store.test.ts` (add cases)

**Interfaces:**
- Consumes: `legacyTargetsToSetTargets`, `syncSetTargets` (Task 1).
- Produces: `RoutineDTO.days[].exercises[].setTargets?: RoutineSetTarget[] | null`; `DraftExercise.setTargets: RoutineSetTarget[]`; `toRoutineInput()` emits `setTargets`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/routine-draft-store.test.ts` inside the existing `describe`:

```ts
  it("synthesizes per-set targets from the legacy prescription on hydrate", () => {
    useRoutineDraftStore.getState().hydrate({
      ...routine,
      days: [
        {
          id: "d1",
          weekday: 1,
          label: "Push",
          order: 0,
          exercises: [
            {
              id: "x1",
              exerciseId: "c1",
              customName: null,
              targetSets: 3,
              targetReps: "10",
              restSeconds: 60,
              targetWeightKg: 40,
              timerType: "none",
              workSeconds: null,
              rounds: null,
              notes: null,
            },
          ],
        },
      ],
    })
    const ex = useRoutineDraftStore.getState().days[0]!.exercises[0]!
    expect(ex.setTargets).toEqual([
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
      { reps: 10, weightKg: 40, rpe: null },
    ])
  })

  it("emits setTargets in toRoutineInput", () => {
    useRoutineDraftStore.getState().hydrate({
      ...routine,
      days: [
        {
          id: "d1",
          weekday: 1,
          label: "Push",
          order: 0,
          exercises: [
            {
              id: "x1",
              exerciseId: "c1",
              customName: null,
              targetSets: 2,
              targetReps: "10",
              restSeconds: 60,
              targetWeightKg: null,
              timerType: "none",
              workSeconds: null,
              rounds: null,
              notes: null,
            },
          ],
        },
      ],
    })
    const input = useRoutineDraftStore.getState().toRoutineInput()
    expect(input.days[0]!.exercises[0]!.setTargets).toHaveLength(2)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/routine-draft-store.test.ts`
Expected: FAIL — `setTargets` is undefined on the draft exercise.

- [ ] **Step 3: Update the DTO type**

In `src/features/routines/hooks/use-active-routine.ts`, add the import and the field:

```ts
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
```

Inside the exercise object type, after `targetWeightKg: number | null`:

```ts
      setTargets?: RoutineSetTarget[] | null
```

- [ ] **Step 4: Update the draft store**

In `src/features/routines/stores/routine-draft-store.ts`, import the helpers:

```ts
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
import { legacyTargetsToSetTargets } from "@/features/routines/lib/set-targets"
```

Add to `DraftExercise` after `targetWeightKg: number | null`:

```ts
  setTargets: RoutineSetTarget[]
```

Add to `RoutineDraftSource` exercise shape after `targetWeightKg: number | null`:

```ts
      setTargets?: RoutineSetTarget[] | null
```

In `toDraftDay`, after `targetWeightKg: exercise.targetWeightKg,`:

```ts
      setTargets:
        exercise.setTargets ??
        legacyTargetsToSetTargets(
          exercise.targetSets,
          exercise.targetReps,
          exercise.targetWeightKg,
        ),
```

In `addExercises`, replace the fixed `targetSets: 3, ... targetWeightKg: null,` defaults with:

```ts
                      targetSets: 3,
                      targetReps: "10",
                      setTargets: legacyTargetsToSetTargets(3, "10", null),
```

(keep `restSeconds: 60,`, `timerType`, `workSeconds`, `rounds`, `notes` as they are; remove the now-redundant `targetWeightKg: null` line and add `targetWeightKg: null,` is unnecessary — `syncSetTargets` derives it, but the draft field is still required, so keep `targetWeightKg: null,`.)

In `toRoutineInput`, after `targetWeightKg: exercise.targetWeightKg,`:

```ts
              setTargets: exercise.setTargets,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test tests/unit/routine-draft-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/routines/hooks/use-active-routine.ts src/features/routines/stores/routine-draft-store.ts tests/unit/routine-draft-store.test.ts
git commit -m "feat(routines): carry per-set targets through the draft store"
```

---

### Task 5: Routine editor per-set UI and copy

**Files:**
- Modify: `src/features/routines/components/exercise-fields.tsx`
- Modify: `src/i18n/messages/en.json`
- Modify: `src/i18n/messages/es.json`
- Test: `tests/unit/exercise-fields.test.tsx`

**Interfaces:**
- Consumes: `syncSetTargets` (Task 1); `DraftExercise.setTargets` (Task 4); `useProfile` (`src/features/profile/hooks/use-profile.ts`), `displayWeight` / `parseWeightToKg` (`src/features/workouts/lib/units.ts`).
- Produces: `ExerciseFields` renders one editable row per set and emits `onChange` patches containing `setTargets` + synced `targetSets`/`targetReps`/`targetWeightKg`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/exercise-fields.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("@/features/profile/hooks/use-profile", () => ({
  useProfile: () => ({ data: { unitSystem: "metric" } }),
}))

import { ExerciseFields } from "@/features/routines/components/exercise-fields"
import type { DraftExercise } from "@/features/routines/stores/routine-draft-store"

const exercise: DraftExercise = {
  id: "re1",
  exerciseId: "e1",
  name: "Squat",
  targetSets: 2,
  targetReps: "12",
  restSeconds: 90,
  targetWeightKg: 40,
  setTargets: [
    { reps: 12, weightKg: 40, rpe: 7 },
    { reps: 10, weightKg: 45, rpe: 8 },
  ],
  timerType: "none",
  workSeconds: null,
  rounds: null,
  notes: null,
}

describe("ExerciseFields", () => {
  it("edits a single set's reps and keeps the set count in sync", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText("sets.1.reps"), { target: { value: "15" } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSets: 2,
        setTargets: [
          { reps: 15, weightKg: 40, rpe: 7 },
          { reps: 10, weightKg: 45, rpe: 8 },
        ],
      }),
    )
  })

  it("adds and removes sets", () => {
    const onChange = vi.fn()
    render(<ExerciseFields exercise={exercise} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "addSet" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 3 }))
    onChange.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "sets.2.remove" }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetSets: 1 }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/exercise-fields.test.tsx`
Expected: FAIL — no `sets.1.reps` field / `addSet` button.

- [ ] **Step 3: Add i18n keys**

In `src/i18n/messages/en.json`, inside the `routineEditor` object, add:

```json
    "weight": "Weight",
    "rpe": "RPE",
    "setNumber": "Set {number}",
    "addSet": "Add set",
    "removeSet": "Remove set",
```

In `src/i18n/messages/es.json`, inside the `routineEditor` object, add:

```json
    "weight": "Peso",
    "rpe": "RPE",
    "setNumber": "Serie {number}",
    "addSet": "Añadir serie",
    "removeSet": "Quitar serie",
```

- [ ] **Step 4: Rebuild the per-set editor**

Rewrite `src/features/routines/components/exercise-fields.tsx` so the sets-count field and the single reps field are replaced by a per-set list. Keep `NumberField` (still used by rest/work/rounds), the timer `<select>`, `workSeconds`/`rounds`, and `notes` unchanged; remove the old `setsId`/`repsId` declarations, the sets `NumberField`, and the single reps `<Input>`. Add:

```tsx
import { useProfile } from "@/features/profile/hooks/use-profile"
import { displayWeight, parseWeightToKg } from "@/features/workouts/lib/units"
import { syncSetTargets } from "@/features/routines/lib/set-targets"
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
```

Inside the component:

```tsx
  const { data: profile } = useProfile()
  const unitSystem = profile?.unitSystem ?? "metric"

  function commit(next: RoutineSetTarget[]) {
    onChange(syncSetTargets(next))
  }

  function updateSet(index: number, patch: Partial<RoutineSetTarget>) {
    commit(
      exercise.setTargets.map((target, i) => (i === index ? { ...target, ...patch } : target)),
    )
  }

  function addSet() {
    const last = exercise.setTargets.at(-1)
    commit([...exercise.setTargets, last ? { ...last } : { reps: 10, weightKg: null, rpe: null }])
  }

  function removeSet(index: number) {
    if (exercise.setTargets.length <= 1) return
    commit(exercise.setTargets.filter((_, i) => i !== index))
  }
```

Replace the old single reps `<Input>` block with the per-set list:

```tsx
      <div className="col-span-2 flex flex-col gap-2">
        {exercise.setTargets.map((target, index) => {
          const setNumber = index + 1
          const repsId = `sets.${setNumber}.reps`
          const weightId = `sets.${setNumber}.weight`
          const rpeId = `sets.${setNumber}.rpe`
          return (
            <div key={setNumber} className="flex items-end gap-2">
              <span className="text-muted-foreground w-14 shrink-0 pb-2 text-sm font-semibold">
                {t("setNumber", { number: setNumber })}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={repsId}>{t("reps")}</Label>
                <Input
                  id={repsId}
                  aria-label={repsId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={target.reps ?? ""}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    updateSet(index, { reps: Number.isNaN(parsed) ? null : parsed })
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={weightId}>{t("weight")}</Label>
                <Input
                  id={weightId}
                  aria-label={weightId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={target.weightKg == null ? "" : displayWeight(target.weightKg, unitSystem)}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value)
                    updateSet(index, {
                      weightKg: Number.isNaN(parsed) ? null : parseWeightToKg(parsed, unitSystem),
                    })
                  }}
                />
              </div>
              <div className="flex w-20 flex-col gap-1">
                <Label htmlFor={rpeId}>{t("rpe")}</Label>
                <Input
                  id={rpeId}
                  aria-label={rpeId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  value={target.rpe ?? ""}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    updateSet(index, { rpe: Number.isNaN(parsed) ? null : parsed })
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`sets.${setNumber}.remove`}
                disabled={exercise.setTargets.length <= 1}
                onClick={() => removeSet(index)}
              >
                <Minus className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )
        })}
        <Button type="button" variant="outline" className="h-11" onClick={addSet}>
          <Plus className="size-4" weight="bold" aria-hidden="true" />
          {t("addSet")}
        </Button>
      </div>
```

Add imports `Button` from `@/components/ui/button`, and `Minus, Plus` from `@phosphor-icons/react`. Namespace every per-set control with the exercise id: `id`/`aria-label` = `sets.${exercise.id}.${setNumber}.reps` / `.weight` / `.rpe`, and the remove button `aria-label` = `sets.${exercise.id}.${setNumber}.remove` (the plan's test must query these namespaced names; the test exercise id is `re1`). This keeps DOM ids unique when a routine has more than one exercise.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test tests/unit/exercise-fields.test.tsx tests/unit/routine-messages.test.ts`
Expected: PASS (EN/ES parity holds).

- [ ] **Step 6: Commit**

```bash
git add src/features/routines/components/exercise-fields.tsx src/i18n/messages/en.json src/i18n/messages/es.json tests/unit/exercise-fields.test.tsx
git commit -m "feat(routines): per-set reps/weight/rpe editor"
```

---

### Task 6: Seed per-set targets into the session (incl. RPE)

**Files:**
- Modify: `src/features/workouts/lib/session-snapshot.ts`
- Modify: `src/features/workouts/lib/build-local-session.ts`
- Test: `tests/unit/session-snapshot.test.ts` (update + add)

**Interfaces:**
- Consumes: `RoutineDTO...setTargets` (Task 4); `RoutineSetTarget`.
- Produces: `seedSets` returns `{ setNumber, type: "working", reps: number | null, weightKg: number | null, rpe: number | null }[]`; `SnapshotExercise.setTargets: RoutineSetTarget[] | null`.

- [ ] **Step 1: Update/add the failing tests**

In `tests/unit/session-snapshot.test.ts`:

Add `setTargets: null` to the `routine` fixture exercise (after `targetWeightKg: 40,`).
Add `setTargets: null` to the snapshot assertion in `"freezes routine/day identity..."` (after `targetWeightKg: 40,`).
Update the `"seeds clamped..."` expectation to include `rpe: null`:

```ts
    expect(sets).toEqual([
      { setNumber: 1, type: "working", reps: 10, weightKg: 40, rpe: null },
      { setNumber: 2, type: "working", reps: 10, weightKg: 40, rpe: null },
      { setNumber: 3, type: "working", reps: 10, weightKg: 40, rpe: null },
    ])
```

Add a new test:

```ts
  it("seeds each set from its own per-set target", () => {
    const sets = seedSets({
      ...routine.days[0]!.exercises[0]!,
      targetSets: 2,
      setTargets: [
        { reps: 12, weightKg: 40, rpe: 7 },
        { reps: 8, weightKg: 50, rpe: 9 },
      ],
    })
    expect(sets).toEqual([
      { setNumber: 1, type: "working", reps: 12, weightKg: 40, rpe: 7 },
      { setNumber: 2, type: "working", reps: 8, weightKg: 50, rpe: 9 },
    ])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/session-snapshot.test.ts`
Expected: FAIL — `rpe` missing from seeded sets; snapshot lacks `setTargets`.

- [ ] **Step 3: Update the snapshot and seeding**

In `src/features/workouts/lib/session-snapshot.ts`:

Import the type:

```ts
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
```

Add to `SnapshotExercise` after `targetWeightKg: number | null`:

```ts
  setTargets: RoutineSetTarget[] | null
```

In `buildSessionSnapshot`, add to the exercise mapping after `targetWeightKg: exercise.targetWeightKg,`:

```ts
      setTargets: exercise.setTargets ?? null,
```

Replace `seedSets` with:

```ts
export function seedSets(exercise: RoutineExerciseDTO): {
  setNumber: number
  type: "working"
  reps: number | null
  weightKg: number | null
  rpe: number | null
}[] {
  if (exercise.setTargets && exercise.setTargets.length > 0) {
    return exercise.setTargets.slice(0, MAX_SEEDED_SETS).map((target, index) => ({
      setNumber: index + 1,
      type: "working" as const,
      reps: target.reps,
      weightKg: target.weightKg,
      rpe: target.rpe,
    }))
  }
  const count = Math.min(Math.max(exercise.targetSets ?? 0, 0), MAX_SEEDED_SETS)
  const reps = parseTargetReps(exercise.targetReps)
  return Array.from({ length: count }, (_, index) => ({
    setNumber: index + 1,
    type: "working" as const,
    reps,
    weightKg: exercise.targetWeightKg,
    rpe: null,
  }))
}
```

- [ ] **Step 4: Stop discarding RPE in the local session**

In `src/features/workouts/lib/build-local-session.ts`, remove the `rpe: null,` override so the seeded RPE survives:

```ts
    sets: seedSets(exercise).map((set) => ({
      ...set,
      id: newId(),
      durationSeconds: null,
      restSecondsLogged: null,
      completedAt: null,
    })),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test tests/unit/session-snapshot.test.ts tests/unit/build-local-session.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate + commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

```bash
git add src/features/workouts/lib/session-snapshot.ts src/features/workouts/lib/build-local-session.ts tests/unit/session-snapshot.test.ts
git commit -m "feat(workout): seed per-set reps, weight and rpe from the routine"
```

---

## Self-Review

- **Spec coverage:** §3 data model → Task 2; §4 validation/parser → Task 1; §5 server → Task 3; §6 draft store → Task 4; §7 editor UI → Task 5; §8 seeding → Task 6; §9 i18n → Task 5; §10 fallback → Tasks 1/4/6 (legacy paths + tests); §11 tests → each task.
- **Placeholders:** none (no TBD/TODO; every code step has full code).
- **Type consistency:** `RoutineSetTarget` is defined once (Task 1) and imported everywhere; `syncSetTargets` return keys match the draft-store patch fields; `setTargets` is optional in the client DTO/source (existing test fixtures stay valid) and required on `SnapshotExercise`.
- **Review Focus coverage:** malformed JSON → Task 1 `parseSetTargets` tests; length drift → Task 1 `syncSetTargets` + Task 5 test; legacy fallback → Tasks 1/4/6 tests; null → Task 3 `Prisma.JsonNull`; unit round-trip → Task 5 uses `displayWeight`/`parseWeightToKg`.
