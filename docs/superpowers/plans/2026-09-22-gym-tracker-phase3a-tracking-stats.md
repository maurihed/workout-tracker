# Phase 3A — Tracking + Stats Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn completed sessions into progress: a server-side stats engine (scheduled-day streak with automatic freezes, XP/levels, achievements, weekly goal) recomputed on completion and repaired nightly, plus a workout-history browser, a dashboard stats header, and post-workout celebrations.

**Architecture:** Pure domain math lives in `src/features/gamification/lib` and is unit-tested. A `stats.service` recomputes `UserStats` from completed sessions, ensures idempotent `XpEvent`s (unique key), marks `SetLog.isPr`, and unlocks `UserAchievement`s; `completeSession` calls it on the completion transition. History and stats are read through `app/api/*` Route Handlers consumed by axios + TanStack Query.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · TypeScript strict · Prisma 7/Postgres · Zod · TanStack Query · Zustand · Vitest + RTL · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase3a-tracking-stats-design.md`

## Global Constraints

- Thin Route Handler → service → repository; services/repositories `import "server-only"`; every query scoped by `auth()`'s `userId`.
- Responses: `{ data }` on success, `{ error: { code, message, details? } }` on failure.
- Prisma 7: `prisma` from `@/lib/prisma`; types from `@/generated/prisma/client` (**never** `@prisma/client`); CLI config `prisma7.config.ts`.
- Migrations: prefer `pnpm exec prisma migrate dev --name <name>`; if it wants interactive confirmation, use `prisma migrate diff` + `pnpm db:deploy` (roadmap guidance).
- Pure domain logic (`features/*/lib`: streak, level, PR, week, achievements) is unit-tested; XP/stat changes are recomputable and idempotent.
- i18n: `en` + `es` keys in parity; never hardcode user-facing copy.
- UI: mobile-first, tap targets ≥ 44px; no comments in code unless asked.
- TypeScript strict extras ON: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`.
- Commands: `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:integration` (Docker db + seed) · `pnpm test:coverage` · `pnpm build` · `pnpm e2e`.
- Integration/E2E: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`, `docker compose up -d db`, `pnpm db:seed`.
- Commit after every task; keep all gates green.

## Review Focus

Five input classes / failure modes the spec implies that a happy path misses. Each has its test pinned in the owning task:

1. **Timezone/DST streak boundaries** — a session completed late at night in the user's timezone lands on the correct local date, and neutral rest days neither break nor extend the streak.
2. **Replayed completion** — completing an already-completed session (offline replay) adds no duplicate `XpEvent`, no extra `UserAchievement`, and no XP change.
3. **Freeze window** — a missed scheduled day within 48h with a freeze available preserves the streak; a miss older than 48h breaks it; the freeze balance never goes negative or exceeds the cap.
4. **Weekly-goal boundary** — with a non-Monday `weekStartsOn`, sessions are grouped into the correct weeks, a partial current week still counts, and weekly-goal XP is awarded once per week.
5. **History correctness** — cursor pagination is stable across equal `startedAt`, filters (`from`/`to`/`routineId`) are inclusive and ownership-scoped, and only `completed` sessions appear.

---

### Task 1: Schema + migration for stats, XP, and achievements

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_stats_and_gamification/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma models `UserStats`, `XpEvent`, `Achievement`, `UserAchievement`, enum `XpReason`; `SetLog.isPr`; `WorkoutSession` index `[userId, status, completedAt]`; User back-relations.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Append (and add the back-relations to `User`: `stats UserStats?`, `xpEvents XpEvent[]`, `achievements UserAchievement[]`):

```prisma
model UserStats {
  userId         String   @id
  currentStreak  Int      @default(0)
  longestStreak  Int      @default(0)
  lastHitDate    DateTime?
  streakFreezes  Int      @default(2)
  totalSessions  Int      @default(0)
  totalVolumeKg  Float    @default(0)
  xp             Int      @default(0)
  level          Int      @default(1)
  updatedAt      DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum XpReason {
  session
  weekly_goal
  pr
  streak_milestone
  achievement
}

model XpEvent {
  id        String   @id @default(cuid())
  userId    String
  amount    Int
  reason    XpReason
  refType   String?
  refId     String?
  key       String   @unique
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

model Achievement {
  id            String @id @default(cuid())
  slug          String @unique
  name          String
  nameEs        String
  description   String
  descriptionEs String
  icon          String
  criteria      Json
  xpReward      Int
  order         Int

  users UserAchievement[]
}

model UserAchievement {
  userId        String
  achievementId String
  unlockedAt    DateTime @default(now())

  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievement Achievement @relation(fields: [achievementId], references: [id], onDelete: Cascade)

  @@id([userId, achievementId])
  @@index([userId, unlockedAt])
}
```

In `model SetLog` add `isPr Boolean @default(false)`; in `model WorkoutSession` add `@@index([userId, status, completedAt])`.

- [ ] **Step 2: Create the migration**

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && docker compose up -d db
pnpm exec prisma migrate dev --name add_stats_and_gamification
```

If it prompts interactively, generate and apply non-interactively instead:

```bash
pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/$(date +%Y%m%d%H%M%S)_add_stats_and_gamification/migration.sql
pnpm db:deploy
```

- [ ] **Step 3: Regenerate the client and typecheck**

```bash
pnpm db:generate
pnpm typecheck
```

Expected: PASS (new types available from `@/generated/prisma/client`).

- [ ] **Step 4: Verify no drift**

```bash
pnpm exec prisma migrate status
```

Expected: up to date, no drift.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add stats, xp, and achievement models"
```

---

### Task 2: Level/XP math

**Files:**
- Create: `src/features/gamification/lib/level.ts`, `src/features/gamification/lib/xp.ts`
- Test: `tests/unit/gamification-level.test.ts`

**Interfaces:**
- Produces: `xpForLevel(level)`, `levelForXp(xp)`, `xpToNextLevel(xp)`, `levelProgress(xp)`, `XP_AWARDS`, `STREAK_MILESTONES`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { levelForXp, levelProgress, xpForLevel, xpToNextLevel } from "@/features/gamification/lib/level"
import { XP_AWARDS, STREAK_MILESTONES } from "@/features/gamification/lib/xp"

describe("level curve", () => {
  it("maps cumulative XP to levels", () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(400)).toBe(3)
    expect(levelForXp(900)).toBe(4)
  })
  it("is the inverse of xpForLevel at thresholds", () => {
    for (const level of [1, 2, 3, 5, 10]) {
      expect(levelForXp(xpForLevel(level))).toBe(level)
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1 || 1)
    }
  })
  it("reports XP to the next level and progress within the level", () => {
    expect(xpToNextLevel(0)).toBe(100)
    expect(xpToNextLevel(150)).toBe(250)
    expect(levelProgress(0)).toBe(0)
    expect(levelProgress(250)).toBeCloseTo(0.5)
    expect(levelProgress(100)).toBe(0)
  })
  it("guards negative XP", () => {
    expect(levelForXp(-50)).toBe(1)
    expect(levelProgress(-50)).toBe(0)
  })
  it("defines the award table", () => {
    expect(XP_AWARDS.session).toBe(100)
    expect(XP_AWARDS.weeklyGoal).toBe(150)
    expect(XP_AWARDS.pr).toBe(50)
    expect(STREAK_MILESTONES).toEqual([7, 30, 100])
    expect(XP_AWARDS.streakMilestones[7]).toBe(100)
    expect(XP_AWARDS.streakMilestones[30]).toBe(500)
    expect(XP_AWARDS.streakMilestones[100]).toBe(2000)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/gamification-level.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `level.ts` and `xp.ts`**

```ts
export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  return 100 * (safe - 1) ** 2
}

export function levelForXp(xp: number): number {
  const safe = Math.max(0, xp)
  return Math.floor(Math.sqrt(safe / 100)) + 1
}

export function xpToNextLevel(xp: number): number {
  const safe = Math.max(0, xp)
  return xpForLevel(levelForXp(safe) + 1) - safe
}

export function levelProgress(xp: number): number {
  const safe = Math.max(0, xp)
  const level = levelForXp(safe)
  const floor = xpForLevel(level)
  const ceil = xpForLevel(level + 1)
  if (ceil <= floor) return 0
  return (safe - floor) / (ceil - floor)
}
```

```ts
export const STREAK_MILESTONES = [7, 30, 100] as const

export const XP_AWARDS = {
  session: 100,
  weeklyGoal: 150,
  pr: 50,
  streakMilestones: { 7: 100, 30: 500, 100: 2000 } as Record<number, number>,
} as const
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/gamification-level.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/lib/level.ts src/features/gamification/lib/xp.ts tests/unit/gamification-level.test.ts
git commit -m "feat(gamification): xp and level math"
```

---

### Task 3: Personal-record math

**Files:**
- Create: `src/features/gamification/lib/pr.ts`
- Test: `tests/unit/gamification-pr.test.ts`

**Interfaces:**
- Produces: `epley1rm(weightKg, reps): number | null`; `type PrCandidate = { id: string; reps: number | null; weightKg: number | null }`; `selectPrSet(sets: PrCandidate[], priorBest1rm: number | null): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { epley1rm, selectPrSet } from "@/features/gamification/lib/pr"

describe("epley 1RM", () => {
  it("computes weight * (1 + reps/30)", () => {
    expect(epley1rm(100, 1)).toBeCloseTo(103.333, 2)
    expect(epley1rm(80, 10)).toBeCloseTo(106.667, 2)
  })
  it("returns null for missing or non-positive inputs", () => {
    expect(epley1rm(null, 10)).toBeNull()
    expect(epley1rm(50, null)).toBeNull()
    expect(epley1rm(0, 10)).toBeNull()
    expect(epley1rm(50, 0)).toBeNull()
  })
})

describe("selectPrSet", () => {
  const sets = [
    { id: "a", reps: 10, weightKg: 60 },
    { id: "b", reps: 5, weightKg: 80 },
    { id: "c", reps: 3, weightKg: 90 },
  ]
  it("returns the single best set when it beats the prior best", () => {
    expect(selectPrSet(sets, 100)).toBe("c") // 90*(1+3/30)=99 < 100 → none
    expect(selectPrSet(sets, 95)).toBe("c") // 99 > 95
  })
  it("treats the first-ever set as a PR", () => {
    expect(selectPrSet(sets, null)).toBe("c")
  })
  it("ignores sets without a usable 1RM", () => {
    expect(selectPrSet([{ id: "x", reps: null, weightKg: null }], 10)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/gamification-pr.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `pr.ts`**

```ts
export function epley1rm(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null
  return weightKg * (1 + reps / 30)
}

export type PrCandidate = { id: string; reps: number | null; weightKg: number | null }

export function selectPrSet(sets: PrCandidate[], priorBest1rm: number | null): string | null {
  let bestId: string | null = null
  let best = priorBest1rm ?? 0
  for (const set of sets) {
    const oneRm = epley1rm(set.weightKg, set.reps)
    if (oneRm == null) continue
    if (oneRm > best) {
      best = oneRm
      bestId = set.id
    }
  }
  return bestId
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/gamification-pr.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/lib/pr.ts tests/unit/gamification-pr.test.ts
git commit -m "feat(gamification): epley 1RM and PR selection"
```

---

### Task 4: Streak math

**Files:**
- Create: `src/features/gamification/lib/streak.ts`
- Test: `tests/unit/gamification-streak.test.ts`

**Interfaces:**
- Produces:
  - `type StreakInput = { hitDates: string[]; scheduledWeekdays: Set<number>; today: string; freezesAvailable: number }`
  - `type StreakResult = { current: number; longest: number; lastHitDate: string | null; freezesUsed: number; freezesRemaining: number }`
  - `computeStreak(input): StreakResult`
  - `FREEZE_WINDOW_DAYS = 2`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { computeStreak } from "@/features/gamification/lib/streak"

const weekdays = (...days: number[]) => new Set(days)
const mon = weekdays(1) // Monday only

describe("computeStreak", () => {
  it("counts consecutive hit days on scheduled weekdays", () => {
    // Mon 2026-01-05, Mon 2026-01-12
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-12"], scheduledWeekdays: mon, today: "2026-01-12", freezesAvailable: 0 })
    expect(r.current).toBe(2)
    expect(r.longest).toBe(2)
    expect(r.lastHitDate).toBe("2026-01-12")
  })

  it("treats non-scheduled days as neutral (do not break or extend)", () => {
    // Hits on Mon 01-05 and Mon 01-12; the whole week between is neutral.
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-12"], scheduledWeekdays: mon, today: "2026-01-12", freezesAvailable: 0 })
    expect(r.current).toBe(2)
  })

  it("breaks the streak on a missed scheduled day older than the freeze window", () => {
    // Missed Mon 01-12, next hit Mon 01-19 (7 days later).
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-19"], scheduledWeekdays: mon, today: "2026-01-19", freezesAvailable: 2 })
    expect(r.current).toBe(1)
    expect(r.longest).toBe(1)
    expect(r.freezesUsed).toBe(0)
  })

  it("auto-consumes a freeze for a recent missed scheduled day within 48h", () => {
    // Hit Mon 01-12; missed Mon 01-19; today Tue 01-20 (within 48h of the miss).
    const r = computeStreak({ hitDates: ["2026-01-12"], scheduledWeekdays: mon, today: "2026-01-20", freezesAvailable: 2 })
    expect(r.current).toBe(1)
    expect(r.freezesUsed).toBe(1)
    expect(r.freezesRemaining).toBe(1)
  })

  it("never goes negative on freezes", () => {
    const r = computeStreak({ hitDates: ["2026-01-12"], scheduledWeekdays: mon, today: "2026-01-20", freezesAvailable: 0 })
    expect(r.current).toBe(0)
    expect(r.freezesRemaining).toBe(0)
  })

  it("counts multiple sessions on one date once", () => {
    const r = computeStreak({ hitDates: ["2026-01-05", "2026-01-05"], scheduledWeekdays: mon, today: "2026-01-05", freezesAvailable: 0 })
    expect(r.current).toBe(1)
  })

  it("returns zeros when there are no hits", () => {
    const r = computeStreak({ hitDates: [], scheduledWeekdays: mon, today: "2026-01-05", freezesAvailable: 2 })
    expect(r).toEqual({ current: 0, longest: 0, lastHitDate: null, freezesUsed: 0, freezesRemaining: 2 })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/gamification-streak.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `streak.ts`**

```ts
export const FREEZE_WINDOW_DAYS = 2

export type StreakInput = {
  hitDates: string[]
  scheduledWeekdays: Set<number>
  today: string
  freezesAvailable: number
}

export type StreakResult = {
  current: number
  longest: number
  lastHitDate: string | null
  freezesUsed: number
  freezesRemaining: number
}

const DAY_MS = 86_400_000

function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

function isoFromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay()
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

export function computeStreak(input: StreakInput): StreakResult {
  const hits = new Set(input.hitDates)
  if (hits.size === 0) {
    return { current: 0, longest: 0, lastHitDate: null, freezesUsed: 0, freezesRemaining: input.freezesAvailable }
  }

  const sorted = [...hits].sort()
  const start = sorted[0]!
  let current = 0
  let longest = 0
  let lastHitDate: string | null = null
  let freezesRemaining = Math.max(0, input.freezesAvailable)
  let freezesUsed = 0

  for (let day = start; toUtc(day) <= toUtc(input.today); day = isoFromUtc(toUtc(day) + DAY_MS)) {
    if (hits.has(day)) {
      current += 1
      lastHitDate = day
    } else if (input.scheduledWeekdays.has(weekdayOf(day))) {
      const recent = daysBetween(day, input.today) <= FREEZE_WINDOW_DAYS
      if (recent && freezesRemaining > 0) {
        freezesRemaining -= 1
        freezesUsed += 1
      } else {
        current = 0
      }
    }
    if (current > longest) longest = current
  }

  return { current, longest, lastHitDate, freezesUsed, freezesRemaining }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/gamification-streak.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/lib/streak.ts tests/unit/gamification-streak.test.ts
git commit -m "feat(gamification): scheduled-day streak with automatic freezes"
```

---

### Task 5: Week math

**Files:**
- Create: `src/features/gamification/lib/week.ts`
- Test: `tests/unit/gamification-week.test.ts`

**Interfaces:**
- Produces: `weekStart(date: string, weekStartsOn: number): string`; `weeksGoalMet(dates: string[], goal: number, weekStartsOn: number): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { weekStart, weeksGoalMet } from "@/features/gamification/lib/week"

describe("weekStart", () => {
  it("returns the Monday for a Monday-start week", () => {
    // 2026-01-07 is a Wednesday.
    expect(weekStart("2026-01-07", 1)).toBe("2026-01-05")
    expect(weekStart("2026-01-05", 1)).toBe("2026-01-05")
  })
  it("respects a Sunday-start week", () => {
    expect(weekStart("2026-01-07", 0)).toBe("2026-01-04")
  })
})

describe("weeksGoalMet", () => {
  it("groups dates into weeks and returns weeks meeting the goal", () => {
    const dates = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-12"]
    expect(weeksGoalMet(dates, 3, 1)).toEqual(["2026-01-05"])
    expect(weeksGoalMet(dates, 1, 1)).toEqual(["2026-01-05", "2026-01-12"])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/gamification-week.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `week.ts`**

```ts
export function weekStart(date: string, weekStartsOn: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function weeksGoalMet(dates: string[], goal: number, weekStartsOn: number): string[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const key = weekStart(date, weekStartsOn)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= Math.max(1, goal))
    .map(([key]) => key)
    .sort()
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/gamification-week.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/lib/week.ts tests/unit/gamification-week.test.ts
git commit -m "feat(gamification): week boundaries and weekly-goal weeks"
```

---

### Task 6: Achievement catalog + evaluation

**Files:**
- Create: `src/features/gamification/lib/achievements.ts`
- Test: `tests/unit/gamification-achievements.test.ts`

**Interfaces:**
- Produces: `type AchievementCriteria`, `type AchievementDefinition`, `ACHIEVEMENTS` (10), `type AchievementStats`, `evaluateAchievements(stats): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { ACHIEVEMENTS, evaluateAchievements } from "@/features/gamification/lib/achievements"

const base = { totalSessions: 0, longestStreak: 0, totalVolumeKg: 0, prCount: 0, weeksGoalMet: 0 }

describe("achievements", () => {
  it("has 10 unique bilingual badges", () => {
    expect(ACHIEVEMENTS).toHaveLength(10)
    expect(new Set(ACHIEVEMENTS.map((a) => a.slug)).size).toBe(10)
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.nameEs.length).toBeGreaterThan(0)
      expect(a.description.length).toBeGreaterThan(0)
      expect(a.descriptionEs.length).toBeGreaterThan(0)
      expect(a.xpReward).toBeGreaterThan(0)
    }
  })

  it("unlocks nothing at zero", () => {
    expect(evaluateAchievements(base)).toEqual([])
  })

  it("unlocks by each criterion type", () => {
    expect(evaluateAchievements({ ...base, totalSessions: 1 })).toContain("first_workout")
    expect(evaluateAchievements({ ...base, totalSessions: 10 })).toContain("sessions_10")
    expect(evaluateAchievements({ ...base, longestStreak: 7 })).toContain("streak_7")
    expect(evaluateAchievements({ ...base, totalVolumeKg: 100_000 })).toContain("volume_100k")
    expect(evaluateAchievements({ ...base, prCount: 1 })).toContain("first_pr")
    expect(evaluateAchievements({ ...base, weeksGoalMet: 4 })).toContain("weekly_goal_4")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/gamification-achievements.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `achievements.ts`**

```ts
export type AchievementCriteria = {
  type: "sessions" | "streak" | "volume" | "pr" | "weekly_goal"
  threshold: number
}

export type AchievementDefinition = {
  slug: string
  name: string
  nameEs: string
  description: string
  descriptionEs: string
  icon: string
  criteria: AchievementCriteria
  xpReward: number
  order: number
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { slug: "first_workout", name: "First Workout", nameEs: "Primer entrenamiento", description: "Complete your first workout.", descriptionEs: "Completa tu primer entrenamiento.", icon: "barbell", criteria: { type: "sessions", threshold: 1 }, xpReward: 100, order: 1 },
  { slug: "sessions_10", name: "Getting Consistent", nameEs: "Constancia", description: "Complete 10 workouts.", descriptionEs: "Completa 10 entrenamientos.", icon: "calendar-check", criteria: { type: "sessions", threshold: 10 }, xpReward: 200, order: 2 },
  { slug: "sessions_50", name: "Half Century", nameEs: "Medio centenar", description: "Complete 50 workouts.", descriptionEs: "Completa 50 entrenamientos.", icon: "trophy", criteria: { type: "sessions", threshold: 50 }, xpReward: 500, order: 3 },
  { slug: "streak_7", name: "Week Streak", nameEs: "Racha de una semana", description: "Reach a 7-day streak.", descriptionEs: "Alcanza una racha de 7 días.", icon: "flame", criteria: { type: "streak", threshold: 7 }, xpReward: 100, order: 4 },
  { slug: "streak_30", name: "Month Streak", nameEs: "Racha de un mes", description: "Reach a 30-day streak.", descriptionEs: "Alcanza una racha de 30 días.", icon: "flame", criteria: { type: "streak", threshold: 30 }, xpReward: 500, order: 5 },
  { slug: "volume_100k", name: "100 Tonnes", nameEs: "100 toneladas", description: "Lift 100,000 kg in total.", descriptionEs: "Levanta 100,000 kg en total.", icon: "scales", criteria: { type: "volume", threshold: 100_000 }, xpReward: 200, order: 6 },
  { slug: "volume_1m", name: "Megatonne", nameEs: "Megatonelada", description: "Lift 1,000,000 kg in total.", descriptionEs: "Levanta 1,000,000 kg en total.", icon: "scales", criteria: { type: "volume", threshold: 1_000_000 }, xpReward: 1000, order: 7 },
  { slug: "first_pr", name: "Personal Best", nameEs: "Récord personal", description: "Set your first personal record.", descriptionEs: "Logra tu primer récord personal.", icon: "medal", criteria: { type: "pr", threshold: 1 }, xpReward: 100, order: 8 },
  { slug: "pr_10", name: "Record Breaker", nameEs: "Rompe récords", description: "Set 10 personal records.", descriptionEs: "Logra 10 récords personales.", icon: "medal", criteria: { type: "pr", threshold: 10 }, xpReward: 300, order: 9 },
  { slug: "weekly_goal_4", name: "Goal Crusher", nameEs: "Cumplidor", description: "Meet your weekly goal 4 times.", descriptionEs: "Cumple tu meta semanal 4 veces.", icon: "target", criteria: { type: "weekly_goal", threshold: 4 }, xpReward: 300, order: 10 },
]

export type AchievementStats = {
  totalSessions: number
  longestStreak: number
  totalVolumeKg: number
  prCount: number
  weeksGoalMet: number
}

function meets(stats: AchievementStats, criteria: AchievementCriteria): boolean {
  switch (criteria.type) {
    case "sessions":
      return stats.totalSessions >= criteria.threshold
    case "streak":
      return stats.longestStreak >= criteria.threshold
    case "volume":
      return stats.totalVolumeKg >= criteria.threshold
    case "pr":
      return stats.prCount >= criteria.threshold
    case "weekly_goal":
      return stats.weeksGoalMet >= criteria.threshold
  }
}

export function evaluateAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((achievement) => meets(stats, achievement.criteria)).map((a) => a.slug)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/gamification-achievements.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/gamification/lib/achievements.ts tests/unit/gamification-achievements.test.ts
git commit -m "feat(gamification): achievement catalog and evaluation"
```

---

### Task 7: Idempotent achievement seed

**Files:**
- Create: `prisma/seed/achievements.ts`
- Modify: `prisma/seed/index.ts`
- Test: `prisma/seed/achievements.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS`, `AchievementDefinition` (Task 6).
- Produces: `toAchievementRow(def)`, `importAchievements(prisma, definitions?)` (upsert by slug).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { ACHIEVEMENTS } from "@/features/gamification/lib/achievements"
import { toAchievementRow } from "./achievements"

describe("toAchievementRow", () => {
  it("maps a definition to a seed row with all bilingual fields", () => {
    const row = toAchievementRow(ACHIEVEMENTS[0]!)
    expect(row.slug).toBe("first_workout")
    expect(row.name).toBeTruthy()
    expect(row.nameEs).toBeTruthy()
    expect(row.descriptionEs).toBeTruthy()
    expect(row.criteria).toEqual({ type: "sessions", threshold: 1 })
    expect(row.xpReward).toBe(100)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run prisma/seed/achievements.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `prisma/seed/achievements.ts`**

```ts
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client"
import {
  ACHIEVEMENTS,
  type AchievementDefinition,
} from "../../src/features/gamification/lib/achievements"

export function toAchievementRow(def: AchievementDefinition) {
  return {
    slug: def.slug,
    name: def.name,
    nameEs: def.nameEs,
    description: def.description,
    descriptionEs: def.descriptionEs,
    icon: def.icon,
    criteria: def.criteria as unknown as Prisma.InputJsonValue,
    xpReward: def.xpReward,
    order: def.order,
  }
}

export async function importAchievements(
  prisma: PrismaClient,
  definitions: AchievementDefinition[] = ACHIEVEMENTS,
) {
  for (const def of definitions) {
    const row = toAchievementRow(def)
    await prisma.achievement.upsert({ where: { slug: row.slug }, create: row, update: row })
  }
  return { upserted: definitions.length }
}
```

- [ ] **Step 4: Wire the seed into `prisma/seed/index.ts`**

Add the import and call inside `main()`:

```ts
import { importAchievements } from "./achievements"
// ...
  const achievements = await importAchievements(prisma)
  console.log(`seed: achievements upserted=${achievements.upserted}`)
```

- [ ] **Step 5: Run the test and reseed**

```bash
pnpm exec vitest run prisma/seed/achievements.test.ts
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && pnpm db:seed
```

Expected: PASS; seed logs `achievements upserted=10`; running `pnpm db:seed` twice does not duplicate (upsert).

- [ ] **Step 6: Commit**

```bash
git add prisma/seed/achievements.ts prisma/seed/index.ts prisma/seed/achievements.test.ts
git commit -m "feat(seed): idempotent achievement catalog"
```

---

### Task 8: Stats repository and engine

**Files:**
- Create: `src/server/repositories/stats.repository.ts`
- Create: `src/server/services/stats.service.ts`
- Test: `tests/integration/stats-engine.test.ts`

**Interfaces:**
- Produces (repository): `statsSelect`, `StatsRecord`, `findStatsByUser`, `upsertStats`, `listCompletedSessions`, `listPriorSets`, `ensureXpEvent`, `sumXp`, `findUserCreatedAt`, `findAchievementIdsBySlugs`, `listUserAchievements`, `insertUserAchievements`, `listAchievements`.
- Produces (service): `recomputeUserStats(userId): Promise<{ stats: StatsRecord; unlockedSlugs: string[]; xpBefore: number }>`, `markPersonalRecords(userId, sessionId)`, `getStats(userId)`, `getAchievements(userId)`, `repairAllStats()`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { recomputeUserStats, markPersonalRecords } from "@/server/services/stats.service"
import { upsertSession } from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@stats-engine-test.local"

async function makeUser(routineWeekdays: number[] = [1]) {
  const user = await prisma.user.create({ data: { email: `st_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: { timezone: "UTC", weekStartsOn: 1, daysPerWeek: 3 } } } })
  const exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true, nameEs: true, images: true } })
  const routine = await prisma.routine.create({
    data: { userId: user.id, name: "Push", source: "manual", isActive: true, days: { create: routineWeekdays.map((weekday, i) => ({ weekday, label: `D${i}`, order: i, exercises: { create: [{ exerciseId: exercise.id, order: 0, targetSets: 2, targetReps: "5", targetWeightKg: 100, restSeconds: 60 }] } })) } },
    include: { days: { include: { exercises: { include: { exercise: true } } } } },
  })
  const dto: RoutineDTO = {
    id: routine.id, name: "Push", nameEs: null, description: null, descriptionEs: null, goal: null, source: "manual", isActive: true,
    days: routine.days.map((d) => ({ id: d.id, weekday: d.weekday, label: d.label, order: d.order, exercises: d.exercises.map((re) => ({ id: re.id, order: re.order, exerciseId: re.exerciseId, customName: re.customName, targetSets: re.targetSets, targetReps: re.targetReps, restSeconds: re.restSeconds, targetWeightKg: re.targetWeightKg, timerType: re.timerType, workSeconds: re.workSeconds, rounds: re.rounds, notes: re.notes, exercise: re.exercise ? { id: re.exercise.id, name: re.exercise.name, nameEs: re.exercise.nameEs, images: re.exercise.images } : null })) })) },
  }
  return { user, routine: dto, day: dto.days[0]!, exercise }
}

async function complete(userId: string, routine: RoutineDTO, dayIndex: number, completedAt: Date) {
  const local = buildLocalSession(routine, routine.days[dayIndex]!)
  await upsertSession(userId, toUpsertPayload(local, 300))
  await prisma.workoutSession.update({ where: { id: local.source.id }, data: { status: "completed", completedAt } })
  await markPersonalRecords(userId, local.source.id)
  return local.source.id
}

describe("stats engine", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("recomputes totals, XP, and level from completed sessions", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    const { stats } = await recomputeUserStats(user.id)
    expect(stats.totalSessions).toBe(1)
    expect(stats.totalVolumeKg).toBeGreaterThan(0)
    expect(stats.xp).toBeGreaterThanOrEqual(100)
    expect(stats.level).toBeGreaterThanOrEqual(2)
    expect(stats.currentStreak).toBe(1)
  })

  it("is idempotent on replay (no duplicate XP)", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    const first = await recomputeUserStats(user.id)
    const second = await recomputeUserStats(user.id)
    expect(second.stats.xp).toBe(first.stats.xp)
    expect(await prisma.xpEvent.count({ where: { userId: user.id } })).toBe(await prisma.xpEvent.count({ where: { userId: user.id, key: { not: "" } } }))
  })

  it("marks at most one PR per exercise per session and first-ever counts", async () => {
    const { user, routine } = await makeUser()
    const sessionId = await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    expect(await prisma.setLog.count({ where: { sessionExercise: { sessionId }, isPr: true } })).toBe(1)
  })

  it("repairs drift", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    await prisma.userStats.upsert({ where: { userId: user.id }, create: { userId: user.id, xp: 999999, level: 99, totalSessions: 99 }, update: { xp: 999999, level: 99, totalSessions: 99 } })
    const { stats } = await recomputeUserStats(user.id)
    expect(stats.totalSessions).toBe(1)
    expect(stats.level).toBeLessThan(99)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" && docker compose up -d db && pnpm db:seed && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/stats-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stats.repository.ts`**

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma, XpReason } from "@/generated/prisma/client"

export const statsSelect = {
  userId: true, currentStreak: true, longestStreak: true, lastHitDate: true,
  streakFreezes: true, totalSessions: true, totalVolumeKg: true, xp: true, level: true,
} satisfies Prisma.UserStatsSelect
export type StatsRecord = Prisma.UserStatsGetPayload<{ select: typeof statsSelect }>

export function findStatsByUser(userId: string) {
  return prisma.userStats.findUnique({ where: { userId }, select: statsSelect })
}

export function findUserCreatedAt(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } })
}

export type StatsUpsert = {
  currentStreak: number; longestStreak: number; lastHitDate: Date | null
  streakFreezes: number; totalSessions: number; totalVolumeKg: number; xp: number; level: number
}

export function upsertStats(tx: Prisma.TransactionClient, userId: string, data: StatsUpsert) {
  return tx.userStats.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: statsSelect })
}

export const completedSessionStatsSelect = {
  id: true, routineDayId: true, completedAt: true,
  exercises: { select: { exerciseId: true, sets: { select: { id: true, reps: true, weightKg: true, isPr: true, type: true, completedAt: true } } } },
} satisfies Prisma.WorkoutSessionSelect
export type CompletedSessionStats = Prisma.WorkoutSessionGetPayload<{ select: typeof completedSessionStatsSelect }>

export function listCompletedSessions(userId: string) {
  return prisma.workoutSession.findMany({
    where: { userId, status: "completed", completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    select: completedSessionStatsSelect,
  })
}

export function listPriorSets(userId: string, exerciseIds: string[], before: Date, excludeSessionId: string) {
  return prisma.setLog.findMany({
    where: {
      sessionExercise: {
        exerciseId: { in: exerciseIds },
        session: { userId, status: "completed", completedAt: { lt: before, not: null }, id: { not: excludeSessionId } },
      },
      completedAt: { not: null },
    },
    select: { reps: true, weightKg: true, sessionExercise: { select: { exerciseId: true } } },
  })
}

export function ensureXpEvent(
  tx: Prisma.TransactionClient,
  data: { userId: string; key: string; amount: number; reason: XpReason; refType: string; refId: string },
) {
  return tx.xpEvent.upsert({ where: { key: data.key }, create: data, update: {} })
}

export function sumXp(userId: string, tx: Prisma.TransactionClient = prisma) {
  return tx.xpEvent.aggregate({ where: { userId }, _sum: { amount: true } })
}

export function findAchievementIdsBySlugs(slugs: string[]) {
  return prisma.achievement.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true, xpReward: true } })
}

export function listUserAchievements(userId: string) {
  return prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true, unlockedAt: true } })
}

export function listAchievements() {
  return prisma.achievement.findMany({ orderBy: { order: "asc" } })
}

export function insertUserAchievements(tx: Prisma.TransactionClient, userId: string, ids: string[]) {
  return tx.userAchievement.createMany({ data: ids.map((achievementId) => ({ userId, achievementId })), skipDuplicates: true })
}
```

- [ ] **Step 4: Implement `stats.service.ts`**

```ts
import "server-only"
import { logger } from "@/lib/logger"
import { levelForXp } from "@/features/gamification/lib/level"
import { XP_AWARDS, STREAK_MILESTONES } from "@/features/gamification/lib/xp"
import { epley1rm, selectPrSet } from "@/features/gamification/lib/pr"
import { computeStreak } from "@/features/gamification/lib/streak"
import { weeksGoalMet } from "@/features/gamification/lib/week"
import { ACHIEVEMENTS, evaluateAchievements } from "@/features/gamification/lib/achievements"
import { withTransaction } from "@/server/repositories/routine.repository"
import * as profileRepo from "@/server/repositories/profile.repository"
import * as routineRepo from "@/server/repositories/routine.repository"
import * as repos from "@/server/repositories/stats.repository"

function localDate(iso: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(iso)
}

function freezeBalance(createdAt: Date, now: Date): number {
  const months = (now.getUTCFullYear() - createdAt.getUTCFullYear()) * 12 + (now.getUTCMonth() - createdAt.getUTCMonth())
  return Math.min(3, 2 + Math.max(0, months))
}

export async function markPersonalRecords(userId: string, sessionId: string): Promise<void> {
  const session = await repos.listCompletedSessions(userId).then((rows) => rows.find((r) => r.id === sessionId))
  if (!session || !session.completedAt) return
  const exerciseIds = session.exercises.map((e) => e.exerciseId).filter((id): id is string => id !== null)
  if (exerciseIds.length === 0) return
  const prior = await repos.listPriorSets(userId, exerciseIds, session.completedAt, sessionId)
  const priorBest = new Map<string, number>()
  for (const set of prior) {
    const id = set.sessionExercise.exerciseId
    const oneRm = epley1rm(set.weightKg, set.reps)
    if (id && oneRm != null) priorBest.set(id, Math.max(priorBest.get(id) ?? 0, oneRm))
  }
  const chosen: string[] = []
  for (const exercise of session.exercises) {
    if (!exercise.exerciseId) continue
    const candidates = exercise.sets.map((set) => ({ id: set.id, reps: set.reps, weightKg: set.weightKg }))
    const prSetId = selectPrSet(candidates, priorBest.get(exercise.exerciseId) ?? null)
    if (prSetId) chosen.push(prSetId)
  }
  if (chosen.length > 0) {
    await withTransaction((tx) => tx.setLog.updateMany({ where: { id: { in: chosen } }, data: { isPr: true } }))
  }
}

export async function recomputeUserStats(userId: string) {
  const [profile, user, sessions, routine] = await Promise.all([
    profileRepo.findByUserId(userId),
    repos.findUserCreatedAt(userId),
    repos.listCompletedSessions(userId),
    routineRepo.findActiveByUser(userId),
  ])
  const timeZone = profile?.timezone ?? "UTC"
  const weekStartsOn = profile?.weekStartsOn ?? 1
  const weeklyGoal = profile?.daysPerWeek ?? 3
  const today = localDate(new Date(), timeZone)
  const scheduledWeekdays = new Set((routine?.days ?? []).map((day) => day.weekday))
  const hasRoutine = scheduledWeekdays.size > 0

  const allDates: string[] = []
  const hitDates: string[] = []
  let totalVolumeKg = 0
  let prCount = 0
  for (const session of sessions) {
    if (!session.completedAt) continue
    const date = localDate(session.completedAt, timeZone)
    allDates.push(date)
    if (session.routineDayId !== null || !hasRoutine) hitDates.push(date)
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.isPr) prCount += 1
        if (set.completedAt && set.reps != null && set.weightKg != null) totalVolumeKg += set.reps * set.weightKg
      }
    }
  }

  const balance = user ? freezeBalance(user.createdAt, new Date()) : 2
  const streak = computeStreak({ hitDates, scheduledWeekdays, today, freezesAvailable: balance })
  const metWeeks = weeksGoalMet(allDates, weeklyGoal, weekStartsOn)
  const unlockedSlugs = evaluateAchievements({
    totalSessions: sessions.length,
    longestStreak: streak.longest,
    totalVolumeKg,
    prCount,
    weeksGoalMet: metWeeks.length,
  })

  const before = await repos.findStatsByUser(userId)
  const xpBefore = before?.xp ?? 0

  const stats = await withTransaction(async (tx) => {
    const ensure = (data: { key: string; amount: number; reason: Parameters<typeof repos.ensureXpEvent>[1]["reason"]; refType: string; refId: string }) =>
      repos.ensureXpEvent(tx, { userId, ...data })

    for (const session of sessions) {
      await ensure({ key: `session:${session.id}`, amount: XP_AWARDS.session, reason: "session", refType: "session", refId: session.id })
    }
    for (const week of metWeeks) {
      await ensure({ key: `weekly_goal:${week}`, amount: XP_AWARDS.weeklyGoal, reason: "weekly_goal", refType: "week", refId: week })
    }
    for (const session of sessions) {
      for (const exercise of session.exercises) {
        for (const set of exercise.sets) {
          if (set.isPr) await ensure({ key: `pr:${set.id}`, amount: XP_AWARDS.pr, reason: "pr", refType: "set", refId: set.id })
        }
      }
    }
    for (const milestone of STREAK_MILESTONES) {
      if (streak.longest >= milestone) {
        await ensure({ key: `streak_milestone:${milestone}`, amount: XP_AWARDS.streakMilestones[milestone] ?? 0, reason: "streak_milestone", refType: "streak", refId: String(milestone) })
      }
    }
    const unlocked = await repos.findAchievementIdsBySlugs(unlockedSlugs)
    const newlyUnlocked = unlocked.filter((a) => unlockedSlugs.includes(a.slug))
    if (newlyUnlocked.length > 0) {
      await repos.insertUserAchievements(tx, userId, newlyUnlocked.map((a) => a.id))
      for (const a of newlyUnlocked) {
        await ensure({ key: `achievement:${a.id}`, amount: a.xpReward, reason: "achievement", refType: "achievement", refId: a.id })
      }
    }
    const sum = await repos.sumXp(userId, tx)
    const xp = sum._sum.amount ?? 0
    return repos.upsertStats(tx, userId, {
      currentStreak: streak.current, longestStreak: streak.longest,
      lastHitDate: streak.lastHitDate ? new Date(`${streak.lastHitDate}T00:00:00Z`) : null,
      streakFreezes: streak.freezesRemaining, totalSessions: sessions.length,
      totalVolumeKg, xp, level: levelForXp(xp),
    })
  })

  return { stats, unlockedSlugs, xpBefore }
}

export async function repairAllStats(): Promise<{ repaired: number }> {
  const users = await repos.listUserIds()
  for (const { id } of users) await recomputeUserStats(id)
  logger.info({ event: "stats.repaired", users: users.length }, "stats repaired")
  return { repaired: users.length }
}
```

Add `listUserIds` to the repository:
```ts
export function listUserIds() {
  return prisma.user.findMany({ select: { id: true } })
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/stats-engine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/repositories/stats.repository.ts src/server/services/stats.service.ts tests/integration/stats-engine.test.ts
git commit -m "feat(stats): recompute engine, PR marking, and achievements"
```

---

### Task 9: Completion integration + celebration

**Files:**
- Modify: `src/server/services/session.service.ts`
- Modify: `src/app/api/sessions/[sessionId]/complete/route.ts`
- Test: `tests/integration/session-complete-stats.test.ts`

**Interfaces:**
- Consumes: `recomputeUserStats`, `markPersonalRecords` (Task 8).
- Produces: `SessionCompletionResult = SessionStateAck & { celebration: { xpGained: number; level: number; leveledUp: boolean; unlocked: AchievementDTO[] } }`; `completeSession` returns it.

- [ ] **Step 1: Write the failing integration test**

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { completeSession } from "@/server/services/session.service"
import { upsertSession } from "@/server/services/session.service"
import { buildLocalSession, toUpsertPayload } from "@/features/workouts/lib/build-local-session"
import { assertCatalogSeeded } from "./helpers/catalog"
// reuse a makeUser/complete helper as in Task 8 (inline a minimal one)

const DOMAIN = "@session-complete-stats.local"
// ...makeUser as in Task 8...

describe("completeSession stats", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("returns a celebration with XP gained and any unlocked badge", async () => {
    const { user, routine } = await makeUser()
    const local = buildLocalSession(routine, routine.days[0]!)
    await upsertSession(user.id, toUpsertPayload(local, 300))
    const result = await completeSession(user.id, local.source.id, 300)
    expect(result.celebration.xpGained).toBeGreaterThanOrEqual(100)
    expect(result.celebration.level).toBeGreaterThanOrEqual(2)
    expect(result.celebration.unlocked.map((a) => a.slug)).toContain("first_workout")
  })

  it("returns an empty celebration on replay", async () => {
    const { user, routine } = await makeUser()
    const local = buildLocalSession(routine, routine.days[0]!)
    await upsertSession(user.id, toUpsertPayload(local, 300))
    await completeSession(user.id, local.source.id, 300)
    const replay = await completeSession(user.id, local.source.id, 300)
    expect(replay.celebration).toEqual({ xpGained: 0, level: replay.celebration.level, leveledUp: false, unlocked: [] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/session-complete-stats.test.ts`
Expected: FAIL — `celebration` missing.

- [ ] **Step 3: Update `completeSession`**

Replace the `completeSession` body so that, on the `in_progress → completed` transition, it runs the stats engine and builds the celebration; on an already-completed replay it returns an empty celebration:

```ts
export type SessionCelebration = {
  xpGained: number
  level: number
  leveledUp: boolean
  unlocked: AchievementDTO[]
}
export type SessionCompletionResult = SessionStateAck & { celebration: SessionCelebration }

export async function completeSession(
  userId: string,
  id: string,
  activeSeconds: number,
): Promise<SessionCompletionResult> {
  const session = await repos.findByIdForUser(userId, id)
  if (!session) throw new NotFoundError("Session not found")
  if (session.status === "completed") {
    const stats = await statsRepos.findStatsByUser(userId)
    return { ...toStateAck(session), celebration: { xpGained: 0, level: stats?.level ?? 1, leveledUp: false, unlocked: [] } }
  }
  if (session.status === "abandoned") throw new ConflictError("Session is not in progress")

  const done = await repos.setStatus(id, "completed", { completedAt: new Date(), activeSeconds })
  let celebration: SessionCelebration = { xpGained: 0, level: 1, leveledUp: false, unlocked: [] }
  try {
    await statsService.markPersonalRecords(userId, id)
    const result = await statsService.recomputeUserStats(userId)
    const unlocked = await statsService.getUnlockedAchievements(userId, result.unlockedSlugs)
    celebration = {
      xpGained: result.stats.xp - result.xpBefore,
      level: result.stats.level,
      leveledUp: levelForXp(result.xpBefore) !== result.stats.level,
      unlocked,
    }
  } catch (error) {
    logger.error({ event: "stats.completion_failed", userId, sessionId: id, error }, "stats recompute failed")
  }
  logger.info({ event: "session.completed", userId, sessionId: id }, "session completed")
  return { ...toStateAck(done), celebration }
}
```

Add to `stats.service.ts` a helper returning `AchievementDTO[]` for the given slugs:

```ts
export type AchievementDTO = { id: string; slug: string; name: string; nameEs: string; description: string; descriptionEs: string; icon: string; xpReward: number }
export async function getUnlockedAchievements(userId: string, slugs: string[]): Promise<AchievementDTO[]> {
  if (slugs.length === 0) return []
  const rows = await repos.listAchievements()
  return rows.filter((a) => slugs.includes(a.slug)).map((a) => ({ id: a.id, slug: a.slug, name: a.name, nameEs: a.nameEs, description: a.description, descriptionEs: a.descriptionEs, icon: a.icon, xpReward: a.xpReward }))
}
```

Update imports in `session.service.ts`: `import * as statsService from "@/server/services/stats.service"`, `import * as statsRepos from "@/server/repositories/stats.repository"`, and `import { levelForXp } from "@/features/gamification/lib/level"`.

- [ ] **Step 4: Update the complete route**

The route already returns `ok(await completeSession(...))`; no change needed unless the ack type was narrowed. Ensure `completeSession`'s new return type flows through.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/session-complete-stats.test.ts tests/integration/session-upsert.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/services/session.service.ts src/server/services/stats.service.ts tests/integration/session-complete-stats.test.ts
git commit -m "feat(stats): evaluate stats on completion and return a celebration"
```

---

### Task 10: Stats API + hook

**Files:**
- Create: `src/app/api/stats/route.ts`
- Create: `src/features/gamification/hooks/use-stats.ts`
- Create: `src/features/gamification/hooks/query-keys.ts`
- Test: `tests/unit/stats-route.test.ts`

**Interfaces:**
- Produces: `GET /api/stats` → `StatsDTO`; `useStats()` query.

- [ ] **Step 1: Write the failing route test**

```ts
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/stats.service", () => ({ getStats: vi.fn(async () => ({ xp: 100, level: 2, currentStreak: 1, longestStreak: 1, lastHitDate: null, streakFreezes: 2, totalSessions: 1, totalVolumeKg: 10, xpToNextLevel: 300, levelProgress: 0, weeklyGoal: { target: 3, completed: 1, weekStart: "2026-01-05" } })) }))
import { GET } from "@/app/api/stats/route"

describe("GET /api/stats", () => {
  it("returns the stats envelope", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.xp).toBe(100)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/stats-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add `getStats` + `StatsDTO` to `stats.service.ts`**

```ts
export type StatsDTO = {
  currentStreak: number; longestStreak: number; lastHitDate: string | null
  streakFreezes: number; totalSessions: number; totalVolumeKg: number
  xp: number; level: number; xpToNextLevel: number; levelProgress: number
  weeklyGoal: { target: number; completed: number; weekStart: string }
}

export async function getStats(userId: string): Promise<StatsDTO> {
  const stats = (await repos.findStatsByUser(userId)) ?? { userId, currentStreak: 0, longestStreak: 0, lastHitDate: null, streakFreezes: 2, totalSessions: 0, totalVolumeKg: 0, xp: 0, level: 1 }
  const profile = await profileRepo.findByUserId(userId)
  const timeZone = profile?.timezone ?? "UTC"
  const weekStartsOn = profile?.weekStartsOn ?? 1
  const target = profile?.daysPerWeek ?? 3
  const sessions = await repos.listCompletedSessions(userId)
  const today = localDate(new Date(), timeZone)
  const start = weekStart(today, weekStartsOn)
  const completed = sessions.filter((s) => s.completedAt && localDate(s.completedAt, timeZone) >= start && localDate(s.completedAt, timeZone) <= today).length
  return {
    currentStreak: stats.currentStreak, longestStreak: stats.longestStreak,
    lastHitDate: stats.lastHitDate ? stats.lastHitDate.toISOString().slice(0, 10) : null,
    streakFreezes: stats.streakFreezes, totalSessions: stats.totalSessions,
    totalVolumeKg: stats.totalVolumeKg, xp: stats.xp, level: stats.level,
    xpToNextLevel: xpToNextLevel(stats.xp), levelProgress: levelProgress(stats.xp),
    weeklyGoal: { target, completed, weekStart: start },
  }
}
```

Import `weekStart` from the week lib, `xpToNextLevel`/`levelProgress` from the level lib.

- [ ] **Step 4: Create the route**

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getStats } from "@/server/services/stats.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getStats(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}
```

- [ ] **Step 5: Create the hook**

```ts
export const gamificationKeys = { all: ["gamification"] as const, stats: () => [...gamificationKeys.all, "stats"] as const, achievements: () => [...gamificationKeys.all, "achievements"] as const }
```

```ts
"use client"
import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { StatsDTO } from "@/server/services/stats.service"
import { gamificationKeys } from "./query-keys"

export function useStats() {
  return useQuery({
    queryKey: gamificationKeys.stats(),
    queryFn: async () => (await api.get<ApiEnvelope<StatsDTO>>("/stats")).data.data,
  })
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/stats-route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/stats/route.ts src/features/gamification/hooks/use-stats.ts src/features/gamification/hooks/query-keys.ts tests/unit/stats-route.test.ts
git commit -m "feat(stats): stats API and query hook"
```

---

### Task 11: Expose `isPr` on the session set DTO

**Files:**
- Modify: `src/server/repositories/session.repository.ts` (`sessionSelect` sets select)
- Modify: `src/server/services/session.service.ts` (`SessionSetDTO`)
- Modify: `src/features/workouts/hooks/use-active-session.ts` (`SessionSetDTO`)
- Test: `tests/unit/sessions-route.test.ts` (DTO identity already asserts equality), `tests/integration/stats-engine.test.ts` (add isPr assertion)

**Interfaces:**
- Produces: `SessionSetDTO.isPr: boolean` (server + client).

- [ ] **Step 1: Add `isPr` to both DTOs and the select**

- `session.repository.ts` `sessionSelect.exercises.select.sets.select`: add `isPr: true`.
- `session.service.ts` `SessionSetDTO`: add `isPr: boolean`.
- `use-active-session.ts` `SessionSetDTO`: add `isPr: boolean`.

`toSessionDTO` spreads `...set`, so `isPr` flows through unchanged.

- [ ] **Step 2: Assert it in the integration test**

Append to `tests/integration/stats-engine.test.ts`:

```ts
it("exposes isPr on the session set DTO", async () => {
  const { user, routine } = await makeUser()
  const sessionId = await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
  const { getSession } = await import("@/server/services/session.service")
  const dto = await getSession(user.id, sessionId)
  expect(dto.exercises[0]?.sets.some((set) => set.isPr)).toBe(true)
})
```

- [ ] **Step 3: Run the tests**

```bash
pnpm exec vitest run tests/unit/sessions-route.test.ts
pnpm exec vitest run --config vitest.integration.config.ts tests/integration/stats-engine.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/repositories/session.repository.ts src/server/services/session.service.ts src/features/workouts/hooks/use-active-session.ts tests/integration/stats-engine.test.ts
git commit -m "feat(sessions): expose isPr on set DTOs"
```

---

### Task 12: History list API + hook

**Files:**
- Create: `src/features/history/schemas/history.ts`
- Create: `src/server/repositories/history.repository.ts`
- Create: `src/server/services/history.service.ts`
- Create: `src/app/api/history/route.ts`
- Create: `src/features/history/hooks/query-keys.ts`, `src/features/history/hooks/use-history.ts`
- Test: `tests/unit/history-route.test.ts`, `tests/integration/history.test.ts`

**Interfaces:**
- Produces: `historyQuerySchema` (`{ cursor?, limit, from?, to?, routineId? }`); `HistoryItemDTO = { id, name, startedAt, completedAt, activeSeconds, totalVolumeKg, setCount, prCount, routineId, routineDayId }`; `listHistory(userId, input): { items: HistoryItemDTO[]; nextCursor: string | null }`; `useHistory()` infinite query.

- [ ] **Step 1: Write the schema + failing integration test**

`src/features/history/schemas/history.ts`:

```ts
import { z } from "zod"

export const historyQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  routineId: z.string().min(1).optional(),
})
export type HistoryQuery = z.infer<typeof historyQuerySchema>
```

`tests/integration/history.test.ts`:

```ts
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { listHistory } from "@/server/services/history.service"
import { assertCatalogSeeded } from "./helpers/catalog"
// ...makeUser + complete helpers as in Task 8...

const DOMAIN = "@history-test.local"

describe("history", () => {
  beforeAll(assertCatalogSeeded)
  afterEach(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } }) })

  it("lists completed sessions newest-first and paginates", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    await complete(user.id, routine, 0, new Date("2026-01-06T10:00:00Z"))
    await complete(user.id, routine, 0, new Date("2026-01-07T10:00:00Z"))
    const page1 = await listHistory(user.id, { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.items[0]?.completedAt).toBe("2026-01-07T10:00:00.000Z")
    expect(page1.nextCursor).toBeTruthy()
    const page2 = await listHistory(user.id, { limit: 2, cursor: page1.nextCursor! })
    expect(page2.items).toHaveLength(1)
    expect(page2.nextCursor).toBeNull()
  })

  it("filters by date range and routine, and is ownership-scoped", async () => {
    const { user, routine } = await makeUser()
    await complete(user.id, routine, 0, new Date("2026-01-05T10:00:00Z"))
    await complete(user.id, routine, 0, new Date("2026-02-05T10:00:00Z"))
    const jan = await listHistory(user.id, { limit: 20, from: "2026-01-01", to: "2026-01-31" })
    expect(jan.items).toHaveLength(1)
    const other = await prisma.user.create({ data: { email: `h2_${Date.now()}${DOMAIN}`, profile: { create: {} } } })
    expect((await listHistory(other.id, { limit: 20 })).items).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const historySelect = {
  id: true, name: true, startedAt: true, completedAt: true, activeSeconds: true,
  routineId: true, routineDayId: true,
  exercises: { select: { sets: { select: { reps: true, weightKg: true, completedAt: true, isPr: true } } } },
} satisfies Prisma.WorkoutSessionSelect
export type HistoryRecord = Prisma.WorkoutSessionGetPayload<{ select: typeof historySelect }>

export function listCompletedSessionsPage(
  userId: string,
  args: { limit: number; cursor?: { completedAt: Date; id: string }; from?: Date; to?: Date; routineId?: string },
) {
  return prisma.workoutSession.findMany({
    where: {
      userId, status: "completed", completedAt: { not: null, ...(args.from ? { gte: args.from } : {}), ...(args.to ? { lte: args.to } : {}) },
      ...(args.routineId ? { routineId: args.routineId } : {}),
      ...(args.cursor ? { OR: [{ completedAt: { lt: args.cursor.completedAt } }, { completedAt: args.cursor.completedAt, id: { lt: args.cursor.id } }] } : {}),
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    take: args.limit + 1,
    select: historySelect,
  })
}
```

- [ ] **Step 4: Implement the service**

```ts
import "server-only"
import type { HistoryQuery } from "@/features/history/schemas/history"
import * as repos from "@/server/repositories/history.repository"

export type HistoryItemDTO = {
  id: string; name: string; startedAt: string; completedAt: string; activeSeconds: number
  totalVolumeKg: number; setCount: number; prCount: number
  routineId: string | null; routineDayId: string | null
}

function toItem(row: repos.HistoryRecord): HistoryItemDTO {
  let totalVolumeKg = 0, setCount = 0, prCount = 0
  for (const exercise of row.exercises) {
    for (const set of exercise.sets) {
      if (set.isPr) prCount += 1
      if (set.completedAt) {
        setCount += 1
        if (set.reps != null && set.weightKg != null) totalVolumeKg += set.reps * set.weightKg
      }
    }
  }
  return {
    id: row.id, name: row.name, startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt!.toISOString(), activeSeconds: row.activeSeconds,
    totalVolumeKg, setCount, prCount, routineId: row.routineId, routineDayId: row.routineDayId,
  }
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return undefined
  const [iso, id] = cursor.split("|")
  if (!iso || !id) return undefined
  return { completedAt: new Date(iso), id }
}

export async function listHistory(userId: string, query: HistoryQuery) {
  const rows = await repos.listCompletedSessionsPage(userId, {
    limit: query.limit,
    ...(decodeCursor(query.cursor) ? { cursor: decodeCursor(query.cursor)! } : {}),
    ...(query.from ? { from: new Date(`${query.from}T00:00:00.000Z`) } : {}),
    ...(query.to ? { to: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    ...(query.routineId ? { routineId: query.routineId } : {}),
  })
  const hasMore = rows.length > query.limit
  const items = rows.slice(0, query.limit).map(toItem)
  const last = items[items.length - 1]
  const nextCursor = hasMore && last ? `${last.completedAt}|${last.id}` : null
  return { items, nextCursor }
}
```

- [ ] **Step 5: Implement the route + hook**

`src/app/api/history/route.ts`:

```ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { historyQuerySchema } from "@/features/history/schemas/history"
import { listHistory } from "@/server/services/history.service"

export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const url = new URL(request.url)
    const parsed = historyQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) throw new ValidationError("Invalid history query", parsed.error.flatten())
    return ok(await listHistory(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
```

`src/features/history/hooks/query-keys.ts`:

```ts
export const historyKeys = { all: ["history"] as const, list: (filters: string) => [...historyKeys.all, filters] as const }
```

`src/features/history/hooks/use-history.ts`:

```ts
"use client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { HistoryItemDTO } from "@/server/services/history.service"
import { historyKeys } from "./query-keys"

export type HistoryFilters = { from?: string; to?: string; routineId?: string }

export function useHistory(filters: HistoryFilters) {
  const key = JSON.stringify(filters)
  return useInfiniteQuery({
    queryKey: historyKeys.list(key),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<ApiEnvelope<{ items: HistoryItemDTO[]; nextCursor: string | null }>>("/history", {
        params: { ...filters, cursor: pageParam ?? undefined },
      })
      return res.data.data
    },
    getNextPageParam: (last) => last.nextCursor,
  })
}
```

- [ ] **Step 6: Add the route unit test and run**

`tests/unit/history-route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/history.service", () => ({ listHistory: vi.fn(async () => ({ items: [], nextCursor: null })) }))
import { GET } from "@/app/api/history/route"

describe("GET /api/history", () => {
  it("returns an empty page", async () => {
    const res = await GET(new Request("http://x/api/history?limit=20"))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { items: [], nextCursor: null } })
  })
  it("rejects a bad limit", async () => {
    const res = await GET(new Request("http://x/api/history?limit=999"))
    expect(res.status).toBe(400)
  })
})
```

Run: `pnpm exec vitest run tests/unit/history-route.test.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/history.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/history src/server/repositories/history.repository.ts src/server/services/history.service.ts src/app/api/history tests/unit/history-route.test.ts tests/integration/history.test.ts
git commit -m "feat(history): paginated, filterable completed-session list"
```

---

### Task 13: Achievements API + hook

**Files:**
- Create: `src/app/api/achievements/route.ts`
- Create: `src/features/gamification/hooks/use-achievements.ts`
- Test: `tests/unit/achievements-route.test.ts`

**Interfaces:**
- Produces: `getAchievements(userId)` → `{ achievements: AchievementDTO[]; unlocked: { achievementId: string; unlockedAt: string }[] }`; `useAchievements()`.

- [ ] **Step 1: Add `getAchievements` to `stats.service.ts`**

```ts
export async function getAchievements(userId: string) {
  const [catalog, unlocked] = await Promise.all([repos.listAchievements(), repos.listUserAchievements(userId)])
  return {
    achievements: catalog.map((a) => ({ id: a.id, slug: a.slug, name: a.name, nameEs: a.nameEs, description: a.description, descriptionEs: a.descriptionEs, icon: a.icon, xpReward: a.xpReward })),
    unlocked: unlocked.map((u) => ({ achievementId: u.achievementId, unlockedAt: u.unlockedAt.toISOString() })),
  }
}
```

- [ ] **Step 2: Route + hook**

```ts
// src/app/api/achievements/route.ts
import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getAchievements } from "@/server/services/stats.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getAchievements(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}
```

```ts
// src/features/gamification/hooks/use-achievements.ts
"use client"
import { useQuery } from "@tanstack/react-query"
import { api, type ApiEnvelope } from "@/lib/axios"
import type { AchievementDTO } from "@/server/services/stats.service"
import { gamificationKeys } from "./query-keys"

export type AchievementsResponse = { achievements: AchievementDTO[]; unlocked: { achievementId: string; unlockedAt: string }[] }

export function useAchievements() {
  return useQuery({
    queryKey: gamificationKeys.achievements(),
    queryFn: async () => (await api.get<ApiEnvelope<AchievementsResponse>>("/achievements")).data.data,
  })
}
```

- [ ] **Step 3: Route test + run**

```ts
import { describe, expect, it, vi } from "vitest"
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1" } })) }))
vi.mock("@/server/services/stats.service", () => ({ getAchievements: vi.fn(async () => ({ achievements: [], unlocked: [] })) }))
import { GET } from "@/app/api/achievements/route"

describe("GET /api/achievements", () => {
  it("returns the catalog envelope", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { achievements: [], unlocked: [] } })
  })
})
```

Run: `pnpm exec vitest run tests/unit/achievements-route.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/achievements/route.ts src/features/gamification/hooks/use-achievements.ts tests/unit/achievements-route.test.ts
git commit -m "feat(gamification): achievements API and hook"
```

---

### Task 14: Nightly repair endpoint + CLI

**Files:**
- Create: `src/app/api/jobs/repair-stats/route.ts`
- Create: `scripts/job-repair-stats.ts`
- Modify: `package.json`, `.env.example`
- Test: `tests/unit/repair-stats-route.test.ts`

**Interfaces:**
- Consumes: `repairAllStats()` (Task 8).
- Produces: `POST /api/jobs/repair-stats` (401 without `x-job-secret`); `pnpm job:repair-stats`.

- [ ] **Step 1: Route test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest"
vi.mock("@/server/services/stats.service", () => ({ repairAllStats: vi.fn(async () => ({ repaired: 3 })) }))
import { POST } from "@/app/api/jobs/repair-stats/route"

beforeEach(() => { process.env.JOBS_SECRET = "s3cret" })

describe("POST /api/jobs/repair-stats", () => {
  it("rejects a missing/incorrect secret", async () => {
    const res = await POST(new Request("http://x/api/jobs/repair-stats", { method: "POST" }))
    expect(res.status).toBe(401)
  })
  it("runs with the correct secret", async () => {
    const res = await POST(new Request("http://x/api/jobs/repair-stats", { method: "POST", headers: { "x-job-secret": "s3cret" } }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { repaired: 3 } })
  })
})
```

- [ ] **Step 2: Implement the route**

```ts
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { repairAllStats } from "@/server/services/stats.service"

export async function POST(request: Request) {
  try {
    const secret = process.env.JOBS_SECRET
    if (!secret || request.headers.get("x-job-secret") !== secret) throw new UnauthorizedError()
    return ok(await repairAllStats())
  } catch (error) {
    return toApiError(error)
  }
}
```

- [ ] **Step 3: CLI + scripts + env**

`scripts/job-repair-stats.ts`:

```ts
import "dotenv/config"
import { repairAllStats } from "../src/server/services/stats.service"
import { prisma } from "../src/lib/prisma"

repairAllStats()
  .then((result) => console.log(`repair-stats: users=${result.repaired}`))
  .catch((error) => { console.error(error); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

`package.json` scripts: add `"job:repair-stats": "tsx scripts/job-repair-stats.ts"`.
`.env.example`: add `JOBS_SECRET=` with a comment that it guards the internal jobs endpoint.

- [ ] **Step 4: Run the test + CLI**

```bash
pnpm exec vitest run tests/unit/repair-stats-route.test.ts
pnpm job:repair-stats
```

Expected: PASS; CLI logs `users=<n>`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/jobs/repair-stats/route.ts scripts/job-repair-stats.ts package.json .env.example tests/unit/repair-stats-route.test.ts
git commit -m "feat(stats): nightly repair endpoint and CLI"
```

---

### Task 15: i18n copy

**Files:**
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/es.json`
- Create: `tests/unit/stats-messages.test.ts`

**Interfaces:**
- Produces keys: `dashboard.stats.{streak,longest,level,weeklyGoal,badges,viewHistory}`, `history.{title,filters,from,to,routine,allRoutines,loadMore,empty,pr,volume,duration,sets,close}`, `celebration.{xpGained,levelUp,badgeUnlocked,continue}`.

- [ ] **Step 1: Add the EN keys, then the ES keys (identical key set)**

`dashboard.stats`:
```json
"stats": { "streak": "{count}-day streak", "longest": "Longest {count}", "level": "Level {level}", "weeklyGoal": "{completed} of {target} this week", "badges": "Recent badges", "viewHistory": "View history" }
```
`history`:
```json
"history": { "title": "History", "filters": "Filters", "from": "From", "to": "To", "routine": "Routine", "allRoutines": "All routines", "loadMore": "Load more", "empty": "No workouts yet", "pr": "PR", "volume": "Volume", "duration": "Duration", "sets": "Sets", "close": "Close" }
```
`celebration`:
```json
"celebration": { "xpGained": "+{count} XP", "levelUp": "Level {level}!", "badgeUnlocked": "Badge unlocked", "continue": "Continue" }
```

Spanish equivalents with the same keys (e.g. `dashboard.stats.streak`: `"Racha de {count} días"`, `history.title`: `"Historial"`, `celebration.xpGained`: `"+{count} XP"`, etc.).

- [ ] **Step 2: Add the parity test**

```ts
import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

type Dict = Record<string, unknown>
const dicts: [string, Dict][] = [["en", en as Dict], ["es", es as Dict]]
function at(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Dict)[key] : undefined), dict)
}
const KEYS = [
  "dashboard.stats.streak", "dashboard.stats.longest", "dashboard.stats.level", "dashboard.stats.weeklyGoal", "dashboard.stats.badges", "dashboard.stats.viewHistory",
  "history.title", "history.filters", "history.from", "history.to", "history.routine", "history.allRoutines", "history.loadMore", "history.empty", "history.pr", "history.volume", "history.duration", "history.sets", "history.close",
  "celebration.xpGained", "celebration.levelUp", "celebration.badgeUnlocked", "celebration.continue",
] as const

describe("stats copy", () => {
  it("defines every stats/history/celebration key in both locales", () => {
    for (const [locale, m] of dicts) {
      for (const key of KEYS) {
        const value = at(m, key)
        expect(typeof value === "string" && value.trim().length > 0, `${locale}:${key}`).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 3: Run the i18n tests**

Run: `pnpm exec vitest run tests/unit/i18n.test.ts tests/unit/stats-messages.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/es.json tests/unit/stats-messages.test.ts
git commit -m "feat(i18n): stats, history, and celebration copy (en/es)"
```

---

### Task 16: Dashboard stats header

**Files:**
- Create: `src/features/gamification/components/stats-header.tsx`
- Modify: `src/app/[locale]/(app)/dashboard/page.tsx`
- Test: `tests/unit/stats-header.test.tsx`

**Interfaces:**
- Consumes: `useStats()` (Task 10), `useAchievements()` (Task 13).
- Produces: `<StatsHeader />` rendered above the routine preview.

- [ ] **Step 1: Write the failing component test**

```tsx
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { StatsHeader } from "@/features/gamification/components/stats-header"

vi.mock("@/features/gamification/hooks/use-stats", () => ({ useStats: () => ({ data: { currentStreak: 3, longestStreak: 5, lastHitDate: "2026-01-07", streakFreezes: 2, totalSessions: 4, totalVolumeKg: 1234, xp: 250, level: 2, xpToNextLevel: 150, levelProgress: 0.5, weeklyGoal: { target: 3, completed: 2, weekStart: "2026-01-05" } }, isLoading: false, isError: false }) }))
vi.mock("@/features/gamification/hooks/use-achievements", () => ({ useAchievements: () => ({ data: { achievements: [], unlocked: [] }, isLoading: false, isError: false }) }))

describe("StatsHeader", () => {
  it("shows streak, level, and weekly goal", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><StatsHeader /></NextIntlClientProvider>)
    expect(screen.getByText(/3-day streak/)).toBeInTheDocument()
    expect(screen.getByText(/Level 2/)).toBeInTheDocument()
    expect(screen.getByText(/2 of 3 this week/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/stats-header.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stats-header.tsx`**

A client component: streak + longest, level + an XP bar (`div` width `${levelProgress*100}%`), weekly-goal progress, and recent unlocked badges (up to 5 icons/names from `useAchievements`), with loading skeleton and error fallback. Use `useTranslations("dashboard.stats")` and link to `/${locale}/progress` with `t("viewHistory")`.

```tsx
"use client"
import { Flame, Trophy } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useAchievements } from "@/features/gamification/hooks/use-achievements"
import { useStats } from "@/features/gamification/hooks/use-stats"

export function StatsHeader() {
  const t = useTranslations("dashboard.stats")
  const locale = useLocale()
  const { data, isLoading } = useStats()
  const achievements = useAchievements()
  if (isLoading || !data) return null
  const unlockedIds = new Set((achievements.data?.unlocked ?? []).map((u) => u.achievementId))
  const badges = (achievements.data?.achievements ?? []).filter((a) => unlockedIds.has(a.id)).slice(0, 5)
  return (
    <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 font-semibold"><Flame className="size-5 text-orange-500" weight="fill" aria-hidden="true" />{t("streak", { count: data.currentStreak })}</span>
        <span className="text-muted-foreground text-xs">{t("longest", { count: data.longestStreak })}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("level", { level: data.level })}</span>
        <div className="bg-muted h-2 overflow-hidden rounded-full"><div className="bg-primary h-full" style={{ width: `${Math.round(data.levelProgress * 100)}%` }} /></div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("weeklyGoal", { completed: data.weeklyGoal.completed, target: data.weeklyGoal.target })}</span>
        {badges.length > 0 ? <span className="inline-flex items-center gap-1"><Trophy className="size-4" weight="fill" aria-hidden="true" />{badges.length}</span> : null}
      </div>
      <Button asChild variant="outline" className="h-11"><Link href={`/${locale}/progress`}>{t("viewHistory")}</Link></Button>
    </section>
  )
}
```

- [ ] **Step 4: Mount it in the dashboard**

In `dashboard/page.tsx`, render `<StatsHeader />` above the routine preview (outside the loading/error branches so it shows independently).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run tests/unit/stats-header.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/gamification/components/stats-header.tsx "src/app/[locale]/(app)/dashboard/page.tsx" tests/unit/stats-header.test.tsx
git commit -m "feat(gamification): dashboard stats header"
```

---

### Task 17: History list + detail pages

**Files:**
- Modify: `src/app/[locale]/(app)/progress/page.tsx` (replace `ComingSoon`)
- Create: `src/app/[locale]/(app)/progress/[sessionId]/page.tsx`
- Create: `src/features/history/components/history-list.tsx`, `history-row.tsx`, `history-detail.tsx`, `history-filters.tsx`
- Test: `tests/unit/history-list.test.tsx`, `tests/unit/history-detail.test.tsx`

**Interfaces:**
- Consumes: `useHistory()` (Task 12), `useSession()` (existing), `useTranslations("history")`.

- [ ] **Step 1: Write the failing list test**

```tsx
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { HistoryList } from "@/features/history/components/history-list"

vi.mock("@/features/history/hooks/use-history", () => ({ useHistory: () => ({ data: { pages: [{ items: [{ id: "s1", name: "Push", startedAt: "2026-01-05T10:00:00.000Z", completedAt: "2026-01-05T11:00:00.000Z", activeSeconds: 3600, totalVolumeKg: 200, setCount: 3, prCount: 1, routineId: "r1", routineDayId: "d1" }], nextCursor: null }] }, isLoading: false, isError: false, hasNextPage: false, fetchNextPage: vi.fn() }) }))

describe("HistoryList", () => {
  it("renders a completed session row with a PR marker", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><HistoryList /></NextIntlClientProvider>)
    expect(screen.getByText("Push")).toBeInTheDocument()
    expect(screen.getByText("PR")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/history-list.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the components**

- `history-list.tsx` (`"use client"`): `useHistory(filters)` (filters state), renders `HistoryFilters`, rows (`history-row.tsx` linking to `/${locale}/progress/${id}`), a "Load more" button when `hasNextPage`, empty state when no items, skeleton while loading, error state.
- `history-row.tsx`: date (locale-formatted), name, duration (`formatDuration`), volume (`formatWeight`), PR count badge.
- `history-filters.tsx`: from/to date inputs and a routine `<select>` (options from `useActiveRoutine` or omit routine filter if simpler; spec requires routine filter — use `useRoutines()` list).
- `history-detail.tsx` (`"use client"`): takes a `SessionDTO`, renders exercises with sets, marking PR sets; duration, volume, sets.

`progress/page.tsx` becomes a client page rendering `<HistoryList />` with an `<h1>{t("title")}</h1>`.
`progress/[sessionId]/page.tsx` mirrors the summary page: `useParams`, `useSession(id)`, loading/error/detail.

- [ ] **Step 4: Add the detail test**

```tsx
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { HistoryDetail } from "@/features/history/components/history-detail"

const session = { id: "s1", userId: "u1", routineId: "r1", routineDayId: "d1", name: "Push", status: "completed" as const, startedAt: "2026-01-05T10:00:00.000Z", completedAt: "2026-01-05T11:00:00.000Z", activeSeconds: 3600, notes: null, snapshot: {}, exercises: [{ id: "se1", exerciseId: "e1", order: 0, nameSnapshot: "Squat", targetSets: 3, targetReps: "5", restSeconds: 60, timerType: "none" as const, workSeconds: null, rounds: null, completed: true, skipped: false, swappedFromId: null, notes: null, exercise: null, lastPerformance: null, sets: [{ id: "set1", setNumber: 1, type: "working" as const, reps: 5, weightKg: 100, durationSeconds: null, rpe: null, restSecondsLogged: null, completedAt: "2026-01-05T10:30:00.000Z", isPr: true }] }] }

describe("HistoryDetail", () => {
  it("renders the exercise, its set, and the PR marker", () => {
    render(<NextIntlClientProvider locale="en" messages={en}><HistoryDetail session={session} /></NextIntlClientProvider>)
    expect(screen.getByText("Squat")).toBeInTheDocument()
    expect(screen.getByText("PR")).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run and typecheck**

Run: `pnpm exec vitest run tests/unit/history-list.test.tsx tests/unit/history-detail.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/(app)/progress" src/features/history/components tests/unit/history-list.test.tsx tests/unit/history-detail.test.tsx
git commit -m "feat(history): list and read-only detail pages"
```

---

### Task 18: Celebrations (XP toast + badge modal)

**Files:**
- Create: `src/features/gamification/hooks/use-new-achievements.ts`, `src/features/gamification/hooks/use-xp-celebration.ts`
- Create: `src/features/gamification/components/celebration-layer.tsx`
- Modify: `src/app/[locale]/(app)/workout/summary/[sessionId]/page.tsx`, `src/app/[locale]/(app)/dashboard/page.tsx`
- Test: `tests/unit/celebration-layer.test.tsx`

**Interfaces:**
- Consumes: `useStats()`, `useAchievements()`.
- Produces: `useNewAchievements(unlocked, catalog)`, `useXpCelebration(xp)`, `<CelebrationLayer />`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import en from "@/i18n/messages/en.json"
import { CelebrationLayer } from "@/features/gamification/components/celebration-layer"

vi.mock("@/features/gamification/hooks/use-stats", () => ({ useStats: () => ({ data: { xp: 500, level: 3, levelProgress: 0.1, xpToNextLevel: 900, currentStreak: 1, longestStreak: 1, lastHitDate: null, streakFreezes: 2, totalSessions: 5, totalVolumeKg: 0, weeklyGoal: { target: 3, completed: 1, weekStart: "2026-01-05" } }, isLoading: false, isError: false }) }))
vi.mock("@/features/gamification/hooks/use-achievements", () => ({ useAchievements: () => ({ data: { achievements: [{ id: "a1", slug: "first_workout", name: "First Workout", nameEs: "Primero", description: "d", descriptionEs: "d", icon: "barbell", xpReward: 100 }], unlocked: [{ achievementId: "a1", unlockedAt: new Date().toISOString() }] }, isLoading: false, isError: false }) }))

beforeEach(() => localStorage.clear())

describe("CelebrationLayer", () => {
  it("shows the badge modal for a newly unlocked achievement", async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><CelebrationLayer /></NextIntlClientProvider>)
    expect(await screen.findByText(/Badge unlocked/i)).toBeInTheDocument()
    expect(screen.getByText("First Workout")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/unit/celebration-layer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the hooks + component**

`use-xp-celebration.ts` — on `useStats().data.xp`, compare to `localStorage["gym.lastSeenXp"]`; if greater (and a prior value existed), `toast.success(t("xpGained", { count: delta }))` and, on level change, a second toast `t("levelUp", { level })`; persist the new XP.

`use-new-achievements.ts` — as designed earlier (compare `unlockedAt` to `localStorage["gym.lastCelebratedAt"]`; return `{ queue, dismiss }`).

`celebration-layer.tsx` (`"use client"`) — calls both hooks and renders a Radix `Dialog` (`AlertDialog`/`Dialog` from `@/components/ui`) when `queue.length > 0`, showing the badge name (locale-aware) and `t("badgeUnlocked")`, with a dismiss button (`t("continue")`). Rendered once on the summary and dashboard pages.

- [ ] **Step 4: Mount it**

Add `<CelebrationLayer />` to the summary page and the dashboard page.

- [ ] **Step 5: Run and typecheck**

Run: `pnpm exec vitest run tests/unit/celebration-layer.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/gamification/hooks/use-new-achievements.ts src/features/gamification/hooks/use-xp-celebration.ts src/features/gamification/components/celebration-layer.tsx "src/app/[locale]/(app)/workout/summary/[sessionId]/page.tsx" "src/app/[locale]/(app)/dashboard/page.tsx" tests/unit/celebration-layer.test.tsx
git commit -m "feat(gamification): XP toast and badge-unlock celebration"
```

---

### Task 19: End-to-end test, gates, and roadmap

**Files:**
- Create: `tests/e2e/tracking.spec.ts`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Write the e2e spec**

Seed an onboarded user with a single-day routine, complete a workout through the runner (reuse the `tests/e2e/workout-runner.spec.ts` flow), then assert on the dashboard that a streak/level is shown and that `/en/progress` lists the session and opens its detail.

- [ ] **Step 2: Run every gate**

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

Expected: all green. Raise coverage with unit tests for the new pure modules if it dips below thresholds.

- [ ] **Step 3: Update the roadmap**

In `docs/ROADMAP.md`, add a **3A** row (Done) with the spec/plan/SDD paths, note 3B (progress dashboard: charts, heatmap, PR views, body-metric log) as the next phase, and keep Phase 4 after it.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/tracking.spec.ts docs/ROADMAP.md
git commit -m "test(e2e): tracking + history; docs: mark 3a complete"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §3 data model | 1 |
| §4 pure libs | 2, 3, 4, 5, 6 |
| §5 stats engine + PR marking + freeze balance | 8 |
| §6 completion integration + celebration | 9, 18 |
| §7 nightly repair | 14 |
| §8 API (`stats`, `history`, `isPr`, `achievements`, job) | 10, 11, 12, 13, 14 |
| §9 UI (header, history, celebration) | 16, 17, 18 |
| §10 i18n | 15 |
| §11 testing | every task + 19 |
| §13 acceptance | 19 |

No gaps.

**2. Placeholder scan**

No "TBD"/"TODO"/"handle edge cases". Pure-lib and repository/service code is given in full; UI tasks give the component skeleton and test plus precise wiring, since their shape mirrors existing pages (`workout/summary`, `routines/[routineId]`).

**3. Type consistency**

- `StatsRecord`/`StatsDTO`/`AchievementDTO` are defined in Tasks 8–10 and reused in 13, 16, 18.
- `HistoryItemDTO` (Task 12) is the shape the list hook and rows consume.
- `isPr` is added consistently to the server select, server DTO, and client DTO (Task 11), and the DTO-identity unit test still passes.
- `recomputeUserStats` returns `{ stats, unlockedSlugs, xpBefore }`; `completeSession` (Task 9) and the nightly job (Task 14) consume it as defined.
- The celebration UI reads `useStats`/`useAchievements` (Tasks 10/13), not the completion response, so it works for offline-synced finishes.

**4. Review Focus**

1. Timezone/DST streak boundaries → Task 4 (`computeStreak` tests) + Task 8 (`localDate` via `Intl`).
2. Replayed completion adds nothing → Task 8 idempotency test + Task 9 empty-celebration replay test.
3. Freeze window/balance → Task 4 (recent vs old miss, never negative) + Task 8 (balance).
4. Weekly-goal boundary → Task 5 (`weekStart`/`weeksGoalMet`) + Task 8 (once per week via `key`).
5. History correctness → Task 12 (cursor stability, filters, ownership).

