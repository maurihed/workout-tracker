# Gym Tracker — Phase 3B Progress Dashboard — Design Spec

- **Date:** 2026-09-22
- **Status:** Proposed
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding)
- **Depends on:** Phases 1–3A (merged to `main`)
- **Sibling completed:** Phase 3A (tracking + stats engine)

## 1. Objective

Turn logged workouts into visual progress. Phase 3B delivers the **progress dashboard**:
weekly volume and consistency charts, a **muscle heatmap** (front/back body-map), a
**recent-PRs feed**, **per-exercise estimated-1RM progression**, and a **body-metric log**
(weight / body-fat) with a trend chart.

### Success criteria

- The dashboard shows weekly volume and sessions-per-week charts, a muscle heatmap, and recent PRs.
- Any trained exercise opens a chart of its estimated 1RM per session.
- Users can log daily body metrics and see a weight trend; entries are unique per day.
- Charts are mobile-first, theme-aware (dark/light), and degrade gracefully with no data.
- All copy is localized (EN/ES); touch targets ≥ 44px.

### Non-goals (out of scope for 3B)

- Body-composition goals/trends beyond weight & body-fat display.
- Nutrition, social, AI (Phase 4), native apps.
- Exporting charts/images.
- Historical muscle-imbalance prescriptions or recommendations.

## 2. Scope

| Area | In 3B |
|---|---|
| `BodyMetric` model + migration | Yes |
| Recharts + shadcn chart wrapper | Yes |
| Weekly volume + consistency charts | Yes |
| Muscle heatmap (front/back body-map SVG) | Yes |
| Recent-PRs feed | Yes |
| Per-exercise estimated-1RM progression | Yes |
| Body-metric log (CRUD + weight trend) | Yes |
| Nutrition/social/AI | No |

## 3. Data model

Adds parent spec §8.2's `BodyMetric`:

```prisma
model BodyMetric {
  id         String   @id @default(cuid())
  userId     String
  recordedOn DateTime // UTC midnight of the user's local date
  weightKg   Float?
  bodyFatPct Float?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, recordedOn])
  @@index([userId, recordedOn])
}
```

- `recordedOn` is stored as UTC midnight of the **user's local date** (via `Profile.timezone`); the
  unique key makes one entry per day, upserted.
- Back-relation: `User.bodyMetrics BodyMetric[]`.
- **No change** to existing models; the 3A `[userId, status, completedAt]` index serves the window
  queries.

## 4. Pure domain libs

All under `src/features/progress/lib/`, pure and unit-tested.

- `muscles.ts` — `MUSCLE_REGIONS` (ordered heatmap regions with EN/ES labels + body-map region ids)
  and `MUSCLE_TO_REGION` (free-exercise-db muscle name → region). `creditFor(exercise, volumeKg)` →
  region→volume contributions: primary muscles at **1.0×**, secondary at **0.5×**; exercises with no
  catalog link (or unmapped muscles) contribute to a `custom` bucket. Also `heatLevel(volume, max)`
  (0–1) for shading.
- `volume.ts` — `bucketByWeek(sessions, weekStartsOn)` → `{ weekStart, volumeKg, sessions }[]`
  (working-set volume; reuses 3A's working-set rule); `windowStart(today, weeks, weekStartsOn)`.
- `one-rm.ts` — `bestE1rmPerSession(sets)` (max `epley1rm` over working sets, reusing 3A's
  `epley1rm`); `seriesForExercise(sessions, exerciseId)` → `{ date, e1rm, topWeightKg, reps }[]`.
- `pr.ts` — `recentPrs(sessions, limit)` → `{ sessionId, date, exerciseId, name, weightKg, reps }[]`
  from `SetLog.isPr` sets, newest first.

## 5. API

Conventions unchanged: thin handler → service → repository; `{ data }` / `{ error: { code, message,
details? } }`; `auth()`-scoped; `select`ed DTOs; ISO datetimes.

| Method & path | Purpose | Response |
|---|---|---|
| `GET /api/analytics/overview?weeks=12` | dashboard analytics | `{ data: { volumeByWeek, muscleVolume, recentPrs } }` |
| `GET /api/analytics/exercises/[exerciseId]` | per-exercise 1RM series | `{ data: { exerciseId, name, nameEs, points } }` |
| `GET /api/body-metrics?from=&to=` | list entries (ascending) | `{ data: BodyMetricDTO[] }` |
| `PUT /api/body-metrics` | upsert by `recordedOn` | `{ data: BodyMetricDTO }` |
| `DELETE /api/body-metrics/[id]` | delete an entry | `{ data: { deleted: true } }` |

- `weeks` is `z.coerce.number().int().min(1).max(52).default(12)`.
- `OverviewDTO = { volumeByWeek: { weekStart, volumeKg, sessions }[]; muscleVolume: { muscle:
  RegionId; volumeKg: number }[]; recentPrs: PrItemDTO[] }`.
- `PrItemDTO = { sessionId, date, exerciseId, name, nameEs, weightKg, reps }`.
- `BodyMetricDTO = { id, recordedOn, weightKg, bodyFatPct }`.
- `PUT /body-metrics` body: `{ recordedOn: date, weightKg?: number|null, bodyFatPct?: number|null }`
  (at least one value); upsert scoped by `userId`; `recordedOn` is the local date supplied by the
  client (the client derives it from `Profile.timezone`).
- Aggregation runs over **completed** sessions within `[windowStart, today]`; ownership-scoped.

## 6. UI

- **Dashboard** (analytics hub, below the 3A stats header, above the routine preview):
  - `VolumeChart` — weekly volume area/line, with a 4 / 12 / 26-week toggle.
  - `ConsistencyChart` — sessions per week (bars) over the same window.
  - `MuscleHeatmap` — front + back body silhouette (an authored SVG with region paths), each region
    shaded by its volume via theme tokens; a low→high legend; a region is tappable/focusable to
    show its name + volume (`aria-label` per region); a `custom` note when custom exercises
    contributed.
  - `RecentPrs` — the last ~5 PR sets, each linking to the per-exercise chart.
  - Empty states: with no completed sessions, show a friendly prompt instead of empty charts.
- **Per-exercise progression** — `/[locale]/(app)/progress/exercise/[exerciseId]`: a line chart of
  estimated 1RM per session + the top set per point; reachable from a PR row and from a history
  detail exercise row.
- **Body metrics** — `/[locale]/(app)/progress/metrics`: a form to add/edit an entry by date (weight
  shown in the user's unit system, body fat %), a weight-trend line chart, and a recent-entries list
  with delete; reached from a card/button on the progress page.
- **Progress page** — keeps the 3A history list; gains a small header row linking to Metrics.
- Charts are **client-only** (`next/dynamic`, `ssr: false`) to avoid Recharts hydration issues;
  mobile-first, ≥44px, visible focus, no hardcoded copy.

## 7. i18n

New namespaces in both `en`/`es` (parity enforced): `analytics.*` (title, volume, sessions,
consistency, weeks, empty), `heatmap.*` (title, region labels, legend low/high, custom), `pr.*`
(recentPrs, empty, e1rm, topSet, viewProgress), `metrics.*` (title, addEntry, weight, bodyFat, date,
save, delete, empty, trend, invalid). No hardcoded user-facing copy.

## 8. Testing

- **Unit:** `MUSCLE_TO_REGION` coverage + `creditFor` weighting (primary 1.0 / secondary 0.5 /
  custom); `bucketByWeek` + `windowStart`; `bestE1rmPerSession` + `seriesForExercise`; `recentPrs`;
  body-metric schema.
- **Integration (real Postgres):** `overview` aggregation (weekly volume/sessions, muscle volume,
  recent PRs) over seeded sessions; per-exercise series; body-metric upsert (one row per day) +
  delete + ownership 404; date-window filtering.
- **Component (RTL):** charts render with data and show empty states; heatmap region shading +
  legend + region label; metrics form add/edit/delete; per-exercise chart renders points.
- **E2E (Playwright):** complete a workout → dashboard shows the volume chart and heatmap; add a
  body-metric entry and see it in the trend.
- **Gates:** lint, typecheck, unit, integration, coverage, build, e2e.

## 9. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Recharts SSR/hydration mismatch | Client-only dynamic import; render nothing until mounted |
| 2 | Aggregation cost grows with history | Window-bounded (default 12 weeks); uses 3A's composite index |
| 3 | Body-map SVG responsiveness/a11y | ViewBox scaling; per-region `aria-label`; theme-token fills |
| 4 | Timezone for metric dates / week buckets | Local dates via `Profile.timezone`; stored as UTC midnight |
| 5 | Custom exercises lack muscles | `custom` bucket surfaced explicitly |
| 6 | Empty states look broken | Explicit empty prompts for new users |
| 7 | Unit display (kg/lb) in metrics | Reuse `formatWeight`/unit helpers |

## 10. Acceptance criteria

- The dashboard shows weekly volume and consistency charts, the muscle heatmap, and recent PRs.
- A trained exercise opens its estimated-1RM progression chart.
- Body metrics can be added/edited/deleted with a weight trend; one entry per day.
- All gates green: lint, typecheck, unit, integration, coverage, build, e2e.
- All copy localized; ≥44px targets; mobile-first; charts degrade gracefully with no data.

## 11. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §24 (product goal: dashboard communicates volume, PRs, consistency, muscle balance) | §1, §6 |
| §4.2 Phase 3 (dashboard charts, heatmap, PRs, body-metric log) | §5, §6 |
| §8.2 `BodyMetric` | §3 |
| §6 charts (Recharts / shadcn charts) | §1, §6 |
| §12 mobile-first, 44px, dark/light | §6 |
| §13 EN/ES dictionaries | §7 |
| §19 testing (unit/integration/e2e) | §8 |
| §21 Phase 3 acceptance (dashboard shows charts, heatmap, PRs) | §10 |
| Nutrition/social/AI/native | non-goal |
