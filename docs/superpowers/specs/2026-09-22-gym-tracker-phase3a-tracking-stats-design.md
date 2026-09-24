# Gym Tracker — Phase 3A Tracking + Stats Engine — Design Spec

- **Date:** 2026-09-22
- **Status:** Proposed
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding)
- **Depends on:** Phases 1, 1.5, 2A, 2B, 2C (merged to `main`)
- **Sibling:** Phase 3B (progress dashboard: charts, muscle heatmap, PR views, body-metric log) — separate spec/plan

## 1. Objective

Turn logged workouts into progress feedback. Phase 3A delivers the **tracking foundation and
gamification engine**: a server-side stats engine (scheduled-day streak with automatic freezes,
XP/levels, achievements, weekly goal) that is recomputed from completed sessions on completion
and repaired nightly, plus a **workout-history browser** (list + read-only detail) and the
**celebration** moments (XP toast, badge unlock) and a **dashboard stats header**.

### Success criteria

- Completing a session updates the user's streak, XP, level, and (when earned) achievements.
- The streak follows parent spec §8.3 exactly, including neutral rest days and automatic freezes.
- The user can browse completed sessions (cursor-paginated, filterable) and open a read-only
  detail with per-set PR markers.
- The dashboard shows streak, level/XP progress, and weekly-goal progress.
- Stats are recomputable and idempotent: replaying a completion changes nothing; the nightly
  repair job fixes drift.
- All copy is localized (EN/ES); touch targets ≥ 44px.

### Non-goals (out of scope for 3A)

- Dashboard charts, muscle heatmap, per-exercise history charts, PR display views, and the
  body-metric log (Phase 3B).
- Editing a completed session (sessions stay immutable).
- AI features (Phase 4).
- Social/sharing, leaderboards.
- A full profile-settings redesign (weekly goal reuses `Profile.daysPerWeek`).

## 2. Scope

| Area | In 3A |
|---|---|
| `UserStats` / `XpEvent` / `Achievement` / `UserAchievement` + `SetLog.isPr` | Yes |
| Pure libs: level/XP, PR/1RM, streak, week, achievements | Yes |
| Recompute-on-completion stats engine | Yes |
| Nightly repair endpoint + CLI | Yes |
| Workout-history list + read-only detail + filters | Yes |
| Stats + achievements APIs | Yes |
| Dashboard stats header + post-workout celebration | Yes |
| Charts, heatmap, PR views, body-metric log | No (3B) |

## 3. Data model

New models (adapted from parent spec §8.2, §15):

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
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, reason, refType, refId])
  @@index([userId, createdAt])
}

model Achievement {
  id             String @id @default(cuid())
  slug           String @unique
  name           String
  nameEs         String
  description    String
  descriptionEs  String
  icon           String
  criteria       Json
  xpReward       Int
  order          Int

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

Changes to existing models:
- `SetLog` gains `isPr Boolean @default(false)` (set once at completion).
- Back-relations: `User.stats UserStats?`, `User.xpEvents XpEvent[]`, `User.achievements UserAchievement[]`.

**Weekly goal:** reuse `Profile.daysPerWeek` (default **3** when null). No `weeklyGoal` field on
`UserStats` (avoids a second source of truth); the DTO surfaces it as the weekly goal.

**Indexes:** add `WorkoutSession @@index([userId, status, completedAt])` for history and recompute.

## 4. Pure domain libs

All pure and unit-tested under `src/features/gamification/lib/`.

- `level.ts` — `levelForXp(xp) = floor(sqrt(max(0,xp)/100)) + 1`; `xpForLevel(level) = 100*(level-1)^2`;
  `xpToNextLevel(xp)`; `levelProgress(xp)` (0–1 within the current level).
- `xp.ts` — `XP_AWARDS = { session: 100, weeklyGoal: 150, pr: 50, streakMilestones: { 7: 100, 30: 500, 100: 2000 } }`.
- `pr.ts` — `epley1rm(weightKg, reps)`; `selectPrSet(sets, priorBest1rm)` returns the single best
  set (by 1RM) that beats the prior best, or `null`; first-ever recorded set (no prior best) is a PR.
- `streak.ts` — `computeStreak({ hitDates, scheduledWeekdays, today, earnedFreezes })` where
  `hitDates` are local ISO date strings and `scheduledWeekdays` is a `Set<number>`. Walks the
  calendar from the earliest hit to `today`: a hit day increments the streak; a missed scheduled
  weekday consumes one freeze if any remain (automatic apply), otherwise breaks; neutral days are
  skipped; multiple hits on one date count once. Returns `{ current, longest, lastHitDate,
  freezesRemaining, freezesUsed }`.
- `week.ts` — `weekStart(date, weekStartsOn)`; `weeksGoalMet(sessions, goal, weekStartsOn)` →
  the set of week-start dates whose completed-session count met `goal`.
- `achievements.ts` — `ACHIEVEMENTS` (10 bilingual badges; criteria JSON of
  `{ type: "sessions" | "streak" | "volume" | "pr" | "weekly_goal", threshold: number }`) and
  `evaluateAchievements(stats, derived)` → unlocked slugs.

Achievement catalog (slug, criterion, XP reward):

| Slug | Criterion | XP |
|---|---|---|
| `first_workout` | sessions ≥ 1 | 100 |
| `sessions_10` | sessions ≥ 10 | 200 |
| `sessions_50` | sessions ≥ 50 | 500 |
| `streak_7` | longest streak ≥ 7 | 100 |
| `streak_30` | longest streak ≥ 30 | 500 |
| `volume_100k` | total volume ≥ 100 000 kg | 200 |
| `volume_1m` | total volume ≥ 1 000 000 kg | 1000 |
| `first_pr` | PRs ≥ 1 | 100 |
| `pr_10` | PRs ≥ 10 | 300 |
| `weekly_goal_4` | weeks goal met ≥ 4 | 300 |

## 5. Stats engine

`src/server/services/stats.service.ts` + `src/server/repositories/stats.repository.ts`.

- **`markPersonalRecords(tx, userId, sessionId)`** — runs once on the `in_progress → completed`
  transition. For each exercise in the session, computes the prior best Epley 1RM across earlier
  completed sessions and marks at most one set (`isPr = true`) if it beats it; first-ever is a PR.
- **`recomputeUserStats(userId)`** — idempotent, from completed sessions:
  1. Load completed sessions (`completedAt`, snapshot `weekday`/`routineDayId`, sets) and the
     profile (`timezone`, `weekStartsOn`, `daysPerWeek`).
  2. Derive local hit dates (per §8.3: a session with a `routineDayId` counts as scheduled; a
     session with no day counts only when the user had no active routine) and call
     `computeStreak`.
  3. Totals: `totalSessions`, `totalVolumeKg` (Σ completed working-set `reps × weightKg`), PR count.
  4. **Ensure `XpEvent`s** via the unique `[userId, reason, refType, refId]` key: one `session`
     per completed session, one `weekly_goal` per met week, one `streak_milestone` per reached
     milestone, one `achievement` per unlocked badge.
  5. **Evaluate achievements** against the recomputed stats + derived values; insert
     `UserAchievement` rows for newly met criteria (idempotent).
  6. Upsert `UserStats`; set `xp = Σ XpEvent.amount` and `level = levelForXp(xp)`.
- **`streakFreezes`** balance: `min(3, 2 + floor(monthsSince(User.createdAt)))`, deterministic;
  `computeStreak` consumes from it and the remainder is stored.

## 6. Completion integration & celebrations

- `completeSession` (Phase 2B/2C, idempotent) on the transition runs `markPersonalRecords` +
  `recomputeUserStats` (within the same transaction where practical). Replays that hit an
  already-completed session return the existing ack with an **empty celebration**.
- The completion response is extended with
  `celebration: { xpGained, level, leveledUp, unlocked: AchievementDTO[] }` (empty on replay).
- **Client:** the summary shows an XP toast (from the response, or a locally computed session-XP
  estimate when the finish happened offline) and a badge-unlock modal. `useNewAchievements()`
  compares fetched `UserAchievement.unlockedAt` against a persisted `lastCelebratedAt` and shows
  the modal once, so badges unlocked by offline sessions celebrate after sync.

## 7. Nightly repair

- `POST /api/jobs/repair-stats` — guarded by an `x-job-secret` header matching `JOBS_SECRET`
  (401 otherwise); iterates all users and calls `recomputeUserStats`.
- `pnpm job:repair-stats` — CLI (`scripts/job-repair-stats.ts`) for local/cron runs.
- `.env.example` documents `JOBS_SECRET`.

## 8. API

Conventions unchanged: thin handler → service → repository; `{ data }` / `{ error: { code,
message, details? } }`; `auth()`-scoped by `userId`; `select`ed DTOs; ISO datetimes.

| Method & path | Purpose | Response |
|---|---|---|
| `GET /api/stats` | the user's stats + weekly goal | `{ data: StatsDTO }` |
| `GET /api/history?cursor=&limit=&from=&to=&routineId=` | cursor-paginated completed sessions | `{ data: { items: HistoryItemDTO[]; nextCursor: string \| null } }` |
| `GET /api/sessions/[sessionId]` | **extended** — sets gain `isPr` | `{ data: SessionDTO }` |
| `GET /api/achievements` | seeded catalog + user unlocks | `{ data: { achievements: AchievementDTO[]; unlocked: { achievementId; unlockedAt }[] } }` |
| `POST /api/jobs/repair-stats` | recompute all users | `{ data: { repaired: number } }` |

`StatsDTO = { currentStreak, longestStreak, lastHitDate, streakFreezes, totalSessions,
totalVolumeKg, xp, level, xpToNextLevel, levelProgress, weeklyGoal: { target, completed, weekStart } }`.

`HistoryItemDTO = { id, name, startedAt, completedAt, activeSeconds, totalVolumeKg, setCount,
prCount, routineId, routineDayId }`.

History pagination is cursor-based (`startedAt` desc, tiebreak `id`), `limit` default 20 (max 50),
filters `from`/`to` (dates) and `routineId`; only `completed` sessions, ownership-scoped.

## 9. UI

- **Dashboard stats header** (`dashboard`): current/longest streak, level + XP bar, weekly-goal
  progress, recent badges; loading/error/empty states; a link to history. Rendered above the
  existing routine preview.
- **History** (`/[locale]/(app)/history`): cursor "Load more", date-range + routine filters,
  completed-session rows (date, name, duration, volume, PR count) → `/[locale]/(app)/history/[sessionId]`
  read-only detail (exercises/sets from the snapshot, PR markers, duration, volume). Linked from
  the dashboard; bottom nav unchanged.
- **Celebration:** XP toast + badge modal on the summary (online finish) and a `useNewAchievements`
  modal on the dashboard.
- Mobile-first, ≥44px targets, visible focus, `aria-live` for the XP toast; no hardcoded copy.

## 10. i18n

New namespaces in both `en`/`es` (parity enforced): `dashboard.stats.*`, `history.*`
(title, filters, load more, empty, detail labels, PR marker), `celebration.*` (xp gained, level up,
badge unlocked). Achievement names/descriptions come from the bilingual seeded catalog.

## 11. Testing

- **Unit:** level/XP math; `epley1rm` + `selectPrSet`; `computeStreak` (hit/neutral/missed,
  automatic freeze, 48h window, per-date dedupe, boundary dates); `weekStart`/`weeksGoalMet`;
  achievement `evaluateAchievements`; DTO mapping.
- **Integration (real Postgres):** completion updates `UserStats`/`XpEvent`/`UserAchievement`
  correctly; a replayed completion adds nothing; PR marking (one per exercise, first-ever counts);
  weekly-goal XP awarded once per week; the repair job fixes injected drift; history pagination +
  filters + ownership 404; `GET /api/stats` shape; job endpoint rejects a bad secret; seed is
  idempotent.
- **Component (RTL):** dashboard stats header; history list/detail; celebration modal;
  `useNewAchievements`.
- **E2E (Playwright):** finish a workout → dashboard shows streak 1 and XP; history lists the
  session and opens its detail.
- **Gates:** lint, typecheck, unit, integration, coverage, build, e2e.

## 12. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Streak drift across timezones/DST | Pure lib over local date strings + nightly repair |
| 2 | Duplicate XP on replay | Unique `[userId, reason, refType, refId]` + idempotent ensure |
| 3 | PR instability if history changes | Sessions immutable; `isPr` set once at completion |
| 4 | Recompute cost over many sessions | Index `[userId, status, completedAt]`; per-user bounded; job batches |
| 5 | Offline finish can't celebrate badges | Completion response online; `unlockedAt`-based modal catches synced unlocks |
| 6 | Freeze balance ambiguity | Deterministic from `User.createdAt`, capped at 3 |
| 7 | Weekly-goal boundary (weekStartsOn) | Pure `weekStart`; stored on the week-start date |

## 13. Acceptance criteria

- Completing a session updates streak/XP/level and can unlock badges; the dashboard reflects it.
- The streak follows §8.3, including neutral rest days and automatic freezes within the 48h window.
- History lists completed sessions (paginated, filterable) and shows a read-only detail with PR markers.
- The nightly repair endpoint/CLI recomputes stats, fixes drift, and rejects unauthorized callers.
- All gates green: lint, typecheck, unit, integration, coverage, build, e2e.
- All copy localized; ≥44px targets; no hardcoded strings.

## 14. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §8.3 streak rules (timezone, hit days, neutral, freeze, recompute) | §3, §4, §5 |
| §15 gamification (XP/levels, badges, weekly goal, celebrations) | §3–§6, §9 |
| §8.2 `UserStats`/`XpEvent`/`Achievement`/`UserAchievement` | §3 |
| §10 API envelope, cursor pagination | §8 |
| §12 mobile-first, 44px, a11y | §9 |
| §13 EN/ES dictionaries | §10 |
| §19 testing (unit/integration/e2e) | §11 |
| §21 Phase 3 (streak/XP/badges; dashboard charts/heatmap/PRs) | §13 (charts/heatmap/PR views = 3B) |
| §20 risk 10 (streak timezone) | §12 |
| Phase 3B charts/heatmap/PR views/body metrics | non-goal |
