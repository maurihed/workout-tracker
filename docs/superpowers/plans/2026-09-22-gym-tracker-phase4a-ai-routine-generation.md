# Phase 4A — AI Routine Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a user request an LLM-generated routine, validated against a strict schema, resolved to the catalog (custom fallback), previewed, and saved — as an async pg-boss job with polling, timeout, retries, quota, cancel, provenance, and a deterministic fallback + safety disclaimer.

**Architecture:** Pure pipeline logic in `src/features/ai/lib`; a provider adapter (OpenAI-compatible / Ollama) behind an interface; `ai.service` owns the `AiJob` lifecycle on **pg-boss**; `app/api/ai/*` Route Handlers feed axios + TanStack Query; a separate worker process (`pnpm worker:ai`) runs jobs.

**Tech Stack:** Next.js 16 · TypeScript strict · Prisma 7/Postgres · pg-boss · Zod · TanStack Query · Vitest + RTL + MSW · Playwright.

**Spec:** `docs/superpowers/specs/2026-09-22-gym-tracker-phase4a-ai-routine-generation-design.md`

## Global Constraints

- Thin Route Handler → service → repository; `server-only`; `userId`-scoped; `{data}`/`{error}`; one Zod schema per input.
- Prisma 7 (`@/lib/prisma`, types from `@/generated/prisma/client`, `prisma7.config.ts`); migrations via `prisma migrate dev`, else `migrate diff` + `pnpm db:deploy`.
- Provider-agnostic: OpenAI-compatible `/v1/chat/completions` with `response_format` JSON schema; Ollama via `format`; env `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`/`AI_TIMEOUT_MS`; unset ⇒ fallback.
- Feature never hard-fails: invalid/unavailable/timeout ⇒ deterministic template fallback.
- Safety disclaimer + explicit confirm; provenance (`AiJob` + `Routine.aiJobId`).
- i18n EN/ES parity; no hardcoded copy; mobile-first ≥44px; strict TS extras; no comments.
- Commands: `pnpm lint` · `typecheck` · `test` · `test:integration` · `test:coverage` · `build` · `e2e`; Docker db + `pnpm db:seed`.

## Review Focus

1. **Never hard-fails** — provider unset/timeout/invalid JSON after retries yields a valid template routine, not an error.
2. **Strict contract** — malformed model output is rejected by Zod (extra/missing fields, out-of-range), triggering a repair retry then fallback.
3. **Idempotency** — `accept` creates exactly one routine per job; job cancel/finish races don't double-run.
4. **Resolution** — `sourceId` → name → fuzzy → custom; unmatched never crashes and is marked custom.
5. **Quota/limits** — over-quota returns 429; a job never exceeds the retry/timeout bound.

---

### Task 1: AiJob model + Routine.aiJobId + migration

**Files:** Modify `prisma/schema.prisma`; create migration.

- [ ] **Step 1:** Add `enum AiJobStatus` (queued/running/succeeded/failed/cancelled), `model AiJob` (fields per spec §3, `input Json`, `result Json?`, `model?`, `promptVersion?`, `error?`, `attempts`, timestamps; indexes `[userId, createdAt]`, `[status]`), `User.aiJobs AiJob[]`, and `Routine.aiJobId String?`.
- [ ] **Step 2:** `pnpm exec prisma migrate dev --name add_ai_job` (else diff + `pnpm db:deploy`); `pnpm db:generate`; `pnpm typecheck`; `pnpm exec prisma migrate status`.
- [ ] **Step 3:** Commit `feat(db): add ai job model and routine provenance`.

**Interfaces:** `AiJob`, `AiJobStatus`.

---

### Task 2: pg-boss queue + worker bootstrap

**Files:** `pnpm add pg-boss`; create `src/server/ai/queue.ts`, `scripts/worker-ai.ts`; modify `package.json`, `.env.example`.

**Interfaces:**
- `getBoss(): Promise<PgBoss>` (lazy singleton, `connectionString: process.env.DATABASE_URL`).
- `AI_QUEUE = "ai-routine"`; `enqueueAiJob(jobId)`; `startAiWorker(handler)`.

- [ ] **Step 1:** Add `pg-boss`. `queue.ts` lazily constructs `new PgBoss({ connectionString: DATABASE_URL, schema: "pgboss" })`, `start()`s it, and caches the promise. Export `enqueueAiJob(jobId)` (creates the queue if needed, `send(AI_QUEUE, { jobId })`) and `startAiWorker(handler)` (`boss.work(AI_QUEUE, async ([job]) => handler(job.data.jobId))`).
- [ ] **Step 2:** `scripts/worker-ai.ts` — `dotenv/config`, `startAiWorker(runJob)` from `ai.service`, log start/stop, handle SIGINT. `package.json` adds `"worker:ai": "tsx scripts/worker-ai.ts"`.
- [ ] **Step 3:** `.env.example` adds `AI_BASE_URL=`, `AI_API_KEY=`, `AI_MODEL=`, `AI_TIMEOUT_MS=`.
- [ ] **Step 4:** `pnpm typecheck`; commit `feat(ai): pg-boss queue and worker bootstrap`.

**Notes:** pg-boss creates its own schema; document `pgboss` in the deploy notes. The Next app only *enqueues*; the worker is a separate process.

---

### Task 3: Prompt builder

**Files:** Create `src/features/ai/lib/prompt.ts`; test `tests/unit/ai-prompt.test.ts`.

**Interfaces:** `PROMPT_VERSION = "1"`; `buildPrompt(input: AiJobInput, catalog: { sourceId: string; name: string; primaryMuscles: string[] }[]): string`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest"
import { PROMPT_VERSION, buildPrompt } from "@/features/ai/lib/prompt"
it("pins the JSON contract, forbids prose, and lists catalog ids", () => {
  const prompt = buildPrompt(
    { goal: "build_muscle", experience: "beginner", equipment: ["barbell"], daysPerWeek: 3, focus: null },
    [{ sourceId: "Barbell_Squat", name: "Barbell Squat", primaryMuscles: ["quadriceps"] }],
  )
  expect(PROMPT_VERSION).toBe("1")
  expect(prompt).toMatch(/JSON only/i)
  expect(prompt).toContain("Barbell_Squat")
  expect(prompt).toMatch(/build_muscle/)
  expect(prompt).toMatch(/3/)
})
```

- [ ] **Step 2:** RED. **Step 3:** Implement (include the schema summary, allowed `sourceId`s, and explicit "JSON only, no prose", temperature guidance).
- [ ] **Step 4:** GREEN; commit `feat(ai): prompt builder`.

---

### Task 4: Generation contract (Zod) + normalize

**Files:** Create `src/features/ai/lib/contract.ts`; test `tests/unit/ai-contract.test.ts`.

**Interfaces:**
- `generatedRoutineSchema` (spec §4), `GeneratedRoutine` type, `aiJobInputSchema`, `AiJobInput`.
- `normalizeGeneratedRoutine(value): GeneratedRoutine` (trim names, drop empty days, de-dupe exercises).
- `contractJsonSchema` (the JSON schema passed to the provider's `response_format`).

- [ ] **Step 1: Failing test** — valid payload parses; missing `days`, empty `days`, `sets: 0`, `reps` non-string, timeout timer without `workSeconds`, and unknown extra keys are rejected; `normalizeGeneratedRoutine` trims and drops empty days.
- [ ] **Step 2:** RED. **Step 3:** Implement with `z.object(...).strict()`; `timerType` refine requiring `workSeconds` for interval/emom/amrap; derive `contractJsonSchema` (hand-written or via a zod→json-schema util) for `response_format`.
- [ ] **Step 4:** GREEN; commit `feat(ai): generation contract and normalization`.

---

### Task 5: Provider adapter

**Files:** Create `src/features/ai/lib/provider.ts`; test `tests/unit/ai-provider.test.ts` (MSW).

**Interfaces:** `AiUnavailableError`; `type AiProvider = { generateJson(prompt: string, schema: unknown): Promise<unknown> }`; `getProvider(): AiProvider` (from env); `createOpenAiProvider(config)`, `createOllamaProvider(config)`.

- [ ] **Step 1: Failing test (MSW)** — OpenAI provider POSTs `/v1/chat/completions` with `model`, `response_format.type === "json_schema"`, and parses `choices[0].message.content` JSON; a 500/timeout throws; no env ⇒ `getProvider()` throws `AiUnavailableError`.
- [ ] **Step 2:** RED. **Step 3:** Implement with `fetch` + `AbortController` timeout; Ollama provider hits `/api/chat` with `format: schema`, `options: { temperature: 0 }`, and `message.content`. Strip a fenced ```json block if present, then `JSON.parse`.
- [ ] **Step 4:** GREEN; commit `feat(ai): provider adapter`.

---

### Task 6: Exercise resolution

**Files:** Create `src/features/ai/lib/resolve-exercises.ts`; test `tests/unit/ai-resolve-exercises.test.ts`.

**Interfaces:** `type ResolvedExercise = { exerciseId: string | null; customName: string | null; sets; reps; restSeconds; targetWeightKg; timerType; workSeconds; rounds }`; `resolveExercises(generated: GeneratedRoutine, catalog: CatalogIndex): { days: ResolvedDay[]; customNames: string[] }` where `CatalogIndex = { bySourceId: Map; byName: Map; all: {sourceId; name}[] }`.

- [ ] **Step 1: Failing test** — matches by `sourceId`; then by exact (case/space-insensitive) name; then fuzzy token overlap (≥1 shared meaningful token) → catalog; unmatched → `customName` set, `exerciseId: null`; custom names listed.
- [ ] **Step 2:** RED. **Step 3:** Implement pure resolution (no DB); the service supplies the catalog index.
- [ ] **Step 4:** GREEN; commit `feat(ai): exercise resolution with custom fallback`.

---

### Task 7: Deterministic template fallback

**Files:** Create `src/features/ai/lib/template-fallback.ts`; test `tests/unit/ai-template-fallback.test.ts`.

**Interfaces:** `buildFallbackRoutine(input: AiJobInput, catalog: CatalogIndex): GeneratedRoutine`.

- [ ] **Step 1: Failing test** — produces a valid `generatedRoutineSchema` routine with `daysPerWeek` days, ≥1 exercise each, naming real catalog entries from the index; deterministic for the same input.
- [ ] **Step 2:** RED. **Step 3:** Implement by selecting catalog exercises by goal/experience/equipment/muscle groups (reuse `src/features/onboarding/lib/recommend-templates` logic where practical), splitting into days.
- [ ] **Step 4:** GREEN; commit `feat(ai): deterministic template fallback`.

---

### Task 8: AI repository + service (job lifecycle + accept)

**Files:** Create `src/server/repositories/ai.repository.ts`, `src/server/services/ai.service.ts`; test `tests/integration/ai-service.test.ts`.

**Interfaces:**
- Repo: `createJob`, `findJob(userId, id)`, `listJobs(userId)`, `markRunning(id)`, `markSucceeded(id, result, model, promptVersion)`, `markFailed(id, error)`, `markCancelled(id)`, `countRecentJobs(userId, since)`, `createRoutineFromJob(...)`.
- Service: `createJob(userId, input)` (validates, quota via the Postgres limiter + `countRecentJobs`, inserts `queued`, enqueues), `getJob`, `listJobs`, `cancelJob`, `runJob(jobId)` (the worker body), `acceptJob(userId, jobId)` (idempotent: returns existing routine if `Routine.aiJobId` already set).

- [ ] **Step 1: Failing integration test** (fake provider injected) — createJob queues; runJob with a valid fake → `succeeded` + result; invalid fake → retries then template fallback `succeeded`; unavailable → template fallback; `cancel` on a queued job → `cancelled` and no run; `acceptJob` creates a `Routine` with `source: "ai"`/`aiJobId` and is idempotent; ownership 404; quota → error.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Implement. `runJob`: load job; if not `queued` return; `markRunning`; load profile + a compact catalog index; build prompt; `provider.generateJson` with timeout; parse+validate; on failure retry ≤3 (repair prompt appending the error) then fall back to `buildFallbackRoutine`; `resolveExercises`; store result `{ routine, customNames, source: "ai"|"template" }`; `markSucceeded`. Catch-all → `markFailed`. Provider injection point: `runJob(jobId, provider = getProvider())` for tests.
- [ ] **Step 4:** GREEN; commit `feat(ai): job lifecycle service and accept`.

---

### Task 9: AI APIs + hooks

**Files:** Create `src/app/api/ai/routines/route.ts`, `[id]/route.ts`, `[id]/cancel/route.ts`, `[id]/accept/route.ts`, `src/features/ai/schemas/job.ts`, `src/features/ai/hooks/{query-keys,use-ai-jobs,use-create-ai-job,use-cancel-ai-job,use-accept-ai-job}.ts`; tests `tests/unit/ai-routes.test.ts`.

- [ ] **Step 1: Failing route tests** — 401; `POST` 202/400/429; `GET [id]` 200/404; `cancel`/`accept` 200/201.
- [ ] **Step 2:** RED. **Step 3:** Implement thin handlers + DTOs + hooks (poll `GET [id]` with `refetchInterval` while queued/running).
- [ ] **Step 4:** GREEN; commit `feat(ai): job APIs and hooks`.

---

### Task 10: i18n copy

**Files:** Modify `src/i18n/messages/{en,es}.json`; test `tests/unit/ai-messages.test.ts`.

- [ ] **Step 1:** Add `ai.*` keys (title, form.{goal,experience,equipment,daysPerWeek,focus}, status.{queued,running,succeeded,failed,cancelled}, preview.{accept,regenerate,discard,customNote,provenance,template}, disclaimer, errors) in both locales + a presence/parity test.
- [ ] **Step 2:** Run i18n tests; commit `feat(i18n): ai routine generation copy (en/es)`.

---

### Task 11: Generate + preview UI

**Files:** Create `src/app/[locale]/(app)/routines/generate/page.tsx`, `src/features/ai/components/{generate-form,job-progress,routine-preview-card,disclaimer}.tsx`; modify the routines page with a CTA; tests `tests/unit/generate-form.test.tsx`, `tests/unit/ai-preview.test.tsx`.

- [ ] **Step 1: Failing tests** — the form validates goal/experience/equipment/days and submits; progress renders each job state; the preview renders days/exercises, marks custom exercises, shows the disclaimer, and accept calls the mutation.
- [ ] **Step 2:** RED. **Step 3:** Implement the form (react-hook-form + `aiJobInputSchema`), polling (`useAiJobs`), the preview (accept/regenerate/discard), and a persistent `Disclaimer`. On accept, route to the created routine.
- [ ] **Step 4:** GREEN; `pnpm typecheck`, `pnpm lint`; commit `feat(ai): generation form and preview`.

---

### Task 12: E2E, gates, roadmap

**Files:** Create `tests/e2e/ai-generation.spec.ts`; modify `docs/ROADMAP.md`.

- [ ] **Step 1:** E2E with a **mocked provider** (set `AI_BASE_URL` to a local mock route or inject via an env-gated fake in the worker): request → polling → preview → accept → the routine appears with provenance. If the worker can't run in CI, gate the spec on a `WORKER` env like the offline spec gated on the SW.
- [ ] **Step 2:** Run all gates (`lint`, `typecheck`, `test`, `test:integration`, `test:coverage`, `build`, `e2e`); fix legitimate issues without weakening tests.
- [ ] **Step 3:** Update the roadmap: add a 4A row (Done) with spec/plan/SDD paths; note 4B (personalization) next.
- [ ] **Step 4:** Commit `test(e2e): ai generation; docs: mark 4a complete`.

---

## Self-Review

- Spec §3→T1; §4→T3–T8; §5→T9; §6→T11; §7→T10; §8→all + T12; §2→T2/T5. No gaps.
- No placeholders; pure pipeline parts (prompt/contract/provider/resolve/fallback) carry concrete code/tests; service/API/UI carry test + wiring.
- Types: `AiJobInput`/`GeneratedRoutine` (T4) consumed by T7/T8/T11; `CatalogIndex` (T6) supplied by T8.
- Review Focus: never-fails T7/T8; strict contract T4; idempotency T8; resolution T6; quota/limits T8.

**Deployment note:** pg-boss adds a `pgboss` schema; run the worker (`pnpm worker:ai`) as a separate Coolify process. `AI_*` unset ⇒ generation always uses the template fallback (feature still works).
