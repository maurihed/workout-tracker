# Gym Tracker — Phase 4B AI Personalization — Design Spec

- **Date:** 2026-09-25
- **Status:** Proposed
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding, §16)
- **Depends on:** Phase 4A (merged) — `docs/superpowers/specs/2026-09-22-gym-tracker-phase4a-ai-routine-generation-design.md`
- **Sibling:** Phase 4A (AI routine generation) — delivered separately

## 1. Objective

Make AI-generated routines **fitted to what the user has actually been lifting**. 4A generates a
routine from goal/experience/equipment/days; 4B adds a personalization stage that uses recent
completed training to choose **loads** (and only loads) so the previewed and saved routine reflects
progressive overload around the user's real working weights. Exercise selection stays
goal/equipment-driven, as in 4A.

### Success criteria

- When enabled and the user has recent history, generated exercises that the user has performed get a
  `targetWeightKg` derived from their recent best working set and whether they hit the prescribed reps.
- The model is also given a compact, capped summary of recent performance so it can propose sensible
  loads; the deterministic pass then clamps/rounds those prescriptions.
- Personalization is user-controllable (opt-out toggle, default on), disclosed, and never sends
  personally identifying data.
- With no/short history, personalization is a no-op per exercise (4A behavior preserved).
- The feature never hard-fails: any personalization error stores the un-personalized result.
- All existing 4A contract, preview/accept, provenance, fallback, and safety behavior still holds.
- All copy localized (EN/ES); all gates green.

### Non-goals (out of scope for 4B)

- Changing **exercise selection** from history (selection remains goal/equipment-driven).
- A "personalize/adapt an existing routine" action, or any ongoing auto-coaching loop.
- Storing a first-class personal-record table, RPE-driven autoregulation, or deload-week scheduling.
- Personalization from body metrics, nutrition, or schedule adherence.
- Changing the 4A job lifecycle, provider abstraction, or fallback guarantee.

## 2. Relationship to 4A

4B reuses 4A unchanged: the `AiJob` lifecycle and pg-boss worker, the strict generation contract,
catalog resolution with custom fallback, the deterministic template fallback, preview/accept, and
provenance. 4B inserts one pure stage between resolution and storage, plus a prompt input and a UI
control.

```
runJob:
  generate (provider, prompt)  ->  normalize  ->  resolveExercises
    ->  personalizeRoutine        (NEW; skipped when opted out or no history)
    ->  build AiJobResult         ->  markSucceeded
```

The same `personalizeRoutine` stage runs on the template-fallback path, so both `source: "ai"` and
`source: "template"` results can be personalized.

## 3. Personalization model

Definitions (all pure, no DB):

- **Working set** — a `SetLog` with `type: "working"` and both `weightKg` and `reps` present, in a
  **completed** `WorkoutSession`. Warmup/drop/failure sets are ignored.
- **History window** — completed sessions in the **last 12 weeks**.
- **Anchor** — for each exercise, the user's **best working set across the last 3 sessions** that
  contained that exercise. Best = heaviest `weightKg`; ties broken by more `reps`, then most recent.
- **Matching** — history is keyed by `SessionExercise.exerciseId` when present, else by a normalized
  `nameSnapshot` (trimmed, lowercased, non-alphanumerics collapsed) — the same normalization used by
  catalog resolution.

### Progression rule (weight-first)

Let `anchor = { weightKg, reps }` and `[repMin, repMax]` be parsed from the generated `reps` range:

- `anchor.reps >= repMax` → **raise**: `next = anchor.weightKg * 1.05`.
- `anchor.reps < repMin` → **deload**: `next = anchor.weightKg * 0.95`.
- otherwise → **hold**: `next = anchor.weightKg`.

Then clamp `next` to `[0.90 * anchor.weightKg, 1.10 * anchor.weightKg]`, round to the nearest
**2.5 kg**, and — when the rule was raise or deload but rounding collapsed the change — force exactly
one 2.5 kg increment in that direction (still within the clamp band). If the result is `<= 0`, or if
`reps` cannot be parsed into a range, the exercise is left untouched.

For an exercise with **no history match**, the model's prescription is left exactly as generated
(including a `targetWeightKg` the model may have proposed).

`sets`, `reps`, and `restSeconds` are preserved from the generated/resolved routine (weight-first
progression keeps the rep range stable). The pass only asserts they remain within the 4A contract
ranges.

## 4. Migration & data model

**No schema migration.** 4B reads existing history and extends existing JSON:

- `AiJob.input` gains `personalize: boolean`.
- `AiJob.result` gains `personalized: boolean`, `personalizedCount: number`,
  `personalizationVersion: string`.
- Accepted routines continue to persist the tuned `RoutineExercise.targetWeightKg`; no new column.

## 5. History query & index

- **Repository** (`src/server/repositories/ai.repository.ts`):
  `listRecentExerciseHistory(userId, { since, maxSessions })` — selects completed sessions with
  `completedAt >= since` (12 weeks), ordered most-recent first, capped at `maxSessions` (e.g. 60), with
  their `SessionExercise` (`exerciseId`, `nameSnapshot`, `SetLog` filtered to completed working sets).
  Bounded so a heavy history never loads unbounded rows.
- **Pure index** (`src/features/ai/lib/history.ts`):
  `buildHistoryIndex(entries): HistoryIndex` groups by identity, keeps the last 3 sessions per
  exercise, picks the anchor, and exposes lookups:
  ```
  type HistoryAnchor = { identity: string; name: string; weightKg: number; reps: number; lastDate: string; sessions: number }
  type HistoryIndex = { byExerciseId: Map<string, HistoryAnchor>; byName: Map<string, HistoryAnchor>; hasData: boolean }
  ```
- `buildHistorySummary(index, { maxExercises }): string` renders ≤25 lines (most recently trained
  first), e.g. `- Barbell Squat (Barbell_Squat): 90 kg × 8 (2026-09-20)`. Returns `""` when empty.

## 6. Prompt changes

`buildPrompt(input, catalog, historySummary?)` takes an optional summary. When present, the prompt
includes a short "Recent training (last 3 sessions, 12 weeks)" section with the lines above and an
instruction to choose loads near the athlete's recent performance and keep them conservative. The
existing JSON-only contract, allowed-`sourceId` list, and determinism guidance are unchanged.
`PROMPT_VERSION` becomes `"2"`.

## 7. Deterministic safety net

New pure module `src/features/ai/lib/personalize.ts`:

- `parseRepRange(value: string): { min: number; max: number } | null` — supports `"8-12"`,
  `"8 – 12"`, `"10"`, `"10 reps"`; returns `null` when no integer is present (the exercise is then
  left untouched).
- `roundToIncrement(kg: number, increment = 2.5): number`.
- `personalizeRoutine(routine: AiRoutine, index: HistoryIndex): { routine: AiRoutine; applied: number }`
  — for each resolved exercise, match by `exerciseId` then normalized name; if matched and the rep
  range parses, overwrite `targetWeightKg` per §3 and increment `applied`; otherwise passthrough.

The pass is pure and applied to the merged `AiRoutine` (the resolved structure that keeps
`sourceId`/`name` and gains `exerciseId`/`customName`), so custom exercises match by name and
catalog exercises by id.

## 8. Service wiring & error handling

In `runJob`:

1. Read `input.personalize` (default `true`).
2. If true, call `listRecentExerciseHistory` and `buildHistoryIndex`; pass
   `buildHistorySummary(index)` to `buildPrompt`.
3. After resolution, if true, call `personalizeRoutine`; set `personalized`/`personalizedCount`.
4. Wrap steps 2–3 in a `try/catch`: on any error, log a warning and continue with the
   un-personalized prompt/result (`personalized: false`). Personalization **never** marks a job failed.
5. Provenance: `personalizationVersion = PERSONALIZATION_VERSION` (`"1"`); `promptVersion = "2"`.

The model/validation failure path and the template fallback are unchanged; the template fallback also
runs `personalizeRoutine` when opted in.

Opted out, the pipeline is byte-for-byte 4A behavior except for `promptVersion` `"2"`.

## 9. API

No new endpoints. `POST /api/ai/routines` request body gains optional `personalize: boolean`
(default `true`); `aiJobInputSchema` validates it. `AiJobDTO` gains
`personalized`, `personalizedCount`, and `personalizationVersion` on the result.

## 10. UI

- **Generate form** (`generate-form.tsx`): an opt-out checkbox "Use my training history"
  (`ai.form.personalize`, default checked) with a helper line (`ai.form.personalizeHint`) noting it
  uses recent workouts to set loads. Submits `personalize`.
- **Preview** (`routine-preview-card.tsx`): when `result.personalized`, show a note
  (`ai.preview.personalized`, e.g. "Tuned to your last 3 sessions"); exercise cards already render the
  prescription, so the tuned `targetWeightKg` is visible.
- **Disclaimer** (`disclaimer.tsx` / `ai.disclaimer`): extend to disclose that recent training may be
  shared with the AI provider when personalization is on.
- Mobile-first, tap targets ≥44px, no hardcoded copy.

## 11. i18n

New keys in both locales (parity): `ai.form.personalize`, `ai.form.personalizeHint`,
`ai.preview.personalized`, and a disclaimer key covering data sharing when enabled.

## 12. Testing

- **Unit**
  - `parseRepRange` (range, single, spaced, unparseable).
  - `buildHistoryIndex` (12-week window, last-3 selection, best working set + tie-breaks, warmup and
    incomplete-set exclusion, id/name identity).
  - `buildHistorySummary` (cap, formatting, empty).
  - `personalizeRoutine` (raise/hold/deload, clamp band, 2.5 kg rounding, no-history passthrough,
    unparseable-reps passthrough, custom-name match, `applied` count).
  - `buildPrompt` includes/omits the history block.
- **Integration (Postgres, fake provider)**
  - Seeded history + `personalize: true` → stored `result.personalized === true`,
    `personalizedCount > 0`, and a load per the algorithm.
  - `personalize: false` → `personalized === false`, load unchanged.
  - No history → `personalized === false`.
  - Provider-unavailable template fallback is still personalized when opted in.
- **Component (RTL)**
  - The toggle defaults on and submits `personalize`; toggling off submits `false`.
  - The preview shows `ai.preview.personalized` only when `personalized` is true.
- **E2E (Playwright, gated on `AI_E2E=1` as in 4A)**
  - Seed history for the test user, generate with the mock provider, assert a personalized load in the
    preview and after accept.
- **Gates:** lint, typecheck, unit, integration, coverage, build, e2e.

## 13. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Sending training history to a hosted provider | Opt-out toggle (default on), disclosure in the disclaimer; only exercise names/ids + weights/reps/dates, no PII. |
| 2 | Prompt token bloat (catalog already large) | Cap the history block to ≤25 exercises, one line each; the query is bounded. |
| 3 | Sparse/missing history | Per-exercise passthrough; whole-stage no-op; 4A behavior preserved. |
| 4 | Unit errors (kg vs display units) | Weights stay kg internally (as stored/served); display conversion is unchanged. |
| 5 | Deterministic pass overriding a good model proposal | Intended: the anchor + progression is the authority for exercises with history; the band keeps it near observed performance. |
| 6 | Unparseable `reps` strings | `parseRepRange` returns null → exercise untouched. |
| 7 | Personalization errors failing jobs | Wrapped in try/catch; falls back to the un-personalized result. |

## 14. Acceptance criteria

- A user with recent history who leaves personalization on gets loads anchored to their recent working
  sets, moved up/hold/down by the weight-first rule and rounded sensibly.
- Personalization can be turned off; with it off, results match 4A.
- Users without sufficient history get normal 4A results.
- Template-fallback results are personalized identically.
- Provenance (`personalized`, `personalizedCount`, `personalizationVersion`) is stored and surfaced.
- The disclosure is shown; EN/ES parity holds; all gates green.

## 15. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §16 "personalized routine generation from user data and equipment" / §4.2 Phase 4 personalization | §1, §3–§8 |
| §16 generation contract (strict JSON, repair) | Reused (4A); §6 extends prompt only |
| §16 provenance | §4, §8 |
| §16 safety (suggestions, disclaimer, confirmation) | §10, §11 |
| §10 API envelope; §12 mobile-first; §13 EN/ES; §19 testing | §9–§12 |
| History integrity (immutable session snapshots) | §5 reads `snapshot`/`nameSnapshot` as recorded |
