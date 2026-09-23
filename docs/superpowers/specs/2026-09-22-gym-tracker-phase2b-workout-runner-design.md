# Gym Tracker — Phase 2B Workout Runner & Timers — Design Spec

- **Date:** 2026-09-22
- **Status:** Approved (design), pending implementation planning
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding)
- **Depends on:** Phases 1, 1.5, 2A (merged to `main` at `199ad22`)

## 1. Objective

Let a user **run a routine end-to-end**: start a workout from their active routine,
move exercise-by-exercise with large touch controls, log sets as they go, use a rest
timer between sets and an interval/circuit timer for timed work, and finish with a
summary — persisting the session so progress survives reloads and history is immutable.

### Success criteria

- From the dashboard, a user starts a workout (choosing the day when needed), logs
  every set, and finishes — entirely on a phone, with the session persisted.
- A rest timer auto-starts after each set; timed exercises use an interval/circuit timer.
- Reloading mid-workout resumes the same in-progress session with all logged sets intact.
- Completing a session produces an immutable snapshot; abandoning leaves no trace of a
  completed workout.
- All copy is localized (EN/ES); the runner is usable with keyboard/screen reader and
  large touch targets.

### Non-goals (out of scope for 2B)

- Streaks, XP, badges, weekly goals, dashboard charts, PRs (Phase 3).
- A workout-history list/browse UI (Phase 3).
- PWA/offline caching, lock-screen/background timers, offline set-log queue (2C).
- User-created custom exercises and AI routines.
- Editing a **completed** session (immutable).
- Optimistic concurrency / conflict resolution (last-write-wins; see §11).

## 2. Scope

| Area | In 2B |
|---|---|
| `WorkoutSession`/`SessionExercise`/`SetLog` + snapshot | Yes |
| Start (day chooser) / resume / complete / abandon | Yes |
| One-exercise-at-a-time runner | Yes |
| Per-set logging (reps, weight, warm-up, RPE) + notes | Yes |
| Swap / skip exercises | Yes |
| Rest timer (auto) + interval/circuit timer | Yes |
| Previous-performance hint | Yes |
| Finish summary screen | Yes |
| Unit display (kg/lb from profile) | Yes |
| Pause/resume + session `activeSeconds` | Yes |
| Streaks/XP/dashboard/history, offline, custom exercises | No |

## 3. Data model

New models (adapted from parent spec §8.2), with the snapshot written at **start**:

```prisma
enum SessionStatus { in_progress completed abandoned }
enum SetType { warmup working drop failure }

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
  id              String   @id @default(cuid())
  sessionId       String
  exerciseId      String?
  order           Int
  nameSnapshot    String
  targetSets      Int?
  targetReps      String?
  restSeconds     Int?
  timerType       TimerType?
  workSeconds     Int?
  rounds          Int?
  completed       Boolean  @default(false)
  skipped         Boolean  @default(false)
  swappedFromId   String?
  notes           String?

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

Back-relations to add: `User.sessions WorkoutSession[]`, `Exercise.sessionExercises SessionExercise[]`.

**Snapshot (immutable):** `WorkoutSession.snapshot` stores the routine/day identity plus
each exercise's `name`, `nameEs`, target prescription, and order **at start**. Each
`SessionExercise.nameSnapshot` also freezes the name. Editing or deleting the routine
mid-session never changes the running workout or its history.

**One in-progress session per user** is enforced in the service (a partial unique index is
deferred, consistent with the single-active-routine decision).

## 4. Routes

| Route | Purpose |
|---|---|
| `/[locale]/(app)/workout` | Runner: resume an in-progress session, else a day chooser from the active routine (defaults to today's weekday), else an empty state. |
| `/[locale]/(app)/workout/summary/[sessionId]` | Post-finish summary (duration, sets, volume). |

- Dashboard **Start workout** (currently a disabled stub) becomes enabled and links to
  `/[locale]/workout`.
- If the active routine has one day, starting goes straight to the runner; with multiple
  days, the chooser is shown.

## 5. API

Conventions: thin handler → service → repository; `{ data }` / `{ error: { code, message, details? } }`;
`auth()`-scoped by `userId`; `select`ed DTOs; datetimes serialized as ISO strings.

| Method & path | Purpose | Body | Response |
|---|---|---|---|
| `GET /api/sessions/active` | current in-progress session | — | `{ data: SessionDTO \| null }` |
| `POST /api/sessions` | start a session | `{ routineDayId }` | `201 { data: SessionDTO }`; `409` if one is in progress |
| `GET /api/sessions/[id]` | session detail | — | `{ data: SessionDTO }` |
| `PUT /api/sessions/[id]` | replace exercises + sets (debounced) and set `activeSeconds` | `SessionStateInput` | `{ data: SessionDTO }` |
| `POST /api/sessions/[id]/complete` | finalize | `{ activeSeconds }` | `{ data: SessionDTO }` |
| `POST /api/sessions/[id]/abandon` | mark abandoned | — | `{ data: { abandoned: true } }` |

`SessionDTO` includes the session header, `exercises[]` (with `sets[]` and, per exercise, a
`lastPerformance` hint), and the frozen snapshot-derived names. `lastPerformance` is derived
from the most recent **completed** session containing that `exerciseId` (e.g. top set:
reps/weight), computed server-side.

### 5.1 Validation (shared Zod, client + server)

```
sessionStateInput = {
  activeSeconds: int >= 0,
  exercises: array({
    id: string,               // server SessionExercise id returned by start (never client-created in 2B)
    exerciseId: string | null, // current catalog exercise (changes only on swap)
    nameSnapshot: string,      // current display name (updates on swap)
    completed: boolean,
    skipped: boolean,
    notes: string <= 500 | null,
    sets: array({
      id?: string,
      setNumber: int >= 1,
      type: "warmup" | "working" | "drop" | "failure",
      reps: int >= 0 | null,
      weightKg: number >= 0 <= 1000 | null,
      durationSeconds: int >= 0 | null,
      rpe: int 1..10 | null,
      restSecondsLogged: int >= 0 | null,
      completedAt: ISO datetime | null,
    }),
  }),
}
```

The exercise `id` is the **server-generated** `SessionExercise` id (returned by start);
2B never creates or deletes `SessionExercise` rows via the API — `PUT` matches rows by id
and updates their fields, including `exerciseId`/`nameSnapshot` when the user has
**swapped** the exercise. Sets are replaced wholesale per row.

`POST /api/sessions` validates `{ routineDayId }` belongs to the user's routine; the day
must have ≥1 exercise.

### 5.2 Service behavior

- `startSession(userId, routineDayId)` — one transaction: reject if an in-progress session
  exists (`ConflictError`); load the day + exercises (with catalog names); write the
  session (`snapshot` + `SessionExercise` rows copied from the prescription); return DTO.
- `getActiveSession(userId)` / `getSession(userId, id)` — ownership-scoped; `NotFoundError`.
- `replaceSessionState(userId, id, input)` — one transaction: `deleteMany` sets for the
  session's exercises, then recreate the provided exercises/sets (matching by
  `SessionExercise.id`); update `activeSeconds`; only valid for `in_progress` sessions
  (`ConflictError` otherwise).
- `completeSession(userId, id, activeSeconds)` — set status `completed`, `completedAt`,
  `activeSeconds`; only from `in_progress`.
- `abandonSession(userId, id)` — status `abandoned`.
- Events (pino): `session.started`, `session.updated` (debounced/optional),
  `session.completed`, `session.abandoned`.

## 6. Runner UX (one-exercise-at-a-time)

- **Header:** session elapsed time (`activeSeconds`, live), "exercise i / n", and a
  progress bar over completed sets.
- **Exercise view:** locale-aware name, catalog media (`exerciseImageUrl`), target
  (`sets × reps`, rest), the `lastPerformance` hint, set rows, and per-exercise notes.
- **Set row:** reps and weight inputs (prefilled from target then last performance),
  a warm-up toggle, optional RPE, and a large check to complete. Completing a set
  auto-starts the rest timer.
- **Controls:** previous / next, an overview drawer (all exercises + completion state,
  tap to jump), **swap**, **skip**, pause/resume, and **finish**.
- **Swap:** opens a catalog picker **sheet** that reuses the exercise-list query/result
  component from Phase 2A's picker (search + muscle/equipment/level filters) — it does
  **not** use the routine draft store. Selecting a substitute sets the exercise's
  `exerciseId` + `nameSnapshot`, keeps the original prescription, and records
  `swappedFromId` (the original `exerciseId`).
- **Skip:** marks the exercise skipped (stays in the snapshot with `skipped: true`).
- **Finish:** if unfinished sets remain, confirm; then `complete` and route to the summary.
- **Discard:** confirm dialog (Radix `AlertDialog`) → `abandon` → dashboard.
- **Persistence:** client holds an authoritative session store; changes are pushed with a
  debounced `PUT` (and on pause/visibility change), so a reload resumes with all sets.
- **Wake lock:** best-effort `navigator.wakeLock.request("screen")` while the runner is
  active; silently ignored where unsupported.
- **Accessibility/mobile:** ≥44px targets, single column, visible focus, `aria-live` for
  the timer and save status, no hardcoded copy.

## 7. Timers

- **Rest timer:** auto-starts on set completion using the exercise's `restSeconds`;
  countdown with **±15s**, **skip**, and a clear visual state; optional **sound +
  vibration** alert at zero (respects a client-side toggle and `prefers-reduced-motion`);
  clears when the next set starts. `restSecondsLogged` records actual rest (next set start
  minus completion).
- **Interval/circuit timer:** for `interval`/`emom`/`amrap` exercises, shows work/rest
  rounds and a round counter driven by `workSeconds`/`rounds`, with start/pause/skip-round.
- Timers run in the **foreground** (background/lock-screen behavior is 2C). Timer logic is
  a pure reducer (tick-in, state-out) so it is unit-testable.

## 8. Units

Weight is stored canonically as **kg**. The UI displays and accepts the
`Profile.unitSystem` (metric → kg, imperial → lb) via pure `kgToLb`/`lbToKg` helpers
(one decimal, sensible rounding); conversions are unit-tested both directions.

## 9. Previous-performance hint

On session start and on exercise change, the DTO carries `lastPerformance` for each
`exerciseId`: the best set (by weight, then reps) from the most recent completed session
containing it, e.g. `{ reps: 10, weightKg: 40, date }`. Rendered as "Last: 3×10 @ 40 kg".
No history list yet.

## 10. i18n

New namespaces in both `en`/`es` (identical key sets, parity test enforces):
`runner.*` (start/resume, day chooser, overview, swap, skip, finish/discard, empty/error),
`runner.sets.*` (warm-up, rpe, reps, weight, notes, complete), `timers.*` (rest,
interval, round, skip, sound toggle), `summary.*` (duration, sets, volume, done). No
hardcoded user-facing copy.

## 11. Testing

- **Unit:** session store reducers (log/edit/complete/skip/swap set; navigate), timer
  reducer (tick, pause, reset, ±15s), unit conversion (kg↔lb both ways), volume/summary
  math (Σ reps × weight), `sessionStateInput` schema, i18n parity.
- **Integration (real Postgres):** start writes snapshot + exercises; second start → 409;
  `PUT` replaces sets and reflects `activeSeconds`; complete sets status/completedAt;
  abandon; `lastPerformance` lookup picks the most recent completed session; ownership
  scoping (404 for another user); editing the routine mid-session doesn't change the
  session's names/targets.
- **Component (RTL):** exercise view renders hint + prefilled inputs; completing a set
  starts the rest timer; swap/skip flows; overview navigation; summary numbers.
- **E2E (Playwright):** dashboard → start (chooser) → log a set → rest timer appears →
  finish → summary; reload mid-session resumes with sets intact; discard requires confirm.

## 12. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Concurrent starts → two in-progress sessions | Service guard in a transaction; DB partial unique deferred (as with single-active routine) |
| 2 | Routine edited mid-session changes the workout | Snapshot + `nameSnapshot` frozen at start |
| 3 | Unit conversion wrong in one direction | Pure helpers, unit-tested both ways |
| 4 | Timer drift / pause accounting | Pure tick reducer; `activeSeconds` sent on PUT/complete; timers are foreground only |
| 5 | `PUT` last-write-wins under concurrent edits | Out of scope; documented; coarse single-writer per session in practice |
| 6 | Wake lock / vibration unsupported | Progressive enhancement; ignored when unavailable |
| 7 | Debounced `PUT` lost on abrupt close | Also push on pause/visibility change; 2C adds an offline queue |

## 13. Acceptance criteria

- From the dashboard a user starts a workout (day chooser when needed), logs sets with
  reps/weight, sees a previous-performance hint, uses the auto rest timer, finishes, and
  sees a summary; the session persists.
- Reloading mid-workout resumes the same session with sets intact.
- A second start while one is in progress is rejected.
- Completing freezes the snapshot; abandoning leaves no completed session.
- Timers: rest auto-start with ±15s/skip; interval timer for timed exercises.
- Units display per profile; values round-trip correctly.
- All gates green: lint, typecheck, unit, integration, coverage, build, e2e — pristine.
- All copy localized; ≥44px targets; no hardcoded strings.

## 14. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §4.1 live runner (details, next/prev, elapsed time, rest + interval timers) | §6, §7 |
| §4.2 Phase 2 "run it end-to-end" | §1–§7 |
| §8.2 `WorkoutSession`/`SessionExercise`/`SetLog` + snapshot | §3 |
| §8.2 set fields (type, reps, weight, rpe, rest logged) | §3, §5.1 |
| §9 user-scoped authorization | §5.2 |
| §10 API envelope & errors | §5 |
| §12 mobile-first, 44px, a11y | §6 |
| §13 EN/ES dictionaries | §10 |
| §17.4 structured logging | §5.2 |
| §19 testing (unit/integration/e2e) | §11 |
| Phase 3 streaks/XP/dashboard/history | non-goal |
| Phase 2C PWA/offline/background timers | non-goal |
