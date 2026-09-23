# Gym Tracker — Phase 2C PWA / Offline — Design Spec

- **Date:** 2026-09-22
- **Status:** Proposed
- **Author:** Mauricio Hernandez (with opencode)
- **Parent spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-design.md` (binding)
- **Depends on:** Phases 1, 1.5, 2A, 2B (merged to `main`; tip `7f665df`)

## 1. Objective

Make the app an **installable PWA** and let a user **run a routine end-to-end with zero
connectivity** — start, log every set, use rest/interval timers, and finish — with all
writes queued locally and synced **idempotently** on reconnect. This completes the parent
spec's Phase 2 acceptance criterion ("run it end-to-end offline").

### Success criteria

- The app is installable ("Add to Home Screen") with a web manifest and precached shell.
- With no connectivity, a user can cold-open the app, start a workout from their active
  routine, log sets, use timers, and finish — a workout that later syncs without loss or
  duplication.
- The cached exercise catalog and the active routine's media are available offline.
- Rest/interval timers use **wall-clock deadlines**, so returning from lock/background
  shows the correct remaining time; a best-effort notification fires at zero where allowed.
- Reloading or losing connectivity mid-workout never loses logged sets.
- All copy is localized (EN/ES); touch targets ≥ 44px; no hardcoded strings.

### Non-goals (out of scope for 2C)

- Append-only **op-log / event-sourcing** sync (we use full-state idempotent upsert).
- Multi-device **merge UI** or fine-grained conflict resolution (local wins; see §7).
- **Web Push** scheduling (reliable lock-screen delivery while the app is killed).
- Streaks/XP/badges/dashboard/history/PRs (Phase 3).
- AI routines (Phase 4).
- A custom install banner beyond a lightweight, dismissible hint.

## 2. Scope

| Area | In 2C |
|---|---|
| Serwist service worker (app-shell precache, runtime caching) | Yes |
| Web app manifest + icons + installability | Yes |
| Offline exercise catalog + active-routine media | Yes |
| Client-generated session/exercise/set UUIDs | Yes |
| Idempotent `PUT` upsert + idempotent complete/abandon | Yes |
| IndexedDB outbox + Background Sync / `online` flush | Yes |
| Locally persisted active session (survives reload/cold offline) | Yes |
| Wall-clock timers + persist deadline + best-effort notification | Yes |
| Offline/sync status indicator | Yes |
| Op-log sync, Web Push, multi-device merge, Phase 3/4 | No |

## 3. Service worker integration (Serwist configurator mode)

Next.js 16 builds with **Turbopack** by default, which `@serwist/next`'s webpack plugin
does not support. We use Serwist's **configurator mode**, an external build step that is
bundler-agnostic and keeps Turbopack for the app.

- Deps: `serwist`, `@serwist/next` (config + worker exports), `@serwist/cli`, `esbuild`,
  `idb`.
- `serwist.config.js` with `swSrc: "app/sw.ts"`, `swDest: "public/sw.js"`, and
  `additionalPrecacheEntries` for the offline page, manifest, and icons.
- Build script: `"build": "next build && serwist build"`; `.gitignore` adds `public/sw*`.
- `app/sw.ts` creates `new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting,
  clientsClaim, navigationPreload, runtimeCaching, fallbacks })` and `addEventListeners()`.
- `SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}` is
  mounted in the root `[locale]/layout.tsx`. The SW is production-only (dev stays uncached).

## 4. Data model & IDs

No destructive schema migration. `WorkoutSession`/`SessionExercise`/`SetLog` `id` remain
`String @id`; we begin **accepting client-generated UUIDs** (`crypto.randomUUID()`).
Existing cuid rows are unaffected (ids are opaque). The server still writes `snapshot` as
JSON and enforces the one-in-progress-session rule.

- **Snapshot at start, built on the client.** A shared pure `buildSessionSnapshot(day)`
  (extracted from `session.repository.ts:120`) runs in both the client (offline start) and
  the server (validation). The client DTO from `GET /api/routines/active` already carries
  every prescription field and exercise media the snapshot needs.
- **Client-generated IDs** for the session, each `SessionExercise`, and each `SetLog`, so a
  locally-created session can be replayed idempotently.
- **Stable set IDs.** `replaceSets` upserts sets by id and deletes only sets absent from the
  payload, instead of delete-all + recreate, so replay does not churn row identities.

## 5. API changes

Conventions unchanged: thin handler → service → repository; `{ data }` / `{ error: { code,
message, details? } }`; `auth()`-scoped by `userId`; `select`ed DTOs; ISO datetimes.

| Route | Change |
|---|---|
| `POST /api/sessions` | **Retired.** Start is client-side and syncs through the upsert. |
| `PUT /api/sessions/{id}` | Becomes **create-or-replace upsert** keyed by a client UUID. If absent: validate `routineDayId` ownership (and `exerciseId`s), require ≥1 exercise, abandon any other in-progress session, then create. If present and `in_progress` and owned: replace state. Replaying the same body is a no-op. |
| `POST /api/sessions/{id}/complete` | **Idempotent** — `200` if already `completed`. |
| `POST /api/sessions/{id}/abandon` | **Idempotent** — `200` if already `abandoned`. |
| `GET /api/sessions/active` | Unchanged (online hydration source). |
| `GET /api/routines/active`, `/api/exercises*`, `/api/profile`, `/api/me` | Unchanged; now also cached by the SW. |

### 5.1 Schemas (shared Zod)

- Exercise/set `id` becomes a **required UUID**.
- `sessionUpsertSchema = { id: uuid, routineDayId: string, name: string, startedAt: ISO,
  activeSeconds: int ≥ 0, snapshot: json, exercises: sessionExerciseInput[] }`.
- `snapshot` is shape-validated (routine/day identity + exercise entries). The server
  persists the **client's start-time snapshot** (honoring "snapshot written at start" even
  if the routine changed while offline), after checking `routineDayId` ownership and that
  every referenced `exerciseId` exists.
- Reuse the existing set/exercise validators for `sets[]`.

### 5.2 Service behavior

- `upsertSession(userId, id, input)` — one transaction: load/create scoped to `userId`; on
  create, abandon any other in-progress session for the user; on replace, require
  `in_progress`; upsert exercises/sets by id; update header (`activeSeconds`).
- `completeSession` / `abandonSession` — return the current state when already terminal
  (idempotent); a replay preserves the server's original `completedAt`/status (server
  timestamp wins). Log `session.completed`, `session.abandoned`, `session.synced`,
  `session.conflict-resolved` (pino).

## 6. Offline engine

### 6.1 IndexedDB (`idb`)

DB `gym-offline` v1:

| Store | Key | Value |
|---|---|---|
| `outbox` | `sessionId` | `{ sessionId, op: "upsert"\|"complete"\|"abandon", payload, updatedAt, status: "pending"\|"syncing"\|"error", lastError? }` |
| `activeSession` | fixed `"active"` | `{ session, timer, paused, updatedAt }` |

One coalesced outbox row per session; `activeSession` makes a reload / cold offline open
resume the exact runner state.

### 6.2 Sync engine (`src/lib/offline/sync.ts`)

- `enqueue(op)` merges into the outbox row (newer `upsert` supersedes; `complete`/`abandon`
  supersede and retain the payload for the final header push).
- `flush()` is **serialized** (one in flight); iterates oldest-first, `fetch(..., {
  credentials: "same-origin" })`. 2xx clears the row; retryable errors (network/5xx) stop
  and retry later; non-retryable 4xx marks `status: "error"` and surfaces a retry action.
  Idempotent APIs make replay safe.
- Triggers: `online`, `visibilitychange`→visible, window focus, mount, and the runner's
  debounced edit (~2s). Registers Background Sync tag `gym-session-sync` where supported;
  the SW `sync` handler replays the outbox directly. On Safari (no Background Sync), the
  page-level `online`/focus flush is the fallback.
- `useOnline()` and `useSyncStatus()` expose online state, pending count, and last-synced-at.

### 6.3 Start flow & runner integration

- `useStartSession` becomes client-side: read the cached active routine, build the session
  via `buildSessionSnapshot(day)`, generate UUIDs, hydrate the session store, persist
  `activeSession`, enqueue `upsert`, then route to the runner. The day-chooser UI is
  unchanged.
- Edits persist `activeSession` + enqueue `upsert`, then debounce `flush()` — replacing the
  current in-memory backoff loop (`workout-runner.tsx:295`) with the durable queue.
- `finish` → enqueue `complete`, clear `activeSession`; `discard` → enqueue `abandon`, clear.
- On mount: when online, `GET /api/sessions/active` is authoritative unless local state has
  **unsynced** edits (then local wins and is pushed); when offline, load `activeSession`.

## 7. Conflict resolution

The local offline session **wins**. On upsert the server abandons any *other* in-progress
session for the user, logs `session.conflict-resolved`, and the client surfaces a sync note.
(Per accepted design: single-device-first, predictable.)

## 8. Timers (wall-clock)

Refactor `features/workouts/lib/timer.ts` to be pure with an injected `now`:

- `TimerState` gains `deadline: number | null` (epoch ms; `null` when paused/idle).
- `startRest(seconds, now)` / `startInterval(..., now)` set the deadline.
- `tick(state, now)` derives `remaining` from the deadline and carries the **overshoot** into
  the next work/rest round, so drift never accumulates.
- `pause`/`resume`/`adjust`(±15s)/`skipRound` take `now` and set/clear the deadline.
- The runner ticks every 1s **and immediately on visibility→visible**, so a locked or
  backgrounded app always shows the correct remaining time on return.
- `timer` + `paused` persist in `activeSession`, so a reload resumes the countdown.
- **Best-effort alert:** on a running phase, schedule a notification for the deadline; if
  permission is granted, `registration.showNotification(...)` + vibration + beep at zero. If
  the OS froze the timer, resuming detects the elapsed phase and alerts immediately.
  Permission is a contextual opt-in toggle beside the existing sound toggle — no automatic
  prompt. Reliable delivery while the app is fully killed is explicitly **not** promised.

## 9. Caching & prefetch

On top of Serwist's `defaultCache` (GET-only):

| Request | Strategy | Cache | Bounds |
|---|---|---|---|
| `GET /api/exercises*` | StaleWhileRevalidate | `api-catalog-v1` | ~50 entries, 7d |
| `GET /api/sessions/active`, `/api/routines/active`, `/api/profile`, `/api/me` | NetworkFirst (3s timeout) | `api-data-v1` | ~20 entries, 24h |
| Exercise images (self-hosted base + `raw.githubusercontent.com`) | CacheFirst + expiration | `images-v1` | ~300 entries, 30d, opaque OK |
| Document navigations | NetworkFirst → `/offline` fallback | precache | — |

`useOfflinePrefetch()` (idle-time, online) warms the catalog GET and pre-caches the active
routine's exercise images.

## 10. Manifest, install & offline UX

- `src/app/manifest.ts` (`MetadataRoute.Manifest`): name/short_name, `start_url: "/"`,
  `display: "standalone"`, `orientation: "portrait"`, theme/background colors, 192/512 +
  maskable icons. Icons generated into `public/icons/`.
- Root metadata gains `applicationName`, `appleWebApp` (`capable`, `statusBarStyle`,
  `title`), `formatDetection: { telephone: false }`, and `viewport.themeColor` (light/dark).
- Offline fallback: unlocalized public `src/app/offline/page.tsx`, special-cased in
  `src/proxy.ts` to bypass intl/auth and added to the public-path allowlist; SW document
  fallback points to `/offline`.
- **Sync indicator** in the app shell (`Offline` / `Syncing (n)` / `Synced`) plus a pending
  badge in the runner status row, backed by `useSyncStatus`.
- CSP: add `manifest-src 'self'`; the existing `img-src` already allows the media origin.

## 11. i18n

New namespaces in both `en`/`es` (identical key sets; the parity test enforces):
`offline.*` (status labels, retry, install hint, offline-page copy) and additions to
`timers.*` (notification toggle + copy). No hardcoded user-facing copy.

## 12. Testing

- **Unit:** wall-clock timer reducer (drift, overshoot, pause/resume, ±15s across phases);
  outbox coalescing; flush ordering + retry classification; `buildSessionSnapshot`;
  persistence ser/de; UUID schemas; i18n parity.
- **Integration (real Postgres):** `PUT` upsert creates with client IDs + client snapshot;
  replay is idempotent; upsert abandons a conflicting in-progress session; `complete` /
  `abandon` idempotent; ownership 404; `exerciseId` validation.
- **Component (RTL):** sync-indicator states; start-offline builds the session from the
  cached routine; a rehydrated store renders logged sets.
- **E2E (Playwright, prod build with SW, Chromium):** `context.setOffline(true)` → cold-open
  `/[locale]/workout` → start → log sets → finish → `setOffline(false)` → assert the session
  is `completed` server-side; assert manifest link tags and SW registration.
- **Gates:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`,
  `pnpm test:coverage`, `pnpm build` (now includes `serwist build`), `pnpm e2e`.

## 13. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Serwist configurator quirks under Next 16.3 | Pin versions; e2e smoke asserts precache/fallback/registration |
| 2 | SW serving stale user/catalog data | NetworkFirst for user data; SWR only for catalog; versioned caches |
| 3 | Trusting the client snapshot | Zod-validate; verify `routineDayId` ownership + `exerciseId`s exist |
| 4 | Duplicate/replayed writes | Client UUIDs + idempotent upsert/complete/abandon; serialized flush |
| 5 | Conflicting in-progress sessions | Local wins; server abandons the other (logged + surfaced) |
| 6 | OS freezes background timers | Wall-clock deadline + resume reconciliation; notifications best-effort |
| 7 | IndexedDB growth (images/outbox) | Expiration caps; outbox cleared on successful sync |
| 8 | 2B tests coupled to `POST` start / server IDs | Update to the client-ID flow; keep the DTO shape stable |

## 14. Acceptance criteria

- The app is installable; a web manifest and precached shell are served.
- With no connectivity, a user cold-opens the app, starts a workout, logs sets, uses timers,
  and finishes; on reconnect the session syncs with no loss or duplication.
- Catalog + active-routine media are available offline.
- Reload/connectivity loss never loses logged sets.
- Timers are wall-clock correct across lock/background; a best-effort notification fires at
  zero where permitted.
- A conflicting server session is abandoned and surfaced (local wins).
- All gates green: lint, typecheck, unit, integration, coverage, build, e2e.
- All copy localized; ≥44px targets; no hardcoded strings.

## 15. Traceability to parent spec

| Parent spec item | Covered by |
|---|---|
| §14 Serwist SW (app shell + catalog/media cache + background sync) | §3, §9 |
| §14 IndexedDB queue with client UUIDs; flush on reconnect / Background Sync | §6 |
| §14 active session persisted locally; works fully offline | §6, §8 |
| §14 idempotent upsert; server timestamp wins; append-only intent | §4, §5, §7 |
| §14 manifest / "Add to Home Screen"; offline indicator | §10 |
| §8.2 client-generated UUIDs for offline replay | §4 |
| §5.1 client-first data flow via `app/api/*` | §5, §6 |
| §21 Phase 2 "run it end-to-end offline" | §1, §14 |
| §19 testing (unit/integration/e2e) | §12 |
| §13 EN/ES dictionaries | §11 |
| §12 mobile-first, 44px, a11y | §1, §10 |
| §6 Offline `idb` + Service Worker | §3, §6 |
| Op-log/Web Push/multi-device merge; Phase 3/4 | non-goal |
