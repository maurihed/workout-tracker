# Gym Tracker — Phase 2A Routine Builder — Design Spec

- **Date:** 2026-09-22
- **Status:** Approved (design), pending implementation planning
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding)
- **Depends on:** Phase 1 + Phase 1.5 (merged to `main` at `bd0a95e`)

## 1. Objective

Let users **build and manage their own routines** — create from scratch or from a
template, add/remove/reorder days and exercises, prescribe sets/reps/rest/timers, and
activate/duplicate/delete — so the app is useful beyond the onboarding template and
ready for the Phase 2B runner.

### Success criteria

- A user can create a routine from scratch, add a day, add exercises from the catalog,
  set their prescriptions, save, and activate it — entirely on a phone.
- Editing is explicit (Save), atomic (whole routine), and guarded against accidental loss.
- Exactly one routine is active at a time; the dashboard reflects the active routine.
- All copy is localized (EN/ES); the builder is keyboard- and screen-reader-usable.

### Non-goals (out of scope for 2A)

- The live workout runner, session logging, and rest/interval timer *execution* (2B).
- PWA/offline (2C).
- User-created **custom exercises** (deferred; picker is catalog-only).
- Streaks/XP/dashboard charts (Phase 3), AI (Phase 4).
- Optimistic concurrency / edit conflict resolution (last-write-wins; called out in §11).
- Social/sharing routines.

## 2. Scope

| Area | In 2A |
|---|---|
| Routines list (active badge, counts, actions) | Yes |
| Create blank / from template | Yes |
| Editor: days CRUD + reorder (dnd-kit) | Yes |
| Editor: exercise rows + prescriptions + reorder | Yes |
| Dedicated catalog picker (search/filter/multi-select) | Yes |
| Save (atomic whole-routine PUT) + dirty guard | Yes |
| Activate / duplicate / rename / delete | Yes |
| `level` filter on the exercise catalog API | Yes |
| Placeholder pages for `/workout`, `/progress`, `/profile` | Yes |
| Runner, timers execution, offline, custom exercises | No |

## 3. Data model

No new tables. Two schema tweaks:

```prisma
// RoutineDay — enforce one day per weekday within a routine
@@unique([routineId, weekday])
```

- Migration: `add_routine_day_unique_weekday`. Existing data (onboarding-created
  routines) already uses unique weekdays, so the constraint applies cleanly.

Everything else (`Routine`, `RoutineDay`, `RoutineExercise`, `RoutineSource`,
`TimerType`, `Location`) is unchanged from Phase 1.5.

`RoutineExercise` fields the editor writes: `exerciseId`, `order`, `targetSets`,
`targetReps`, `restSeconds`, `targetWeightKg?`, `timerType`, `workSeconds?`, `rounds?`,
`notes?`. `customName` is unused in 2A (catalog-only).

## 4. Routes (`/[locale]/(app)/`)

| Route | Purpose |
|---|---|
| `/routines` | List: cards with name, active badge, day/exercise counts; actions activate / duplicate / delete; "New routine" CTA. |
| `/routines/new` | Create: blank (name, description?, goal?) or start from a template; then redirect to the editor. |
| `/routines/[routineId]` | Detail + editor (the builder). |
| `/routines/[routineId]/picker` | Dedicated exercise picker for a target day. |
| `/workout` | Placeholder ("coming soon"). |
| `/progress` | Placeholder ("coming soon"). |
| `/profile` | Placeholder (link to onboarding/settings later). |

## 5. Editor behavior

- **Draft state:** a persisted Zustand store (`sessionStorage`) keyed by routine id,
  so navigating to `/picker` and back preserves unsaved edits. Saving clears the draft.
- **Days:** add (weekday select + optional label), rename, remove, reorder.
- **Exercise rows:** reorder; edit `targetSets` (1–20), `targetReps` (string, ranges
  like `"8-12"`), `restSeconds` (0–3600), `timerType` (none/interval/emom/amrap),
  `workSeconds`, `rounds`, `notes`; remove.
- **Reordering:** **dnd-kit** sortable lists for days and exercise rows, with the
  library's keyboard sensor so it is operable without a pointer.
- **Save:** explicit → one `PUT` replacing the whole routine atomically. A dirty-state
  guard (navigation confirm / disabled back) warns before discarding.
- **Picker:** dedicated route; search by name + filters (muscle, equipment, level);
  thumbnails via `exerciseImageUrl`; multi-select; "Add N" appends them to the target
  day in selection order. The draft store assigns each draft day a **client-generated
  id**; the picker route targets it via `?day=<draftDayId>`, so days that do not yet
  exist server-side can still receive exercises.
- **Accessibility/mobile:** ≥44px targets, single column, visible focus, `aria-live`
  for save/error status, no hardcoded copy.

## 6. API

Conventions: thin handler → service → repository; `{ data }` / `{ error: { code, message, details? } }`;
`auth()`-scoped by `userId`; `select`ed DTOs (`routineSelect` extended to include the
list summary fields).

| Method & path | Purpose | Body | Response |
|---|---|---|---|
| `GET /api/routines` | list the user's routines | — | `{ data: RoutineSummary[] }` |
| `POST /api/routines` | create blank (inactive) | `{ name, description?, goal? }` | `201 { data: RoutineDTO }` |
| `GET /api/routines/[id]` | routine detail | — | `{ data: RoutineDTO }` |
| `PUT /api/routines/[id]` | replace days+exercises atomically | `RoutineInput` | `{ data: RoutineDTO }` |
| `DELETE /api/routines/[id]` | delete | — | `{ data: { deleted: true } }` |
| `POST /api/routines/[id]/activate` | activate; deactivate others | — | `{ data: RoutineDTO }` |
| `POST /api/routines/[id]/duplicate` | copy as inactive | — | `201 { data: RoutineDTO }` |
| `GET /api/exercises` | catalog search (existing) + `level` filter | — | `{ data: { items, nextCursor } }` |

`RoutineSummary = { id, name, description, source, isActive, dayCount, exerciseCount, updatedAt }`.

### 6.1 Validation (shared Zod, client + server)

Two input schemas: `createRoutineSchema = { name: string 1..100, description: string ≤500 | null, goal: Goal | null }` (blank create, no days), and the full `routineInputSchema` used by `PUT`:

```
routineInputSchema = {
  name: string 1..100,
  description: string ≤500 | null,
  goal: Goal | null,
  days: array(dayInput).min(1),
}
dayInput = {
  weekday: int 0..6,
  label: string ≤60 | null,
  exercises: array(exerciseInput).min(1),
}
exerciseInput = {
  exerciseId: string,
  targetSets: int 1..20,
  targetReps: string 1..20,
  restSeconds: int 0..3600,
  targetWeightKg: number positive ≤1000 | null,
  timerType: "none" | "interval" | "emom" | "amrap",
  workSeconds: int 1..3600 | null,
  rounds: int 1..50 | null,
  notes: string ≤500 | null,
}
```

Refinements: weekdays unique across `days`; when `timerType !== "none"`, `workSeconds`
and `rounds` are required; `reps` must be non-empty (e.g. `"8"`, `"8-12"`, `"AMRAP"`).

### 6.2 Service behavior

- `createBlank(userId, input)` — creates an inactive routine with no days.
- `listRoutines(userId)` — summaries with counts.
- `getRoutine(userId, id)` — `NotFoundError` if not owned.
- `replaceRoutine(userId, id, input)` — one transaction: delete existing days (cascade
  exercises), recreate from `input`, preserving `isActive`/`source`; never touches other
  routines.
- `activateRoutine(userId, id)` — one transaction: `updateMany({ isActive:false })` then
  set this one active.
- `duplicateRoutine(userId, id)` — deep copy as inactive, name suffixed with a localized
  copy label (e.g. `"{name} (copy)"` / `"{name} (copia)"`) resolved from the request
  locale.
- `deleteRoutine(userId, id)` — delete; if it was active, the user simply has no active
  routine.
- All ownership-scoped via `where: { id, userId }`; `NotFoundError` when 0 rows.
- Events (pino): `routine.created`, `routine.updated`, `routine.activated`,
  `routine.duplicated`, `routine.deleted`.

## 7. Activation semantics

Exactly one active routine (same invariant as create-from-template). Activating
deactivates the others in a transaction. Editing the active routine is allowed. Deleting
the active routine leaves no active routine (dashboard shows the empty state + setup
CTA). The DB-level single-active guarantee remains parked per the parent spec.

## 8. Placeholder pages

`/workout`, `/progress`, `/profile` render a shared `ComingSoon` component (icon +
localized "coming soon" copy), so the bottom-nav tabs never 404.

## 9. i18n

New namespaces in both `en`/`es` (identical keys, parity test enforces):
`routines.*` (list, actions, empty/error states, confirmations), `routineEditor.*`
(days, exercises, fields, save/dirty, validation messages), `picker.*` (search,
filters, selection, add), `common.*` additions as needed, `comingSoon.*`.

## 10. Testing

- **Unit:** `routineInputSchema` (unique weekday, timer refinements, ranges),
  reorder helpers (move up/down/move-to-index pure functions), editor draft store
  reducers (add/remove/reorder/edit, dirty flag, save-clear), i18n parity.
- **Integration (real Postgres):** create/list/detail; `replaceRoutine` atomic replace
  (old days gone, new present, other routines untouched, active flag preserved);
  unique-weekday rejection; activate-deactivates-others; delete-active-leaves-none;
  duplicate deep-copies days+exercises; ownership scoping (404 for another user's id).
- **Component (RTL):** routine list actions, editor exercise row editing + validation
  errors, picker multi-select + add, dirty-guard prompt.
- **E2E (Playwright):** build a routine from scratch (add day → open picker → select
  exercises → set sets/reps → save) → activate → verify it appears on the dashboard;
  then duplicate and delete.

## 11. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Concurrent activates → two active routines | Transaction (deactivate-then-activate); DB partial index parked per spec |
| 2 | `PUT` last-write-wins on concurrent edits | Out of scope; documented. `updatedAt` returned so the UI could detect drift later |
| 3 | Losing unsaved draft on navigation | Persisted draft store + dirty guard |
| 4 | Duplicate weekdays | Zod refinement (client+server) **and** `@@unique([routineId, weekday])` |
| 5 | dnd-kit not keyboard-accessible | Use the keyboard sensor; unit-test the pure reorder functions |
| 6 | Large editor component | Split into `DayList`, `DayCard`, `ExerciseRow`, `ExerciseFields`, `SaveBar` single-responsibility components |
| 7 | Picker pagination + filters | Reuse the existing cursor-paginated `/api/exercises`; add `level` filter |

## 12. Acceptance criteria

- A user can create a blank routine, add ≥1 day with ≥1 exercise, save, and activate it;
  the dashboard shows it.
- Unique weekday is rejected client- and server-side; timer configs validate.
- Reordering days and exercises works with pointer and keyboard.
- Duplicate creates an independent copy; delete removes it (and leaves no active routine
  if it was active).
- All gates green: lint, typecheck, unit, integration, coverage, build, e2e — pristine.
- All copy localized (EN/ES); no hardcoded strings; ≥44px targets.

## 13. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §4.1 "view, create, edit, customize, delete, activate/deactivate routines" | §2, §5, §6 |
| §4.1 exercise browse/search/filter | §5 picker, §6 `/api/exercises` `level` |
| §4.2 Phase 2 (builder half; runner/timers deferred to 2B) | §2 non-goals |
| §8.2 `Routine`/`RoutineDay`/`RoutineExercise` + enums | §3 |
| §10 API envelope & errors | §6 |
| §12 mobile-first, 44px, a11y, dark/light | §5 |
| §13 EN/ES dictionaries | §9 |
| §17.4 structured logging | §6.2 events |
| §19 testing (unit/integration/e2e) | §10 |
| §4.1 custom exercises | deferred (non-goal) |
