# Gym Tracker — Per-Set Prescribed Targets (Reps / Weight / RPE) — Design Spec

- **Date:** 2026-09-23
- **Status:** Draft (awaiting review)
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding)
- **Depends on:** Phases 1, 1.5, 2A, 2B, 2C + Expressive Volt redesign (merged to `main` at `1d082b7`)

## 1. Objective

Let a routine prescribe a full target **per set** — reps, weight and RPE — so a workout
starts with every set already filled in. The user only adjusts values as they improve or
as their capacity on the day dictates, spending less time tapping in the app and more
time training.

Today `RoutineExercise` has a single `targetReps` (string) and `targetWeightKg` applied to
all sets, and no RPE. `seedSets()` already copies `reps`/`weightKg` into each seeded set,
but `build-local-session.ts` forces `rpe: null`, and the routine editor exposes neither
weight nor RPE.

### Success criteria

- In the routine editor, each exercise shows one row per set, each with its own reps,
  weight and RPE; sets can be added/removed.
- Starting a workout from that routine opens every set pre-filled with its prescribed
  reps, weight and RPE.
- The user can edit any of those values in the runner and the change is saved (existing
  session-persistence path), without touching the routine.
- Routines created before this change keep working (fallback), with no data migration.
- All copy is localized (EN/ES); inputs are usable with keyboard/screen reader and
  large touch targets; weight respects the profile's unit system.

### Non-goals

- Per-set **set type** prescription (warm-up/drop/failure) — all seeded sets stay `working`.
- Templates/recommended plans shipping per-set targets (editor + runner only).
- Auto-progression, suggested weights, or PR detection over time.
- Editing a **completed** session.
- Changing the session-persistence/offline flow.

## 2. Scope

| Area | In scope |
|---|---|
| `RoutineExercise.setTargets` (Prisma + migration) | Yes |
| Zod input schema for per-set targets | Yes |
| Routine repository/service/DTO plumbing | Yes |
| Routine draft store (edit / add / remove set) | Yes |
| Routine editor per-set UI (`exercise-fields`) | Yes |
| Snapshot + `seedSets` per-set seeding (incl. RPE) | Yes |
| Runner prefill (uses existing `SetRow`) | Yes |
| i18n keys (EN/ES) | Yes |
| Templates, set types, auto-progression | No |

## 3. Data model

New nullable JSON column on `RoutineExercise`:

```prisma
model RoutineExercise {
  // ...existing fields unchanged...
  targetSets     Int       @default(3)
  targetReps     String    @default("10")   // legacy fallback
  targetWeightKg Float?                     // legacy fallback
  setTargets     Json?                      // NEW: RoutineSetTarget[] | null
}
```

TypeScript type (shared, single source of truth):

```ts
export type RoutineSetTarget = {
  reps: number | null
  weightKg: number | null
  rpe: number | null
}
```

Rules:

- When `setTargets` is present, `targetSets` equals `setTargets.length` and each entry maps
  to `setNumber = index + 1`.
- `targetReps` / `targetWeightKg` are retained as the **legacy fallback** used when
  `setTargets` is null (pre-migration routines), and continue to be written in sync
  (`targetReps` = first set's reps as a string, `targetWeightKg` = first set's weight) so
  older display paths and templates keep working.
- Migration: `prisma migrate dev --name routine_set_targets` (adds one nullable column; no
  backfill).

## 4. Validation (Zod)

New shared schema in `src/features/routines/schemas/routine.ts`:

```ts
export const routineSetTargetSchema = z.object({
  reps: z.number().int().min(1).max(100).nullable().default(null),
  weightKg: z.number().positive().max(1000).nullable().default(null),
  rpe: z.number().int().min(1).max(10).nullable().default(null),
})
export type RoutineSetTarget = z.infer<typeof routineSetTargetSchema>
```

`routineExerciseInputSchema` gains:

```ts
setTargets: z.array(routineSetTargetSchema).min(1).max(20).nullable().default(null),
```

plus a `.refine` that, when `setTargets` is non-null, requires
`setTargets.length === targetSets` (message + `path: ["setTargets"]`).

A pure parser normalizes raw JSON at the server boundary:

```ts
// src/features/routines/lib/set-targets.ts
export function parseSetTargets(value: unknown): RoutineSetTarget[] | null
```

Returns `null` for null/absent; uses `safeParse` and returns `null` for malformed data
(fail-safe, never throws into the request path).

## 5. Server layer

- `src/server/repositories/routine.repository.ts`
  - `routineSelect`: add `setTargets: true` to the exercise select.
  - `RoutineDayWriteInput.exercises[]`: add `setTargets: RoutineSetTarget[] | null`.
  - `replaceDays` create payload: `setTargets: e.setTargets ?? Prisma.JsonNull`.
  - `duplicateSource`: select `setTargets` and deep-copy it.
  - Add a small `normalizeRoutine(row)` that maps each exercise's raw JSON through
    `parseSetTargets`, applied to the results of `findActiveByUser`, `findByIdForUser`,
    `createBlank`, `createWithDays`, `replaceDays`, `setActive` so the returned DTO carries
    a typed `setTargets`.
- `src/server/services/routine.service.ts`
  - `replaceRoutine` already spreads `...e`; `setTargets` flows through. `createRoutineFromTemplate`
    leaves `setTargets` unset (templates unchanged).
- `src/features/routines/hooks/use-active-routine.ts`
  - `RoutineDTO` exercise type gains `setTargets: RoutineSetTarget[] | null`.
  - `use-routine.ts`, `use-routines.ts` and other DTO consumers inherit the same shape.

## 6. Client state (draft store)

`src/features/routines/stores/routine-draft-store.ts`

- `DraftExercise` gains `setTargets: RoutineSetTarget[]`.
- `RoutineDraftSource` exercise shape gains `setTargets: RoutineSetTarget[] | null`.
- `toDraftDay`: map `setTargets`; if null, synthesize `targetSets` entries from the legacy
  `targetReps` (parsed) + `targetWeightKg`, `rpe: null`.
- `addExercises`: default 3 working sets `{ reps: 10, weightKg: null, rpe: null }`.
- `toRoutineInput`: emit `setTargets` and keep `targetSets`/`targetReps`/`targetWeightKg`
  in sync (`targetReps` = first set's reps as string; `targetWeightKg` = first set's weight).
- New actions:
  - `updateSetTarget(dayId, exerciseId, setNumber, patch: Partial<RoutineSetTarget>)`
  - `addSet(dayId, exerciseId)` — appends a copy of the last set (or defaults); updates `targetSets`.
  - `removeSet(dayId, exerciseId, setNumber)` — removes; min 1 set; updates `targetSets`.

## 7. Routine editor UI

`src/features/routines/components/exercise-fields.tsx`

- Replace the single reps `Input` with a **per-set list**: one row per set showing
  `#N`, reps, weight, RPE, and a remove-set control; a trailing "Add set" button.
- Reps / RPE: numeric inputs (RPE 1–10).
- Weight: numeric input displayed in the profile's unit system via `units.ts`
  (`displayWeight` / `parseWeightToKg` / `formatWeight`), persisted as kg. Null shows empty
  (no prescription).
- The sets count is derived from `setTargets.length`; `targetSets` is kept in sync by the store.
- Keep `rest`, `timer`, `workSeconds`, `rounds`, `notes` unchanged.
- Mobile-first: inputs ≥44px tall; rows wrap cleanly at 375px.

## 8. Session seeding & runner

- `src/features/workouts/lib/session-snapshot.ts`
  - `SnapshotExercise` gains `setTargets: RoutineSetTarget[] | null`; `buildSessionSnapshot`
    copies it.
  - `seedSets` returns `{ setNumber, type: "working", reps, weightKg, rpe }`:
    - If `setTargets` present: one entry per target, using its reps/weightKg/rpe.
    - Else legacy: `count` entries with parsed `targetReps` + `targetWeightKg`, `rpe: null`.
- `src/features/workouts/lib/build-local-session.ts`
  - Stop overriding `rpe: null`; pass the seeded `rpe` through.
- Runner (`ExerciseView` / `SetRow`): no structural change — sets open pre-filled and remain
  editable. The target chip shows `"{targetSets} sets"` when per-set targets exist;
  otherwise keeps today's `"{sets} × {reps}"` legacy string.
- `WorkoutSession.snapshot` keeps the full `setTargets` for historical fidelity.

## 9. i18n

New keys (parity in `en.json` and `es.json`):

- `routineEditor`: `weight`, `rpe`, `setNumber` (`"Set {number}"`), `addSet`,
  `removeSet`, `perSetTargets` (section label).
- `runner.sets`: reuse existing `reps`/`weight`/`rpe`; add `setsCount`
  (`"{count, plural, one {# set} other {# sets}}"`) if the chip switches to a count.

No existing key is renamed or removed.

## 10. Backward compatibility & migration

- Existing routines have `setTargets = null` → editor synthesizes per-set rows from the
  legacy single reps/weight; seeding falls back to the legacy path. No data backfill.
- Duplicating an old routine preserves `setTargets` (null) and continues to fall back.
- No API breaking change: `setTargets` is additive and nullable.

## 11. Testing (TDD)

- `schema`: valid setTargets accepted; length ≠ targetSets rejected; rpe out of range rejected;
  `parseSetTargets` returns null for malformed JSON.
- `routine-draft-store`: `updateSetTarget`, `addSet`, `removeSet`, and `toRoutineInput`
  keep `targetSets`/`setTargets`/`targetReps` in sync; hydrate from legacy null targets.
- `seedSets`: per-set seeding incl. RPE; legacy fallback when `setTargets` is null.
- `build-local-session`: seeded sets carry the prescribed RPE (no longer null).
- `exercise-fields`: renders one row per set, edits update the draft, add/remove set works.
- Server: `replaceDays` writes `setTargets`; `normalizeRoutine` parses raw JSON.
- Full gates: `pnpm lint`, `pnpm typecheck`, `pnpm test` green; no integration/e2e regressions.

## 12. Risks / open questions

- Prisma `Json` null semantics: writes must use `Prisma.JsonNull` (not bare `null`) to clear
  the column; reads return `JsonValue` and must pass through `parseSetTargets`.
- Weight unit conversion must not drift on repeated unit toggles (store kg; convert for display only).
- The target chip wording when per-set targets exist is a minor UX choice; default to a
  `"{count} sets"` count and revisit if needed.
