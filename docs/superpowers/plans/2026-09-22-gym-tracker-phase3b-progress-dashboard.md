# Phase 3B — Progress Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a progress dashboard — weekly volume/consistency charts, a muscle heatmap (front/back body-map), recent PRs, per-exercise estimated-1RM progression, and a body-metric log with a weight trend.

**Architecture:** Pure analytics math in `src/features/progress/lib` (unit-tested); a `progress` service/repository aggregates completed sessions within a week window and owns `BodyMetric` CRUD; `app/api/*` Route Handlers feed axios + TanStack Query; Recharts (via the shadcn chart wrapper) renders client-only.

**Tech Stack:** Next.js 16 · TypeScript strict · Prisma 7/Postgres · Zod · TanStack Query · Recharts + shadcn chart · Vitest + RTL · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase3b-progress-dashboard-design.md`

## Global Constraints

- Thin Route Handler → service → repository; services/repositories `import "server-only"`; `userId`-scoped.
- `{ data }` / `{ error: { code, message, details? } }`; Zod per input.
- Prisma 7 (`@/lib/prisma`, types from `@/generated/prisma/client`, `prisma7.config.ts`); migrations via `prisma migrate dev`, else `migrate diff` + `pnpm db:deploy`.
- Working-set volume only (exclude warm-ups), matching 3A.
- i18n EN/ES parity; no hardcoded copy; mobile-first, ≥44px; strict TS extras; no comments.
- Charts client-only (`next/dynamic`, `ssr: false`).
- Commands: `pnpm lint` · `typecheck` · `test` · `test:integration` · `test:coverage` · `build` · `e2e`; Docker db + `pnpm db:seed`.

## Review Focus

1. **Muscle credit** — primary 1.0 / secondary 0.5; unmapped/custom exercises land in a `custom` bucket and never crash aggregation.
2. **Windowed aggregation** — only completed sessions in `[weekStart-…, today]`; week buckets honor `weekStartsOn`; volume excludes warm-ups.
3. **Body-metric uniqueness** — one row per `(userId, recordedOn)`; upsert is idempotent; ownership-scoped; invalid (no values) rejected.
4. **Timezone dates** — metric `recordedOn` and week buckets use the user's local date.
5. **Charts with no data** — empty states render (no NaN/axis errors); Recharts stays client-only.

---

### Task 1: Recharts + shadcn chart wrapper

**Files:** Modify `package.json`; create `src/components/ui/chart.tsx` (shadcn chart), `src/components/ui/card.tsx` if absent.

- [ ] **Step 1:** `pnpm add recharts` and add the shadcn chart component (`pnpm dlx shadcn@latest add chart` or hand-add the standard `chart.tsx` using `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` with CSS-variable theming).
- [ ] **Step 2:** Add a tiny client wrapper `src/features/progress/components/chart-shell.tsx` that dynamic-imports chart-containing components with `ssr: false` (or export charts as client components and mount under a `dynamic(() => import(...), { ssr: false })` boundary).
- [ ] **Step 3:** `pnpm typecheck && pnpm lint`; commit `feat(progress): add recharts and chart wrapper`.

**Interfaces:** `ChartContainer`/`ChartTooltip*` from `@/components/ui/chart`; charts render client-only.

---

### Task 2: BodyMetric model + migration

**Files:** Modify `prisma/schema.prisma`; create migration.

- [ ] **Step 1:** Add the `BodyMetric` model and `User.bodyMetrics BodyMetric[]` exactly as in spec §3.
- [ ] **Step 2:** `pnpm exec prisma migrate dev --name add_body_metric` (else diff + `pnpm db:deploy`); `pnpm db:generate`; `pnpm typecheck`; `pnpm exec prisma migrate status`.
- [ ] **Step 3:** Commit `feat(db): add body metric model`.

---

### Task 3: Muscle mapping lib

**Files:** Create `src/features/progress/lib/muscles.ts`; test `tests/unit/progress-muscles.test.ts`.

**Interfaces:**
- `type RegionId = "chest"|"back"|"shoulders"|"biceps"|"triceps"|"forearms"|"abs"|"glutes"|"quads"|"hamstrings"|"calves"|"traps"|"custom"`
- `MUSCLE_REGIONS: { id: RegionId; name: string; nameEs: string }[]` (ordered)
- `MUSCLE_TO_REGION: Record<string, RegionId>`
- `creditMuscles(primaryMuscles: string[], secondaryMuscles: string[], volumeKg: number): Partial<Record<RegionId, number>>`
- `heatLevel(volumeKg: number, maxVolumeKg: number): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { MUSCLE_TO_REGION, MUSCLE_REGIONS, creditMuscles, heatLevel } from "@/features/progress/lib/muscles"

describe("muscle mapping", () => {
  it("maps every free-exercise-db muscle name to a region", () => {
    for (const name of ["chest","lats","middle back","lower back","shoulders","biceps","triceps","forearms","abdominals","quadriceps","hamstrings","glutes","calves","traps","neck","adductors","abductors"])
      expect(MUSCLE_TO_REGION[name], name).toBeTruthy()
  })
  it("credits primary at 1.0 and secondary at 0.5", () => {
    expect(creditMuscles(["chest"], ["triceps"], 100)).toEqual({ chest: 100, triceps: 50 })
  })
  it("buckets unmapped/custom into custom", () => {
    expect(creditMuscles(["unknown-muscle"], [], 40)).toEqual({ custom: 40 })
    expect(creditMuscles([], [], 10)).toEqual({ custom: 10 })
  })
  it("computes a 0..1 heat level", () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(50, 100)).toBeCloseTo(0.5)
    expect(heatLevel(100, 0)).toBe(0)
  })
  it("has unique ordered regions", () => {
    expect(new Set(MUSCLE_REGIONS.map((r) => r.id)).size).toBe(MUSCLE_REGIONS.length)
  })
})
```

- [ ] **Step 2:** RED (`pnpm exec vitest run tests/unit/progress-muscles.test.ts`).
- [ ] **Step 3:** Implement `muscles.ts` — regions (chest, back, shoulders, biceps, triceps, forearms, abs, glutes, quads, hamstrings, calves, traps, custom) with EN/ES labels; map the free-exercise-db names to regions (`lats`/`middle back`/`lower back`→back, `abdominals`→abs, `quadriceps`→quads, etc.); `creditMuscles` sums primary×1 + secondary×0.5, routing unmapped names and empty input to `custom`; `heatLevel = max<=0 ? 0 : clamp(volume/max, 0, 1)`.
- [ ] **Step 4:** GREEN; commit `feat(progress): muscle-region mapping and credit`.

---

### Task 4: Week bucketing lib

**Files:** Create `src/features/progress/lib/volume.ts`; test `tests/unit/progress-volume.test.ts`.

**Interfaces:** `windowStart(today: string, weeks: number, weekStartsOn: number): string`; `type BucketInput = { completedDate: string; volumeKg: number }`; `bucketByWeek(items: BucketInput[], weekStartsOn: number): { weekStart: string; volumeKg: number; sessions: number }[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { bucketByWeek, windowStart } from "@/features/progress/lib/volume"

describe("progress volume", () => {
  it("computes a window start N weeks back", () => {
    expect(windowStart("2026-01-26", 4, 1)).toBe("2026-01-05") // 3 weeks before this week's Monday
  })
  it("buckets sessions by week start with volume and count", () => {
    const out = bucketByWeek(
      [
        { completedDate: "2026-01-05", volumeKg: 100 },
        { completedDate: "2026-01-07", volumeKg: 50 },
        { completedDate: "2026-01-12", volumeKg: 200 },
      ],
      1,
    )
    expect(out).toEqual([
      { weekStart: "2026-01-05", volumeKg: 150, sessions: 2 },
      { weekStart: "2026-01-12", volumeKg: 200, sessions: 1 },
    ])
  })
})
```

- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement using `weekStart` from `@/features/gamification/lib/week`; `windowStart` = weekStart(today) minus `weeks-1` weeks; `bucketByWeek` groups, sums volume, counts sessions, sorted by weekStart.
- [ ] **Step 4:** GREEN; commit `feat(progress): weekly bucketing`.

---

### Task 5: 1RM series + PR extraction libs

**Files:** Create `src/features/progress/lib/one-rm.ts`, `src/features/progress/lib/pr.ts`; tests `tests/unit/progress-one-rm.test.ts`, `tests/unit/progress-pr.test.ts`.

**Interfaces:**
- `one-rm.ts`: `bestE1rm(sets: {reps:number|null;weightKg:number|null;type:string}[]): number | null`; `seriesForExercise(sessions: SeriesSession[], exerciseId: string): { date: string; e1rm: number; topWeightKg: number; reps: number }[]` where `SeriesSession = { id: string; date: string; exercises: { exerciseId: string|null; sets: {...}[] }[] }`.
- `pr.ts`: `recentPrs(sessions: PrSession[], limit: number): { sessionId; date; exerciseId; name; weightKg; reps }[]`, newest first, where `PrSession = { id; date; exercises: { exerciseId; nameSnapshot; sets: { isPr; weightKg; reps }[] }[] }`.

- [ ] **Step 1: Write failing tests**

```ts
// progress-one-rm.test.ts
import { bestE1rm, seriesForExercise } from "@/features/progress/lib/one-rm"
it("picks the best working-set e1rm", () => {
  expect(bestE1rm([{ reps: 5, weightKg: 100, type: "working" }, { reps: 10, weightKg: 50, type: "warmup" }])).toBeCloseTo(100 * (1 + 5 / 30))
})
it("builds a per-session series", () => {
  const sessions = [{ id: "s1", date: "2026-01-05", exercises: [{ exerciseId: "e1", sets: [{ reps: 5, weightKg: 100, type: "working" }] }] }, { id: "s2", date: "2026-01-12", exercises: [{ exerciseId: "e1", sets: [{ reps: 3, weightKg: 110, type: "working" }] }] }]
  expect(seriesForExercise(sessions, "e1").map((p) => p.date)).toEqual(["2026-01-05", "2026-01-12"])
})
```
```ts
// progress-pr.test.ts
import { recentPrs } from "@/features/progress/lib/pr"
it("returns isPr sets newest first, limited", () => {
  const sessions = [{ id: "s1", date: "2026-01-05", exercises: [{ exerciseId: "e1", nameSnapshot: "Squat", sets: [{ isPr: true, weightKg: 100, reps: 5 }] }] }, { id: "s2", date: "2026-01-12", exercises: [{ exerciseId: "e1", nameSnapshot: "Squat", sets: [{ isPr: true, weightKg: 110, reps: 3 }] }] }]
  const prs = recentPrs(sessions, 1)
  expect(prs).toHaveLength(1)
  expect(prs[0]).toMatchObject({ sessionId: "s2", weightKg: 110, reps: 3 })
})
```

- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement (reuse `epley1rm` from `@/features/gamification/lib/pr`; ignore warm-ups and null reps/weight; series sorted by date; PRs newest-first, limit).
- [ ] **Step 4:** GREEN; commit `feat(progress): 1RM series and PR extraction`.

---

### Task 6: Body-metric API

**Files:** Create `src/features/profile/schemas/body-metric.ts`, `src/server/repositories/body-metric.repository.ts`, `src/server/services/body-metric.service.ts`, `src/app/api/body-metrics/route.ts`, `src/app/api/body-metrics/[id]/route.ts`, `src/features/progress/hooks/{query-keys,use-body-metrics,use-upsert-body-metric,use-delete-body-metric}.ts`; tests `tests/unit/body-metric-route.test.ts`, `tests/integration/body-metric.test.ts`.

**Interfaces:**
- `bodyMetricUpsertSchema = { recordedOn: date, weightKg?: number 0..500 nullable, bodyFatPct?: number 0..100 nullable }` with a refinement requiring at least one value.
- Service `listBodyMetrics(userId, {from?,to?})`, `upsertBodyMetric(userId, input)`, `deleteBodyMetric(userId, id)`.
- Repository upsert by `userId_recordedOn` unique; delete scoped by `userId` (404 if none).

- [ ] **Step 1: Write failing routes + integration tests** (route: 401 without auth, 400 on empty values, 200 upsert; integration: upsert twice same day = 1 row updated; delete; other user 404; from/to filtering).
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement schema/repository/service/routes/hooks (thin handler → service; `ok`/`toApiError`; DTO `{ id, recordedOn: ISO, weightKg, bodyFatPct }`).
- [ ] **Step 4:** GREEN; `pnpm test`, `pnpm test:integration`, `pnpm typecheck`; commit `feat(progress): body-metric log API`.

---

### Task 7: Analytics repository + service

**Files:** Create `src/server/repositories/progress.repository.ts`, `src/server/services/progress.service.ts`; test `tests/integration/progress-analytics.test.ts`.

**Interfaces:**
- Repo: `listCompletedSessionsWithMuscles(userId, from: Date, to: Date)` selecting session `id/completedAt`, exercises `exerciseId/nameSnapshot`, sets `reps/weightKg/type/isPr/completedAt`, and `exercise.primaryMuscles/secondaryMuscles`; `findExercise(userId?)` catalog name lookup by id.
- Service `getOverview(userId, weeks)`: loads the window, derives each session's local date + working-set volume, buckets by week (`bucketByWeek`), credits muscles (`creditMuscles`) summed per region, extracts `recentPrs`. Returns `OverviewDTO`.
- Service `getExerciseProgress(userId, exerciseId)`: builds `seriesForExercise` from completed sessions; returns `{ exerciseId, name, nameEs, points }` (404 if the exercise isn't in the user's history, or name from the catalog).

- [ ] **Step 1: Write failing integration test** (seed sessions with known volume/muscles; assert weekly buckets, muscle totals with 1.0/0.5, PRs; per-exercise series).
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement (reuse `localDate`/`weekStart`; window = `windowStart` local → UTC range; working-set volume only).
- [ ] **Step 4:** GREEN; commit `feat(progress): overview and exercise analytics`.

---

### Task 8: Analytics APIs + hooks

**Files:** Create `src/app/api/analytics/overview/route.ts`, `src/app/api/analytics/exercises/[exerciseId]/route.ts`, `src/features/progress/hooks/use-analytics-overview.ts`, `use-exercise-progress.ts`; tests `tests/unit/analytics-route.test.ts`.

- [ ] **Step 1:** Route/unit tests (401, 200 shape; `weeks` validation).
- [ ] **Step 2:** Implement routes + hooks (`useAnalyticsOverview(weeks)`, `useExerciseProgress(id)`).
- [ ] **Step 3:** GREEN; commit `feat(progress): analytics APIs and hooks`.

---

### Task 9: i18n copy

**Files:** Modify `src/i18n/messages/en.json`, `es.json`; create `tests/unit/progress-messages.test.ts`.

- [ ] **Step 1:** Add `analytics.*`, `heatmap.*` (region labels), `pr.*`, `metrics.*` keys in both locales (parity); add the key-presence test.
- [ ] **Step 2:** `pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/progress-messages.test.ts`; commit `feat(i18n): progress dashboard copy (en/es)`.

---

### Task 10: Muscle heatmap component

**Files:** Create `src/features/progress/components/muscle-heatmap.tsx` (+ `body-map.tsx` SVG), test `tests/unit/muscle-heatmap.test.tsx`.

- [ ] **Step 1:** Failing test: with `muscleVolume` data, regions get a fill derived from `heatLevel` and an `aria-label` with region name + volume; a `custom` note renders when present; zero data → empty prompt.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement the front/back SVG with region paths, theme-token fills scaled by `heatLevel`, a legend, and a tappable/focusable region that shows its name/volume.
- [ ] **Step 4:** GREEN; commit `feat(progress): muscle heatmap`.

---

### Task 11: Dashboard analytics (charts + recent PRs)

**Files:** Create `src/features/progress/components/{volume-chart,consistency-chart,recent-prs}.tsx`; modify `src/app/[locale]/(app)/dashboard/page.tsx`; tests `tests/unit/volume-chart.test.tsx`, `tests/unit/recent-prs.test.tsx`.

- [ ] **Step 1:** Failing tests: volume chart renders with data and shows an empty state with none; recent PRs list renders items linking to `/progress/exercise/[id]`.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement charts (Recharts via the wrapper, client-only), a 4/12/26-week toggle, and mount `VolumeChart`, `ConsistencyChart`, `MuscleHeatmap`, `RecentPrs` in the dashboard below the stats header.
- [ ] **Step 4:** GREEN; commit `feat(progress): dashboard analytics`.

---

### Task 12: Per-exercise + metrics pages

**Files:** Create `src/app/[locale]/(app)/progress/exercise/[exerciseId]/page.tsx`, `src/app/[locale]/(app)/progress/metrics/page.tsx`, `src/features/progress/components/{exercise-progress-chart,body-metric-form,weight-trend-chart}.tsx`; modify the progress page and history-detail to link; tests `tests/unit/body-metric-form.test.tsx`, `tests/unit/exercise-progress-chart.test.tsx`.

- [ ] **Step 1:** Failing tests: the metrics form validates (at least one of weight/body-fat), submits, and lists entries with delete; the exercise chart renders points + empty state.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement pages/components (unit-aware weight input via `formatWeight`/unit helpers; date defaults to the user's local today), link from PR rows and history-detail exercise rows; progress page gains a Metrics link.
- [ ] **Step 4:** GREEN; `pnpm typecheck`, `pnpm lint`; commit `feat(progress): exercise progression and body-metric pages`.

---

### Task 13: E2E, gates, roadmap

**Files:** Create `tests/e2e/progress.spec.ts`; modify `docs/ROADMAP.md`.

- [ ] **Step 1:** E2E: seed + complete a workout → dashboard shows the volume chart and heatmap; add a body-metric entry → it appears in the trend.
- [ ] **Step 2:** Run all gates (`lint`, `typecheck`, `test`, `test:integration`, `test:coverage`, `build`, `e2e`); fix legitimate issues without weakening tests.
- [ ] **Step 3:** Update the roadmap: add a 3B Done row (spec/plan/SDD paths); remove 3B from remaining; make Phase 4 next.
- [ ] **Step 4:** Commit `test(e2e): progress dashboard; docs: mark 3b complete`.

---

## Self-Review

- Spec §3→T2; §4→T3,4,5; §5→T6,7,8; §6→T10,11,12; §7→T9; §8→all + T13. No gaps.
- No placeholders; pure libs and services carry concrete code, UI tasks carry test + wiring.
- Types: `RegionId`/`OverviewDTO`/`PrItemDTO`/`BodyMetricDTO` defined in T3/T7/T6 and consumed in T10/T11/T12.
- Review Focus: muscles T3; window T4/T7; metric uniqueness T6; timezone T6/T7; empty charts T10/T11/T12.
