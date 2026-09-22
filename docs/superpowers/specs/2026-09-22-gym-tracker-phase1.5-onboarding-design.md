# Gym Tracker — Phase 1.5 Onboarding & First Routine — Design Spec

- **Date:** 2026-09-22
- **Status:** Approved (design), pending implementation planning
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding authority for the product)
- **Depends on:** Phase 1 (merged to `main` at `0510aaa`)

## 1. Objective

Take a brand-new signed-in user from an empty account to **an active routine** in one
guided flow, and capture enough about them (goal, experience, equipment, schedule,
units, timezone) to power later phases — especially AI routine generation (Phase 4).

### Success criteria

- A new user is routed into onboarding after first sign-in and can complete it in
  under ~2 minutes on a phone.
- On completion the user has exactly one **active routine** built from a starter
  template, visible on the dashboard.
- Every answer is persisted server-side, so the flow resumes across reloads/devices.
- A user can **skip for now** and still use the app, with a clear path back.
- Key onboarding events are logged (structured pino logs) for later activation analysis.

### Non-goals (out of scope)

- AI-generated routines (Phase 4).
- Manual routine building/editing, the live workout runner, and rest/interval timers
  (Phase 2).
- Session logging, streaks, XP/badges, dashboard charts (Phase 3).
- Product analytics vendor / dashboards (only structured logs here).
- Normalized `Equipment`/`UserEquipment` tables (deferred; see §3).
- Editing routines from onboarding; changing preferences later is a Phase 2+ concern
  (a re-entry CTA is provided but the full settings screen is not).

## 2. Scope summary

| Area | In Phase 1.5 |
|---|---|
| Onboarding wizard (6 steps + template pick) | Yes |
| Per-step server persistence + resume | Yes |
| Skip-for-now escape + gate | Yes |
| `Routine` / `RoutineDay` / `RoutineExercise` schema | Yes |
| Starter routine templates (code-defined) + recommender | Yes |
| Create routine from template (single active) | Yes |
| Dashboard active-routine preview | Yes |
| Structured event logging | Yes |
| First Playwright e2e specs | Yes |

## 3. Data model

### 3.1 New models (pull forward from parent spec §8.2)

```prisma
enum RoutineSource { manual ai template }
enum TimerType { none interval emom amrap }
enum Location { gym home both }

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
  weekday   Int     // 0=Sun … 6=Sat
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

Back-relations to add: `User.routines Routine[]`, `Exercise.routineExercises RoutineExercise[]`.

**Single active routine:** enforced in the create-from-template service inside a
transaction (deactivate all of the user's routines, then create the new one active).
Not a DB constraint (partial unique indexes are not expressible in the Prisma schema);
the service is the single writer. A later phase may add a guarded raw-SQL partial index.

### 3.2 Profile additions

```prisma
// add to existing model Profile
location            Location?
equipment           String[]  @default([])
onboardingSkippedAt DateTime?
```

`location` and `equipment` hold the onboarding answers (equipment values are the
catalog's `equipment` strings, e.g. `"dumbbell"`, `"barbell"`, `"body only"`).
`onboardingSkippedAt` lets the gate admit users who chose "skip for now" without
looping back into onboarding.

**Deviation from the parent spec (approved):** parent spec §8.2 normalizes equipment
into `Equipment`/`UserEquipment`. Phase 1.5 stores the selection on `Profile` instead.
Rationale: YAGNI — nothing in Phases 1–3 needs the normalized tables; Phase 4 (AI)
will introduce them when equipment-aware generation requires it.

### 3.3 Gate predicate (pure)

`needsOnboarding(profile): boolean` in `src/features/onboarding/lib/onboarding.ts`:

```
needsOnboarding = profile.onboardedAt == null && profile.onboardingSkippedAt == null
```

- `(app)/layout.tsx`: after `auth()`, load the profile; if `needsOnboarding(profile)`
  → `redirect('/{locale}/onboarding')`.
- `/[locale]/onboarding/page.tsx`: if `!needsOnboarding(profile)` → `redirect('/{locale}/dashboard')`.

## 4. Onboarding wizard

**Route:** `/[locale]/onboarding` — a single route. Steps are client-side state
(Zustand `onboarding-store`), rendered one at a time with a progress indicator.

| # | Step | Field(s) written | Required |
|---|---|---|---|
| 1 | Goal | `goal` | yes |
| 2 | Experience | `experience` | yes |
| 3 | Equipment & location | `location`, `equipment[]` | yes |
| 4 | Schedule | `daysPerWeek` | yes |
| 5 | Units & timezone | `unitSystem`, `timezone`, `weekStartsOn` | yes |
| 6 | Body metrics (optional) | `birthYear`, `heightCm`, `weightKg`, `gender` | no |
| 7 | Pick a routine | creates `Routine` from template | yes |

- **Per-step persistence:** on advancing, `PATCH /api/profile` with that step's fields
  (the endpoint already accepts partial updates). The final step calls
  `POST /api/routines/from-template`, which creates the routine **and sets
  `onboardedAt`** on the profile in the same transaction (see §6).
- **Resume:** on mount, read the profile and jump to the first step whose required
  fields are unset.
- **Timezone:** auto-detected from `Intl.DateTimeFormat().resolvedOptions().timeZone`,
  with a manual override; validated as IANA (reuses the Phase 1 profile schema).
- **Skip for now:** `PATCH /api/profile { onboardingSkippedAt: <now> }` then
  `redirect('/{locale}/dashboard')`.
- **Accessibility/mobile:** ≥44px targets, single-column, back/next with visible
  focus, `aria-live` progress, no hardcoded copy (all strings from `onboarding.*`
  dictionaries in `en`/`es`).

## 5. Starter templates & recommendation

### 5.1 Representation

Templates are **code-defined typed constants** in
`src/features/onboarding/templates/` (a `RoutineTemplate[]`), not DB rows.

```ts
type TemplateExercise = { sourceId: string; sets: number; reps: string; restSeconds: number }
type TemplateDay = { weekday: number; label: string; exercises: TemplateExercise[] }
type RoutineTemplate = {
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
```

Rationale: testable without a DB, no extra schema, trivial to evolve. Alternative
(seeded `RoutineTemplate*` tables) is deferred until admin editing is needed.

### 5.2 The starting set (5 templates)

| slug | goal | level | location | days/week | weekdays |
|---|---|---|---|---|---|
| `full-body-3x` | general_fitness | beginner | both | 3 | Mon/Wed/Fri |
| `upper-lower-4x` | build_muscle | intermediate | gym | 4 | Mon/Tue/Thu/Fri |
| `ppl-6x` | build_muscle | advanced | gym | 6 | Mon–Sat |
| `dumbbell-home-3x` | build_muscle | beginner | home | 3 | Mon/Wed/Fri |
| `bodyweight-3x` | endurance | beginner | home | 3 | Mon/Wed/Fri |

Each template **declares its weekdays explicitly**. Convention: 3× → Mon/Wed/Fri,
4× → Mon/Tue/Thu/Fri (Wednesday is a rest day), 6× → Mon–Sat. `days.length` MUST equal
`daysPerWeek`, weekdays MUST be unique, and each day MUST have at least one exercise
(asserted by a template-invariants unit test).

Every `sourceId` MUST exist in the seeded catalog. A test asserts all template
`sourceId`s resolve against the `Exercise` table (integration) and a unit test asserts
template shape invariants (unique weekdays, non-empty days, sets/reps in range).

### 5.3 Recommender (pure, unit-tested)

`recommendTemplates(profile, templates): { template: RoutineTemplate; score: number; recommended: boolean }[]`

Scoring (deterministic; ties broken by template order):

| Signal | Points |
|---|---|
| Location compatible (`template.location === profile.location` or either is `both`) | +3 |
| Days-per-week exact match | +2 |
| Days-per-week within ±1 | +1 |
| Goal match | +2 |
| Experience exact | +1 |
| Experience one level below template | +1 |
| Equipment: template needs only `body only` or its equipment ⊆ profile.equipment | +2 |

`recommended = true` for the top 3 results with `score ≥ 4`. The API returns all
templates sorted by score so the UI can show "Recommended for you" plus the rest.

## 6. API

All routes use the Phase 1 conventions: success `{ data }`, errors
`{ error: { code, message, details? } }` via `toApiError`, auth-gated by `auth()`,
scoped by `userId`, thin handler → service → repository.

| Method & path | Purpose | Body / params | Response |
|---|---|---|---|
| `GET /api/routine-templates` | list templates annotated for the user | — | `{ data: { templates: TemplateWithScore[] } }` |
| `POST /api/routines/from-template` | create the user's active routine from a template | `{ slug }` | `201 { data: RoutineDTO }` |
| `GET /api/routines/active` | the user's active routine | — | `{ data: RoutineDTO \| null }` |
| `PATCH /api/profile` | per-step saves (existing) | partial profile incl. new fields | `{ data: ProfileDTO }` |

`RoutineDTO` = routine with `days[]` (each with `exercises[]` joined to the catalog's
`name`/`nameEs`/`images`), `select`ed fields only (no raw models).

Validation (Zod, shared client/server):
- `fromTemplateSchema = { slug: z.string().min(1) }`; unknown slug → `NotFoundError`.
- Profile step fields validated by the extended `updateProfileSchema`
  (`location` enum, `equipment` array of allowed catalog strings, `onboardingSkippedAt`
  ISO datetime).

Service behavior for `createFromTemplate` (one transaction):
1. Load the template by slug; `NotFoundError` if absent.
2. Resolve each `sourceId` to an `Exercise` id; if any is missing, fail the whole
   creation with a clear error (never partially create).
3. `updateMany({ where: { userId, isActive: true }, data: { isActive: false } })`.
4. Create `Routine` (`source: template`, `isActive: true`) with nested days/exercises.
5. Set `Profile.onboardedAt` to now if it is null (completes onboarding atomically).
6. Log `routine.selected_from_template` and `onboarding.completed`.
7. Return the created routine.

## 7. Dashboard

`/[locale]/(app)/dashboard` fetches `GET /api/routines/active`:

- **Has active routine:** show routine name, days (with weekday labels + exercise
  counts/names), and a prominent **"Start workout"** CTA that is disabled with a
  "coming soon" affordance until Phase 2 ships the runner.
- **No routine (skipped):** empty state with a **"Pick your routine"** CTA linking to
  `/{locale}/onboarding`, plus a "Finish setting up" prompt.

Uses the Phase 1 `EmptyState` component and i18n (`dashboard.*`, `onboarding.*`).

## 8. Event logging (structured pino, no vendor, no DB table)

Emitted server-side at the mutation points (via `src/lib/logger.ts`):

| Event | Where |
|---|---|
| `onboarding.step_saved` | profile update service, when onboarding fields change |
| `onboarding.skipped` | profile update service, when `onboardingSkippedAt` is first set |
| `routine.selected_from_template` | routine service, on successful creation |
| `onboarding.completed` | routine service, when `onboardedAt` is set during create-from-template |

Each log includes `userId`, event name, and a small props object. No endpoint, no
`AnalyticsEvent` table.

## 9. Testing

- **Unit:** `recommendTemplates` (location/days/goal/experience/equipment branches,
  deterministic tie-break), template shape invariants, `needsOnboarding`, extended
  profile schema (location/equipment/onboardingSkippedAt), weekday mapping.
- **Integration (real Postgres):** create-from-template creates exactly one active
  routine and deactivates prior actives; unknown slug → NotFound; missing `sourceId`
  aborts with no partial write; per-step profile saves; skip flag; every template
  `sourceId` exists in the catalog.
- **E2E (first Playwright specs):** a new user is redirected to onboarding, completes
  it (mocked OAuth session), picks a template, and lands on the dashboard showing the
  routine; plus a "skip for now" path lands on the dashboard with the setup CTA.

## 10. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Template `sourceId`s drift from the seeded catalog | Integration test asserts every template exercise resolves; creation fails closed |
| 2 | Two concurrent create-from-template calls → two active routines | Single transaction that deactivates then creates; unique-active deferred to a raw partial index if needed |
| 3 | `equipment[]` free-text drift vs catalog values | Restrict to the catalog `equipment` enum via Zod; test the allowed set |
| 4 | Timezone auto-detect wrong/absent | Validate IANA; allow manual override; default `UTC` |
| 5 | Skip users never return to onboarding | Persistent dashboard CTA + `onboardingSkippedAt` keeps the gate from looping |
| 6 | Onboarding gate causes redirect loops | `needsOnboarding` is a single pure predicate used by both sides |

## 11. Acceptance criteria

- New user → onboarding → picks a recommended template → dashboard shows exactly one
  active routine; profile has the required fields; `onboardedAt` set.
- "Skip for now" → dashboard with a setup CTA; gate does not re-redirect; no routine.
- Reload mid-flow resumes at the first incomplete step.
- Every template `sourceId` resolves; create-from-template is transactional and leaves
  exactly one active routine.
- Unit + integration suites green; the two Playwright e2e specs pass in CI.
- All copy localized (`en`/`es`, key parity); ≥44px targets; no hardcoded strings.

## 12. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §4.2 Phase 1.5 "profile wizard → pick/generate first routine" | §4, §5 |
| §8.2 `Routine`/`RoutineDay`/`RoutineExercise` + `RoutineSource` | §3.1 |
| §8.2 `Profile` (goal, experience, units, timezone, days/week) | §3.2, §4 |
| §10 API envelope & error conventions | §6 |
| §12 mobile-first, 44px, i18n, no hardcoded copy | §4 |
| §13 EN/ES dictionaries | §4, §7 |
| §19 testing (unit + integration + e2e) | §9 |
| §17.4 structured logging | §8 |
