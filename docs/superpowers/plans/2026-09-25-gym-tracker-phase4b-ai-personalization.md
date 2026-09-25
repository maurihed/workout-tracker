# Phase 4B — AI Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a personalization stage to the 4A AI routine generation pipeline that tunes each generated exercise's target load from the user's recent (last 3 sessions / 12 weeks) working sets, behind an opt-out control, with a deterministic weight-first safety net that never hard-fails.

**Architecture:** Pure helpers in `src/features/ai/lib` (`reps.ts`, `history.ts`, `personalize.ts`) turn bounded history rows into a `HistoryIndex`, produce a capped prompt summary, and rewrite `targetWeightKg` on the resolved `AiRoutine`. `runJob` in `ai.service.ts` wires them in after resolution, for both the AI and template-fallback paths, and stores `personalized`/`personalizedCount`/`personalizationVersion` provenance. The generate form gets an opt-out checkbox; the preview surfaces the personalization note.

**Tech Stack:** Next.js 16 · TypeScript strict · Prisma 7/Postgres · Zod · pg-boss · TanStack Query · Vitest + RTL · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-gym-tracker-phase4b-ai-personalization-design.md`

## Global Constraints

- Thin Route Handler → service → repository; `import "server-only"` in services/repositories; every query scoped by `userId`.
- Prisma 7 (`@/lib/prisma`, types from `@/generated/prisma/client`); **no schema migration in 4B** — provenance lives in the existing `AiJob.input`/`result` JSON.
- The feature never hard-fails: any personalization/history error yields the un-personalized result, never `markFailed`.
- Constants (verbatim): `HISTORY_WINDOW_DAYS = 84`, `HISTORY_SESSIONS_PER_EXERCISE = 3`, `HISTORY_MAX_SESSIONS = 60`, `HISTORY_SUMMARY_MAX_EXERCISES = 25`; `LOAD_INCREASE = 1.05`, `LOAD_DELOAD = 0.95`, `LOAD_MIN_RATIO = 0.9`, `LOAD_MAX_RATIO = 1.1`, `LOAD_INCREMENT_KG = 2.5`; `PROMPT_VERSION = "2"`, `PERSONALIZATION_VERSION = "1"`.
- Weights are kg internally. Personalization changes only `targetWeightKg`; `sets`/`reps`/`restSeconds` are preserved.
- i18n EN/ES parity; no hardcoded copy; mobile-first ≥44px; strict TS extras (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`); no comments.
- Commands: `pnpm lint` · `typecheck` · `test` · `test:integration` · `test:coverage` · `build` · `e2e`; Docker db + `pnpm db:seed`.

## Review Focus

1. **Never hard-fails** — a history DB error or a personalization throw must produce the un-personalized `succeeded` result, never `markFailed`.
2. **No-history passthrough** — an exercise with no history must be byte-identical to 4A, including a model-proposed `targetWeightKg` left intact.
3. **Unparseable reps** — a `reps` value with no integer must leave the exercise untouched (no crash, no load change).
4. **Bounded load** — every computed load stays within 0.90×–1.10× of the anchor and rounds to 2.5 kg (no absurd jumps).
5. **Opt-out fidelity** — `personalize: false` must read no history and add no prompt block; behavior equals 4A.

---

### Task 1: Rep-range parser

**Files:**
- Create: `src/features/ai/lib/reps.ts`
- Test: `tests/unit/ai-reps.test.ts`

**Interfaces:**
- Produces: `parseRepRange(value: string): { min: number; max: number } | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { parseRepRange } from "@/features/ai/lib/reps"

describe("parseRepRange", () => {
  it("parses a hyphen range", () => {
    expect(parseRepRange("8-12")).toEqual({ min: 8, max: 12 })
  })
  it("parses an en-dash range with spaces", () => {
    expect(parseRepRange("8 – 12")).toEqual({ min: 8, max: 12 })
  })
  it("parses a single number", () => {
    expect(parseRepRange("10")).toEqual({ min: 10, max: 10 })
  })
  it("parses a suffixed number", () => {
    expect(parseRepRange("10 reps")).toEqual({ min: 10, max: 10 })
  })
  it("orders a reversed range", () => {
    expect(parseRepRange("12-8")).toEqual({ min: 8, max: 12 })
  })
  it("returns null when there is no number", () => {
    expect(parseRepRange("AMRAP")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ai-reps.test.ts`
Expected: FAIL — cannot resolve `@/features/ai/lib/reps`.

- [ ] **Step 3: Write minimal implementation**

```ts
export function parseRepRange(value: string): { min: number; max: number } | null {
  const numbers = value.match(/\d+/g)
  if (!numbers || numbers.length === 0) return null
  const first = Number(numbers[0])
  if (numbers.length === 1) return { min: first, max: first }
  const second = Number(numbers[1])
  return { min: Math.min(first, second), max: Math.max(first, second) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ai-reps.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/lib/reps.ts tests/unit/ai-reps.test.ts
git commit -m "feat(ai): rep-range parser for personalization"
```

---

### Task 2: History index + prompt summary

**Files:**
- Create: `src/features/ai/lib/history.ts`
- Test: `tests/unit/ai-history.test.ts`

**Interfaces:**
- Consumes: `normalizeCatalogKey(value)` from `@/features/ai/lib/resolve-exercises`.
- Produces:
  - Constants `HISTORY_WINDOW_DAYS`, `HISTORY_SESSIONS_PER_EXERCISE`, `HISTORY_MAX_SESSIONS`, `HISTORY_SUMMARY_MAX_EXERCISES`.
  - Types `HistorySet`, `HistorySessionExercise`, `HistorySession`, `HistoryAnchor`, `HistoryIndex`.
  - `buildHistoryIndex(sessions: HistorySession[]): HistoryIndex`
  - `buildHistorySummary(index: HistoryIndex, options?: { maxExercises?: number }): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  HISTORY_SUMMARY_MAX_EXERCISES,
  buildHistoryIndex,
  buildHistorySummary,
  type HistorySession,
} from "@/features/ai/lib/history"

function session(completedAt: string, exercises: HistorySession["exercises"]): HistorySession {
  return { completedAt, exercises }
}

describe("buildHistoryIndex", () => {
  it("anchors on the heaviest working set across the last three sessions", () => {
    const index = buildHistoryIndex([
      session("2026-09-20T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 90, reps: 10 }, { weightKg: 100, reps: 5 }] },
      ]),
      session("2026-09-15T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 95, reps: 8 }] },
      ]),
      session("2026-09-10T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 92.5, reps: 8 }] },
      ]),
      session("2026-09-05T10:00:00.000Z", [
        { exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg: 150, reps: 1 }] },
      ]),
    ])
    expect(index.hasData).toBe(true)
    expect(index.byExerciseId.get("ex1")).toEqual({
      identity: "id:ex1",
      name: "Barbell Squat",
      weightKg: 100,
      reps: 5,
      lastDate: "2026-09-20T10:00:00.000Z",
      sessions: 3,
    })
  })

  it("keys unidentified exercises by normalized name and ignores empty sets", () => {
    const index = buildHistoryIndex([
      session("2026-09-20T10:00:00.000Z", [
        { exerciseId: null, nameSnapshot: "  Goblet  Squat ", sets: [] },
        { exerciseId: null, nameSnapshot: "Goblet Squat", sets: [{ weightKg: 24, reps: 12 }] },
      ]),
    ])
    expect(index.hasData).toBe(true)
    expect(index.byName.get("goblet squat")?.weightKg).toBe(24)
    expect(index.byExerciseId.size).toBe(0)
  })

  it("returns an empty index when there is no usable data", () => {
    const index = buildHistoryIndex([])
    expect(index.hasData).toBe(false)
    expect(index.byName.size).toBe(0)
  })
})

describe("buildHistorySummary", () => {
  it("renders one capped, most-recent-first line per exercise", () => {
    const sessions: HistorySession[] = []
    for (let i = 0; i < HISTORY_SUMMARY_MAX_EXERCISES + 5; i += 1) {
      const date = new Date(Date.UTC(2026, 8, 28) - i * 86_400_000).toISOString()
      sessions.push(
        session(date, [
          { exerciseId: `ex${i}`, nameSnapshot: `Lift ${i}`, sets: [{ weightKg: 50, reps: 8 }] },
        ]),
      )
    }
    const summary = buildHistorySummary(buildHistoryIndex(sessions))
    const lines = summary.split("\n")
    expect(lines).toHaveLength(HISTORY_SUMMARY_MAX_EXERCISES)
    expect(lines[0]).toBe("- Lift 0: 50 kg × 8 (2026-09-28)")
  })

  it("returns an empty string with no data", () => {
    expect(buildHistorySummary(buildHistoryIndex([]))).toBe("")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ai-history.test.ts`
Expected: FAIL — cannot resolve `@/features/ai/lib/history`.

- [ ] **Step 3: Write the implementation**

```ts
import { normalizeCatalogKey } from "@/features/ai/lib/resolve-exercises"

export const HISTORY_WINDOW_DAYS = 84
export const HISTORY_SESSIONS_PER_EXERCISE = 3
export const HISTORY_MAX_SESSIONS = 60
export const HISTORY_SUMMARY_MAX_EXERCISES = 25

export type HistorySet = { weightKg: number; reps: number }
export type HistorySessionExercise = {
  exerciseId: string | null
  nameSnapshot: string
  sets: HistorySet[]
}
export type HistorySession = { completedAt: string; exercises: HistorySessionExercise[] }
export type HistoryAnchor = {
  identity: string
  name: string
  weightKg: number
  reps: number
  lastDate: string
  sessions: number
}
export type HistoryIndex = {
  byExerciseId: Map<string, HistoryAnchor>
  byName: Map<string, HistoryAnchor>
  hasData: boolean
}

function betterSet(candidate: HistorySet, current: HistorySet): boolean {
  if (candidate.weightKg !== current.weightKg) return candidate.weightKg > current.weightKg
  return candidate.reps > current.reps
}

function bestSet(sets: HistorySet[]): HistorySet | null {
  let best: HistorySet | null = null
  for (const set of sets) {
    if (set.weightKg <= 0 || set.reps <= 0) continue
    if (best === null || betterSet(set, best)) best = set
  }
  return best
}

type Group = {
  identity: string
  kind: "id" | "name"
  name: string
  sessions: { date: string; best: HistorySet }[]
}

export function buildHistoryIndex(sessions: HistorySession[]): HistoryIndex {
  const byExerciseId = new Map<string, HistoryAnchor>()
  const byName = new Map<string, HistoryAnchor>()
  const groups = new Map<string, Group>()
  const ordered = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))

  for (const session of ordered) {
    const seen = new Set<string>()
    for (const exercise of session.exercises) {
      const best = bestSet(exercise.sets)
      if (!best) continue
      const identity = exercise.exerciseId
        ? `id:${exercise.exerciseId}`
        : `name:${normalizeCatalogKey(exercise.nameSnapshot)}`
      if (!identity || seen.has(identity)) continue
      seen.add(identity)
      const group = groups.get(identity) ?? {
        identity,
        kind: exercise.exerciseId ? "id" : "name",
        name: exercise.nameSnapshot.trim(),
        sessions: [],
      }
      group.sessions.push({ date: session.completedAt, best })
      groups.set(identity, group)
    }
  }

  for (const group of groups.values()) {
    const recent = group.sessions.slice(0, HISTORY_SESSIONS_PER_EXERCISE)
    const first = recent[0]
    if (!first) continue
    const anchorSet = recent.reduce<HistorySet>(
      (acc, entry) => (betterSet(entry.best, acc) ? entry.best : acc),
      first.best,
    )
    const anchor: HistoryAnchor = {
      identity: group.identity,
      name: group.name,
      weightKg: anchorSet.weightKg,
      reps: anchorSet.reps,
      lastDate: first.date,
      sessions: recent.length,
    }
    byName.set(normalizeCatalogKey(group.name), anchor)
    if (group.kind === "id") byExerciseId.set(group.identity.slice(3), anchor)
  }

  return { byExerciseId, byName, hasData: groups.size > 0 }
}

export function buildHistorySummary(
  index: HistoryIndex,
  options: { maxExercises?: number } = {},
): string {
  const max = options.maxExercises ?? HISTORY_SUMMARY_MAX_EXERCISES
  const unique = new Map<string, HistoryAnchor>()
  for (const anchor of index.byExerciseId.values()) unique.set(anchor.identity, anchor)
  for (const anchor of index.byName.values()) unique.set(anchor.identity, anchor)
  const lines = [...unique.values()]
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
    .slice(0, max)
    .map(
      (anchor) =>
        `- ${anchor.name}: ${anchor.weightKg} kg × ${anchor.reps} (${anchor.lastDate.slice(0, 10)})`,
    )
  return lines.join("\n")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ai-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/lib/history.ts tests/unit/ai-history.test.ts
git commit -m "feat(ai): history index and prompt summary"
```

---

### Task 3: Deterministic personalization pass

**Files:**
- Create: `src/features/ai/lib/personalize.ts`
- Test: `tests/unit/ai-personalize.test.ts`

**Interfaces:**
- Consumes: `AiRoutine`, `AiRoutineExercise` from `@/features/ai/lib/contract`; `HistoryAnchor`, `HistoryIndex` from `@/features/ai/lib/history`; `parseRepRange` from `@/features/ai/lib/reps`; `normalizeCatalogKey` from `@/features/ai/lib/resolve-exercises`.
- Produces: `PERSONALIZATION_VERSION`, `roundToIncrement(kg, increment?)`, `personalizeRoutine(routine, index): { routine: AiRoutine; applied: number }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { buildHistoryIndex, type HistorySession } from "@/features/ai/lib/history"
import { PERSONALIZATION_VERSION, personalizeRoutine, roundToIncrement } from "@/features/ai/lib/personalize"
import type { AiRoutine } from "@/features/ai/lib/contract"

function routine(targetWeightKg: number | null, reps: string, exerciseId: string | null = "ex1"): AiRoutine {
  return {
    name: "Plan",
    goal: null,
    days: [
      {
        weekday: 1,
        label: null,
        exercises: [
          {
            sourceId: "Barbell_Squat",
            name: "Barbell Squat",
            sets: 3,
            reps,
            restSeconds: 90,
            targetWeightKg,
            timerType: "none",
            exerciseId,
            customName: null,
          },
        ],
      },
    ],
  }
}

function indexWith(weightKg: number, reps: number) {
  const sessions: HistorySession[] = [
    {
      completedAt: "2026-09-20T10:00:00.000Z",
      exercises: [{ exerciseId: "ex1", nameSnapshot: "Barbell Squat", sets: [{ weightKg, reps }] }],
    },
  ]
  return buildHistoryIndex(sessions)
}

describe("roundToIncrement", () => {
  it("rounds to the nearest 2.5 kg", () => {
    expect(roundToIncrement(97.12)).toBe(97.5)
    expect(roundToIncrement(101)).toBe(100)
  })
})

describe("personalizeRoutine", () => {
  it("raises the load when the top of the range was hit", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(100, 12))
    expect(result.applied).toBe(1)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(105)
  })

  it("holds when reps are inside the range", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(100, 10))
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(100)
  })

  it("deloads when below the range", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(100, 5))
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(95)
  })

  it("forces one increment when rounding collapses a raise", () => {
    const result = personalizeRoutine(routine(null, "8-12"), indexWith(20, 12))
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(22.5)
  })

  it("leaves an exercise with no history untouched", () => {
    const result = personalizeRoutine(routine(60, "8-12"), buildHistoryIndex([]))
    expect(result.applied).toBe(0)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(60)
  })

  it("leaves an unparseable rep range untouched", () => {
    const result = personalizeRoutine(routine(60, "AMRAP"), indexWith(100, 10))
    expect(result.applied).toBe(0)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(60)
  })

  it("matches a custom exercise by name", () => {
    const custom = routine(null, "8-12", null)
    if (custom.days[0]) {
      custom.days[0].exercises[0] = {
        ...custom.days[0].exercises[0]!,
        sourceId: null,
        name: null,
        customName: "Barbell Squat",
      }
    }
    const sessions: HistorySession[] = [
      {
        completedAt: "2026-09-20T10:00:00.000Z",
        exercises: [{ exerciseId: null, nameSnapshot: "barbell squat", sets: [{ weightKg: 80, reps: 12 }] }],
      },
    ]
    const result = personalizeRoutine(custom, buildHistoryIndex(sessions))
    expect(result.applied).toBe(1)
    expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(85)
  })

  it("exposes a personalization version", () => {
    expect(PERSONALIZATION_VERSION).toBe("1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ai-personalize.test.ts`
Expected: FAIL — cannot resolve `@/features/ai/lib/personalize`.

- [ ] **Step 3: Write the implementation**

```ts
import type { AiRoutine, AiRoutineExercise } from "@/features/ai/lib/contract"
import type { HistoryAnchor, HistoryIndex } from "@/features/ai/lib/history"
import { parseRepRange } from "@/features/ai/lib/reps"
import { normalizeCatalogKey } from "@/features/ai/lib/resolve-exercises"

export const PERSONALIZATION_VERSION = "1"
const LOAD_INCREASE = 1.05
const LOAD_DELOAD = 0.95
const LOAD_MIN_RATIO = 0.9
const LOAD_MAX_RATIO = 1.1
const LOAD_INCREMENT_KG = 2.5

export function roundToIncrement(kg: number, increment = LOAD_INCREMENT_KG): number {
  return Math.round(kg / increment) * increment
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function anchorFor(exercise: AiRoutineExercise, index: HistoryIndex): HistoryAnchor | null {
  if (exercise.exerciseId) {
    const byId = index.byExerciseId.get(exercise.exerciseId)
    if (byId) return byId
  }
  const name = exercise.customName ?? exercise.name
  if (name) {
    const byName = index.byName.get(normalizeCatalogKey(name))
    if (byName) return byName
  }
  return null
}

function nextLoad(anchor: HistoryAnchor, reps: { min: number; max: number }): number | null {
  if (anchor.weightKg <= 0) return null

  const base = roundToIncrement(anchor.weightKg)
  const min = roundToIncrement(anchor.weightKg * LOAD_MIN_RATIO)
  const max = roundToIncrement(anchor.weightKg * LOAD_MAX_RATIO)

  let direction: -1 | 0 | 1 = 0
  let factor = 1
  if (anchor.reps >= reps.max) {
    factor = LOAD_INCREASE
    direction = 1
  } else if (anchor.reps < reps.min) {
    factor = LOAD_DELOAD
    direction = -1
  }

  let next = roundToIncrement(clamp(anchor.weightKg * factor, anchor.weightKg * LOAD_MIN_RATIO, anchor.weightKg * LOAD_MAX_RATIO))
  if (direction !== 0 && next === base) {
    next = roundToIncrement(
      clamp(anchor.weightKg + direction * LOAD_INCREMENT_KG, anchor.weightKg * LOAD_MIN_RATIO, anchor.weightKg * LOAD_MAX_RATIO),
    )
  }
  next = clamp(next, min, max)
  return next > 0 ? next : null
}

export function personalizeRoutine(
  routine: AiRoutine,
  index: HistoryIndex,
): { routine: AiRoutine; applied: number } {
  let applied = 0
  const days = routine.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      const anchor = anchorFor(exercise, index)
      if (!anchor) return exercise
      const reps = parseRepRange(exercise.reps)
      if (!reps) return exercise
      const next = nextLoad(anchor, reps)
      if (next == null) return exercise
      applied += 1
      return { ...exercise, targetWeightKg: next }
    }),
  }))
  return { routine: { ...routine, days }, applied }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ai-personalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/lib/personalize.ts tests/unit/ai-personalize.test.ts
git commit -m "feat(ai): deterministic personalization pass"
```

---

### Task 4: `personalize` input flag

**Files:**
- Modify: `src/features/ai/lib/contract.ts` (the `aiJobInputSchema` object)
- Test: `tests/unit/ai-contract.test.ts`

**Interfaces:**
- Produces: `aiJobInputSchema` gains `personalize: z.boolean().default(true)`; `AiJobInput` includes `personalize: boolean` on output.

- [ ] **Step 1: Write the failing test** (append to `tests/unit/ai-contract.test.ts`)

```ts
describe("aiJobInputSchema.personalize", () => {
  const base = { goal: "build_muscle", experience: "beginner", equipment: [], daysPerWeek: 3 }

  it("defaults personalize to true", () => {
    expect(aiJobInputSchema.parse(base).personalize).toBe(true)
  })

  it("accepts an explicit false", () => {
    expect(aiJobInputSchema.parse({ ...base, personalize: false }).personalize).toBe(false)
  })

  it("rejects a non-boolean", () => {
    expect(aiJobInputSchema.safeParse({ ...base, personalize: "yes" }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ai-contract.test.ts`
Expected: FAIL — `personalize` is `undefined` / unknown key.

- [ ] **Step 3: Add the field**

In `src/features/ai/lib/contract.ts`, inside `aiJobInputSchema`:

```ts
export const aiJobInputSchema = z.object({
  goal: z.enum(GOALS),
  experience: z.enum(EXPERIENCES),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  daysPerWeek: z.number().int().min(1).max(7),
  focus: z.string().trim().max(100).nullable().optional(),
  personalize: z.boolean().default(true),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ai-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/lib/contract.ts tests/unit/ai-contract.test.ts
git commit -m "feat(ai): personalize input flag"
```

---

### Task 5: Prompt history block

**Files:**
- Modify: `src/features/ai/lib/prompt.ts` (`PROMPT_VERSION`, `buildPrompt`)
- Test: `tests/unit/ai-prompt.test.ts`

**Interfaces:**
- Consumes: optional `historySummary: string`.
- Produces: `PROMPT_VERSION = "2"`; `buildPrompt(input, catalog, historySummary?)`.

- [ ] **Step 1: Write the failing test** (append)

```ts
it("bumps the prompt version", () => {
  expect(PROMPT_VERSION).toBe("2")
})

it("includes the history summary when provided", () => {
  const prompt = buildPrompt(
    { goal: "build_muscle", experience: "beginner", equipment: ["barbell"], daysPerWeek: 3, focus: null, personalize: true },
    [{ sourceId: "Barbell_Squat", name: "Barbell Squat", primaryMuscles: ["quadriceps"] }],
    "- Barbell Squat: 100 kg × 5 (2026-09-20)",
  )
  expect(prompt).toContain("Recent training")
  expect(prompt).toContain("100 kg")
})

it("omits the history block when no summary is provided", () => {
  const prompt = buildPrompt(
    { goal: "build_muscle", experience: "beginner", equipment: ["barbell"], daysPerWeek: 3, focus: null, personalize: true },
    [{ sourceId: "Barbell_Squat", name: "Barbell Squat", primaryMuscles: ["quadriceps"] }],
  )
  expect(prompt).not.toContain("Recent training")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ai-prompt.test.ts`
Expected: FAIL — `PROMPT_VERSION` is `"1"` / history block missing.

- [ ] **Step 3: Update the prompt builder**

In `src/features/ai/lib/prompt.ts`:

```ts
export const PROMPT_VERSION = "2"
```

Change the signature and append a block:

```ts
export function buildPrompt(
  input: AiJobInput,
  catalog: PromptCatalogEntry[],
  historySummary?: string,
): string {
  // ...existing prompt construction into `lines`...
  if (historySummary && historySummary.trim().length > 0) {
    lines.push(
      "",
      "Recent training (last 3 sessions, 12 weeks):",
      historySummary.trim(),
      "Choose loads close to the athlete's recent performance and keep them conservative.",
    )
  }
  return lines.join("\n")
}
```

(Keep the existing JSON-contract, allowed-`sourceId`, and determinism lines.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ai-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/lib/prompt.ts tests/unit/ai-prompt.test.ts
git commit -m "feat(ai): add history summary to the generation prompt"
```

---

### Task 6: History repository query

**Files:**
- Modify: `src/server/repositories/ai.repository.ts`
- Test: `tests/integration/ai-history.test.ts`

**Interfaces:**
- Consumes: `HistorySession` from `@/features/ai/lib/history`.
- Produces: `listRecentExerciseHistory(userId, { since, maxSessions }): Promise<HistorySession[]>`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listRecentExerciseHistory } from "@/server/repositories/ai.repository"
import { assertCatalogSeeded } from "./helpers/catalog"

const PREFIX = "ai_history_it_"

async function makeUser() {
  return prisma.user.create({
    data: { email: `${PREFIX}${Date.now()}${Math.random()}@e2e-test.local`, profile: { create: {} } },
  })
}

async function seedSession(userId: string, exerciseId: string, completedAt: Date, weightKg: number, reps: number) {
  return prisma.workoutSession.create({
    data: {
      userId,
      name: "s",
      status: "completed",
      completedAt,
      snapshot: {},
      exercises: {
        create: {
          exerciseId,
          order: 0,
          nameSnapshot: "Barbell Full Squat",
          completed: true,
          sets: { create: { setNumber: 1, type: "working", weightKg, reps, completedAt } },
        },
      },
    },
  })
}

describe("listRecentExerciseHistory", () => {
  beforeAll(assertCatalogSeeded)
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  })

  it("returns only completed working sets within the window", async () => {
    const user = await makeUser()
    const exercise = await prisma.exercise.findFirstOrThrow({ where: { sourceId: "Barbell_Full_Squat" } })
    await seedSession(user.id, exercise.id, new Date("2026-09-20T10:00:00Z"), 100, 5)
    await seedSession(user.id, exercise.id, new Date("2020-01-01T10:00:00Z"), 500, 1)

    const rows = await listRecentExerciseHistory(user.id, {
      since: new Date(Date.now() - 84 * 86_400_000),
      maxSessions: 60,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.exercises[0]?.sets).toEqual([{ weightKg: 100, reps: 5 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"; docker compose up -d db; pnpm db:seed; pnpm vitest run --config vitest.integration.config.ts tests/integration/ai-history.test.ts`
Expected: FAIL — `listRecentExerciseHistory` is not exported.

- [ ] **Step 3: Implement the query**

In `src/server/repositories/ai.repository.ts`:

```ts
import type { HistorySession } from "@/features/ai/lib/history"

export async function listRecentExerciseHistory(
  userId: string,
  options: { since: Date; maxSessions: number },
): Promise<HistorySession[]> {
  const sessions = await prisma.workoutSession.findMany({
    where: { userId, status: "completed", completedAt: { gte: options.since } },
    orderBy: { completedAt: "desc" },
    take: options.maxSessions,
    select: {
      completedAt: true,
      exercises: {
        where: { completed: true, skipped: false },
        select: {
          exerciseId: true,
          nameSnapshot: true,
          sets: {
            where: {
              type: "working",
              completedAt: { not: null },
              weightKg: { not: null },
              reps: { not: null },
            },
            select: { weightKg: true, reps: true },
          },
        },
      },
    },
  })

  return sessions.flatMap((session) =>
    session.completedAt
      ? [
          {
            completedAt: session.completedAt.toISOString(),
            exercises: session.exercises
              .filter((exercise) => exercise.sets.length > 0)
              .map((exercise) => ({
                exerciseId: exercise.exerciseId,
                nameSnapshot: exercise.nameSnapshot,
                sets: exercise.sets.map((set) => ({
                  weightKg: set.weightKg ?? 0,
                  reps: set.reps ?? 0,
                })),
              })),
          },
        ]
      : [],
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ai-history.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/repositories/ai.repository.ts tests/integration/ai-history.test.ts
git commit -m "feat(ai): history query for personalization"
```

---

### Task 7: Service wiring + provenance

**Files:**
- Modify: `src/features/ai/lib/contract.ts` (`AiJobResult`, `aiJobResultSchema`)
- Modify: `src/server/services/ai.service.ts` (`buildJobResult`, `generateRoutine`, `runJob`)
- Test: `tests/integration/ai-service.test.ts`

**Interfaces:**
- Consumes: `listRecentExerciseHistory` (Task 6), `buildHistoryIndex`/`buildHistorySummary`/`HISTORY_*` (Task 2), `personalizeRoutine`/`PERSONALIZATION_VERSION` (Task 3), `buildPrompt` history arg (Task 5).
- Produces: `AiJobResult` gains `personalized: boolean`, `personalizedCount: number`, `personalizationVersion: string`; `buildJobResult(source, generated, resolved, historyIndex: HistoryIndex | null)`.

- [ ] **Step 1: Write the failing integration tests** (append to `tests/integration/ai-service.test.ts`)

```ts
it("personalizes a succeeded result from recent history", async () => {
  const user = await makeUser()
  const exercise = await prisma.exercise.findFirstOrThrow({ where: { sourceId: "Barbell_Full_Squat" } })
  await prisma.workoutSession.create({
    data: {
      userId: user.id,
      name: "hist",
      status: "completed",
      completedAt: new Date(),
      snapshot: {},
      exercises: {
        create: {
          exerciseId: exercise.id,
          order: 0,
          nameSnapshot: "Barbell Full Squat",
          completed: true,
          sets: { create: { setNumber: 1, type: "working", weightKg: 100, reps: 12, completedAt: new Date() } },
        },
      },
    },
  })
  const job = await createJob(user.id, { goal: "build_muscle", experience: "beginner", equipment: ["barbell"], daysPerWeek: 3 })
  await runJob(job.id, validProvider()) // mock returns Barbell_Full_Squat "8-12" per the existing fixture
  const stored = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })
  const result = stored.result as { personalized: boolean; personalizedCount: number; routine: { days: { exercises: { targetWeightKg?: number | null }[] }[] } }
  expect(result.personalized).toBe(true)
  expect(result.personalizedCount).toBeGreaterThan(0)
  expect(result.routine.days[0]?.exercises[0]?.targetWeightKg).toBe(105)
})

it("leaves the load unchanged when personalize is false", async () => {
  const user = await makeUser()
  const exercise = await prisma.exercise.findFirstOrThrow({ where: { sourceId: "Barbell_Full_Squat" } })
  await prisma.workoutSession.create({
    data: {
      userId: user.id, name: "hist", status: "completed", completedAt: new Date(), snapshot: {},
      exercises: { create: { exerciseId: exercise.id, order: 0, nameSnapshot: "Barbell Full Squat", completed: true, sets: { create: { setNumber: 1, type: "working", weightKg: 100, reps: 12, completedAt: new Date() } } } },
    },
  })
  const job = await createJob(user.id, { goal: "build_muscle", experience: "beginner", equipment: ["barbell"], daysPerWeek: 3, personalize: false })
  await runJob(job.id, validProvider())
  const stored = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })
  expect((stored.result as { personalized: boolean }).personalized).toBe(false)
})

it("marks personalized false when the user has no history", async () => {
  const user = await makeUser()
  const job = await createJob(user.id, { goal: "build_muscle", experience: "beginner", equipment: ["barbell"], daysPerWeek: 3 })
  await runJob(job.id, validProvider())
  const stored = await prisma.aiJob.findUniqueOrThrow({ where: { id: job.id } })
  expect((stored.result as { personalized: boolean }).personalized).toBe(false)
})
```

Use the existing test file's `validProvider()` fixture (the fake that returns the `Barbell_Full_Squat` routine with `reps: "8-12"`); if the fixture returns no `targetWeightKg`, the first assertion holds.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --config vitest.integration.config.ts tests/integration/ai-service.test.ts`
Expected: FAIL — `personalized` is undefined / type error.

- [ ] **Step 3: Implement**

`src/features/ai/lib/contract.ts` — extend the result:

```ts
export type AiJobResult = {
  source: "ai" | "template"
  customNames: string[]
  routine: AiRoutine
  personalized: boolean
  personalizedCount: number
  personalizationVersion: string
}

export const aiJobResultSchema = z.object({
  source: z.enum(["ai", "template"]),
  customNames: z.array(z.string()),
  routine: storedRoutineSchema,
  personalized: z.boolean(),
  personalizedCount: z.number().int().min(0),
  personalizationVersion: z.string(),
})
```

`src/server/services/ai.service.ts` — imports:

```ts
import { HISTORY_MAX_SESSIONS, HISTORY_WINDOW_DAYS, buildHistoryIndex, buildHistorySummary, type HistoryIndex } from "@/features/ai/lib/history"
import { PERSONALIZATION_VERSION, personalizeRoutine } from "@/features/ai/lib/personalize"
```

`buildJobResult` gains the history index and applies the pass:

```ts
const DAY_MS = 86_400_000

function buildJobResult(
  source: AiJobResult["source"],
  generated: GeneratedRoutine,
  resolved: { days: ResolvedDay[]; customNames: string[] },
  historyIndex: HistoryIndex | null,
): AiJobResult {
  const routine: AiRoutine = {
    name: generated.name,
    goal: generated.goal ?? null,
    days: mergeResolved(generated, resolved.days),
  }
  let personalized = false
  let personalizedCount = 0
  if (historyIndex) {
    try {
      const applied = personalizeRoutine(routine, historyIndex)
      routine.days = applied.routine.days
      personalizedCount = applied.applied
      personalized = applied.applied > 0
    } catch (error) {
      logger.warn(
        { event: "ai.personalization_failed", error: error instanceof Error ? error.message : "unknown error" },
        "personalization failed; storing the un-personalized result",
      )
    }
  }
  return { source, customNames: resolved.customNames, routine, personalized, personalizedCount, personalizationVersion: PERSONALIZATION_VERSION }
}
```

`generateRoutine` gains the summary:

```ts
async function generateRoutine(
  provider: AiProvider,
  input: AiJobInput,
  catalog: PromptCatalogEntry[],
  historySummary?: string,
): Promise<GeneratedRoutine> {
  const prompt = buildPrompt(input, catalog, historySummary)
  // ...rest unchanged, using `prompt`...
}
```

`runJob` builds the index and threads it through both paths:

```ts
const input = aiJobInputSchema.parse(job.input)
const catalogEntries = await repo.listCatalogEntries()
const catalog = buildCatalogIndex(catalogEntries)
const promptCatalog = toPromptCatalog(catalogEntries)

let historyIndex: HistoryIndex | null = null
if (input.personalize) {
  try {
    const sessions = await repo.listRecentExerciseHistory(job.userId, {
      since: new Date(Date.now() - HISTORY_WINDOW_DAYS * DAY_MS),
      maxSessions: HISTORY_MAX_SESSIONS,
    })
    const index = buildHistoryIndex(sessions)
    historyIndex = index.hasData ? index : null
  } catch (error) {
    logger.warn(
      { event: "ai.history_failed", jobId, error: error instanceof Error ? error.message : "unknown error" },
      "history load failed; generating without personalization",
    )
    historyIndex = null
  }
}

let result: AiJobResult
let model: string | null = null
try {
  const activeProvider = provider ?? getProvider()
  model = process.env.AI_MODEL?.trim() || null
  const generated = await generateRoutine(
    activeProvider,
    input,
    promptCatalog,
    historyIndex ? buildHistorySummary(historyIndex) : undefined,
  )
  result = buildJobResult("ai", generated, resolveExercises(generated, catalog), historyIndex)
} catch (error) {
  // ...existing fallback log...
  const fallback = buildFallbackRoutine(input, catalog)
  result = buildJobResult("template", fallback, resolveExercises(fallback, catalog), historyIndex)
  model = null
}
```

`AiRoutine` must be imported as a type from the contract for the local annotation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/ai-contract.test.ts tests/unit/ai-routes.test.ts && pnpm vitest run --config vitest.integration.config.ts tests/integration/ai-service.test.ts`
Expected: PASS. If any existing assertion compared a full `result` object, update it to assert the new fields explicitly.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/lib/contract.ts src/server/services/ai.service.ts tests/integration/ai-service.test.ts
git commit -m "feat(ai): personalize job results with provenance"
```

---

### Task 8: i18n copy

**Files:**
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/es.json`
- Test: `tests/unit/ai-messages.test.ts`

- [ ] **Step 1: Add the keys** under the existing `ai` namespace in both locales:
  - `ai.form.personalize` — "Use my training history" / "Usar mi historial de entrenamiento"
  - `ai.form.personalizeHint` — "Tunes recommended weights to your recent workouts." / "Ajusta los pesos a tus entrenamientos recientes."
  - `ai.preview.personalized` — "Tuned to your last 3 sessions" / "Ajustada a tus últimas 3 sesiones"
  - `ai.disclaimerData` — "When enabled, your recent training (exercise names and weights) may be shared with the AI provider to tailor loads." / "Cuando está activado, tu entrenamiento reciente (nombres de ejercicios y pesos) puede compartirse con el proveedor de IA para ajustar las cargas."

- [ ] **Step 2: Add the keys to the required list** in `tests/unit/ai-messages.test.ts` (the `AI`/`ai` required-keys array): `form.personalize`, `form.personalizeHint`, `preview.personalized`, `disclaimerData`.

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run tests/unit/ai-messages.test.ts tests/unit/i18n.test.ts`
Expected: PASS (parity holds).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/es.json tests/unit/ai-messages.test.ts
git commit -m "feat(i18n): ai personalization copy (en/es)"
```

---

### Task 9: UI — opt-out toggle, personalization note, disclaimer

**Files:**
- Modify: `src/features/ai/components/generate-form.tsx`
- Modify: `src/features/ai/components/routine-preview-card.tsx`
- Modify: `src/features/ai/components/disclaimer.tsx`
- Test: `tests/unit/generate-form.test.tsx`, `tests/unit/ai-preview.test.tsx`

**Interfaces:**
- Consumes: `AiJobResult` (now with `personalized`); `ai.form.personalize`, `ai.form.personalizeHint`, `ai.preview.personalized`, `ai.disclaimerData`.

- [ ] **Step 1: Write the failing component tests**

Append to `tests/unit/generate-form.test.tsx`:

```ts
it("defaults personalization on and submits it", async () => {
  const onSubmit = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GenerateForm onSubmit={onSubmit} isPending={false} />
    </NextIntlClientProvider>,
  )
  const toggle = screen.getByLabelText(en.ai.form.personalize)
  expect(toggle).toBeChecked()
  await userEvent.selectOptions(screen.getByLabelText(en.ai.form.goal), "build_muscle")
  await userEvent.selectOptions(screen.getByLabelText(en.ai.form.experience), "beginner")
  await userEvent.selectOptions(screen.getByLabelText(en.ai.form.daysPerWeek), "3")
  await userEvent.click(screen.getByRole("button", { name: en.ai.form.submit }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ personalize: true }))
})

it("submits personalize false when toggled off", async () => {
  const onSubmit = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GenerateForm onSubmit={onSubmit} isPending={false} />
    </NextIntlClientProvider>,
  )
  await userEvent.click(screen.getByLabelText(en.ai.form.personalize))
  await userEvent.selectOptions(screen.getByLabelText(en.ai.form.goal), "build_muscle")
  await userEvent.selectOptions(screen.getByLabelText(en.ai.form.experience), "beginner")
  await userEvent.selectOptions(screen.getByLabelText(en.ai.form.daysPerWeek), "3")
  await userEvent.click(screen.getByRole("button", { name: en.ai.form.submit }))
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ personalize: false }))
})
```

Append to `tests/unit/ai-preview.test.tsx`:

```ts
it("shows the personalized note only when personalized", () => {
  const { rerender } = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RoutinePreviewCard result={{ ...result, personalized: true }} onAccept={vi.fn()} onRegenerate={vi.fn()} onDiscard={vi.fn()} isAccepting={false} />
    </NextIntlClientProvider>,
  )
  expect(screen.getByText(en.ai.preview.personalized)).toBeInTheDocument()
  rerender(
    <NextIntlClientProvider locale="en" messages={en}>
      <RoutinePreviewCard result={{ ...result, personalized: false }} onAccept={vi.fn()} onRegenerate={vi.fn()} onDiscard={vi.fn()} isAccepting={false} />
    </NextIntlClientProvider>,
  )
  expect(screen.queryByText(en.ai.preview.personalized)).not.toBeInTheDocument()
})
```

(Use the existing `result` fixture in `ai-preview.test.tsx`; add `personalized: true, personalizedCount: 0, personalizationVersion: "1"` to it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/generate-form.test.tsx tests/unit/ai-preview.test.tsx`
Expected: FAIL — toggle/note not rendered.

- [ ] **Step 3: Implement**

`generate-form.tsx`: add `personalize: true` to `defaultValues`, and render a labeled checkbox (≥44px) before the submit button:

```tsx
<div className="flex flex-col gap-1">
  <label htmlFor="ai-personalize" className="flex min-h-11 cursor-pointer items-center gap-3">
    <input id="ai-personalize" type="checkbox" className="size-5" {...form.register("personalize")} />
    <span className="font-medium">{t("personalize")}</span>
  </label>
  <p className="text-muted-foreground text-sm">{t("personalizeHint")}</p>
</div>
```

`routine-preview-card.tsx`: after the template/provenance block, render:

```tsx
{result.personalized ? (
  <p className="text-primary text-sm font-medium">{t("personalized")}</p>
) : null}
```

`disclaimer.tsx`: render an additional line `{t("disclaimerData")}` beneath `ai.disclaimer`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/generate-form.test.tsx tests/unit/ai-preview.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai/components tests/unit/generate-form.test.tsx tests/unit/ai-preview.test.tsx
git commit -m "feat(ai): personalization toggle, note, and disclosure"
```

---

### Task 10: E2E, gates, roadmap

**Files:**
- Modify: `tests/e2e/ai-generation.spec.ts`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Extend the gated E2E** with seeded history. Before submitting, seed a completed session for the test user using the catalog id for `Barbell_Full_Squat` (look it up via Prisma) with a working set `weightKg: 100, reps: 12`. The mock routine's `reps: "8-12"` for that sourceId, so the deterministic pass raises the load to `105`. Assert the preview shows `105` (or the accepted routine's exercise `targetWeightKg === 105` via a DB poll). Keep `test.skip(process.env.AI_E2E !== "1", …)`.

- [ ] **Step 2: Run the gated E2E**

Run: `AI_E2E=1 pnpm exec playwright test tests/e2e/ai-generation.spec.ts`
Expected: PASS. Also run the default `pnpm e2e` and confirm the spec is skipped and the rest pass.

- [ ] **Step 3: Run all gates**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:coverage`, `pnpm build`, `pnpm e2e`. Fix legitimate issues without weakening tests. Report the outcome of each.

- [ ] **Step 4: Update the roadmap**

In `docs/ROADMAP.md`: set the current-branch line to `phase4b-ai-personalization`; add a `4B | AI Personalization | Done (pending merge)` row with the spec/plan/SDD paths; move 4B from "Next" to "Done (pending merge, depends on 4A)"; add a deploy note only if behavior changed operationally (no worker/env changes). Note the next phase if any (otherwise "no further phases planned; next is release hardening").

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ai-generation.spec.ts docs/ROADMAP.md
git commit -m "test(e2e): personalized ai generation; docs: mark 4b complete"
```

---

## Self-Review

- **Spec coverage:** §3 model → T6 (query) + T2 (index) + T3 (progression); §4 data/provenance → T7 (+T4 input); §5 history query/index → T2/T6; §6 prompt → T5; §7 safety net → T3/T7; §8 service wiring/error → T7; §9 API → T4/T7; §10 UI → T9; §11 i18n → T8; §12 testing → each task; §13 risks → Review Focus + tests. No gaps.
- **Placeholders:** none; every code/test step carries concrete code or an exact command.
- **Type consistency:** `HistorySession`/`HistoryIndex`/`HistoryAnchor` (T2) consumed by T3/T6/T7; `personalizeRoutine` signature (T3) consumed by T7; `AiJobResult` fields (T7) consumed by T9's `personalized`; `aiJobInputSchema.personalize` (T4) consumed by T7/T9.
- **Review Focus:** #1 → T7 (history try/catch) + T7 personalization try/catch; #2 → T3 no-history test; #3 → T3 unparseable test; #4 → T3 raise/hold/deload/round/clamp tests; #5 → T4 default + T7 `personalize:false` test.
