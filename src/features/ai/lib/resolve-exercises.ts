import type { GeneratedRoutine } from "@/features/ai/lib/contract"

export type CatalogEntry = {
  id: string
  sourceId: string
  name: string
}

export type CatalogIndex = {
  bySourceId: Map<string, CatalogEntry>
  byName: Map<string, CatalogEntry>
  all: { sourceId: string; name: string }[]
}

export type ResolvedExercise = {
  exerciseId: string | null
  customName: string | null
  sets: number
  reps: string
  restSeconds: number
  targetWeightKg: number | null
  timerType: "none" | "interval" | "emom" | "amrap"
  workSeconds: number | null
  rounds: number | null
}

export type ResolvedDay = {
  weekday: number
  label: string | null
  exercises: ResolvedExercise[]
}

type GeneratedDay = GeneratedRoutine["days"][number]
type GeneratedExercise = GeneratedDay["exercises"][number]

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "with",
  "and",
  "to",
  "of",
  "for",
  "on",
  "in",
  "at",
  "by",
  "or",
])

export function normalizeCatalogKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function meaningfulTokens(value: string): string[] {
  return normalizeCatalogKey(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

function deriveNameFromSourceId(sourceId: string): string | null {
  const humanized = sourceId
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return humanized.length > 0 ? humanized : null
}

export function buildCatalogIndex(entries: readonly CatalogEntry[]): CatalogIndex {
  const bySourceId = new Map<string, CatalogEntry>()
  const byName = new Map<string, CatalogEntry>()
  const all: { sourceId: string; name: string }[] = []

  for (const entry of entries) {
    const sourceKey = normalizeCatalogKey(entry.sourceId)
    if (sourceKey.length > 0 && !bySourceId.has(sourceKey)) bySourceId.set(sourceKey, entry)

    const nameKey = normalizeCatalogKey(entry.name)
    if (nameKey.length > 0 && !byName.has(nameKey)) byName.set(nameKey, entry)

    all.push({ sourceId: entry.sourceId, name: entry.name })
  }

  return { bySourceId, byName, all }
}

function resolveCatalogEntry(
  catalog: CatalogIndex,
  item: { sourceId: string; name: string },
): CatalogEntry | null {
  return (
    catalog.bySourceId.get(normalizeCatalogKey(item.sourceId)) ??
    catalog.byName.get(normalizeCatalogKey(item.name)) ??
    null
  )
}

function fuzzyMatch(name: string, catalog: CatalogIndex): CatalogEntry | null {
  const queryTokens = new Set(meaningfulTokens(name))
  if (queryTokens.size === 0) return null

  let best: { entry: CatalogEntry; shared: number; index: number } | null = null

  for (let index = 0; index < catalog.all.length; index += 1) {
    const item = catalog.all[index]
    if (!item) continue

    const candidateTokens = meaningfulTokens(item.name)
    if (candidateTokens.length === 0) continue

    const seen = new Set<string>()
    let shared = 0
    for (const token of candidateTokens) {
      if (seen.has(token)) continue
      seen.add(token)
      if (queryTokens.has(token)) shared += 1
    }
    if (shared === 0) continue

    if (best === null || shared > best.shared || (shared === best.shared && index < best.index)) {
      const entry = resolveCatalogEntry(catalog, item)
      if (entry) best = { entry, shared, index }
    }
  }

  return best?.entry ?? null
}

function carryPrescription(exercise: GeneratedExercise) {
  return {
    sets: exercise.sets,
    reps: exercise.reps,
    restSeconds: exercise.restSeconds,
    targetWeightKg: exercise.targetWeightKg ?? null,
    timerType: exercise.timerType,
    workSeconds: exercise.workSeconds ?? null,
    rounds: exercise.rounds ?? null,
  }
}

function resolveOne(
  exercise: GeneratedExercise,
  catalog: CatalogIndex,
  customNames: string[],
  seenCustom: Set<string>,
): ResolvedExercise {
  const prescription = carryPrescription(exercise)
  const sourceId = exercise.sourceId?.trim()
  const name = exercise.name?.trim()

  if (sourceId) {
    const bySourceId = catalog.bySourceId.get(normalizeCatalogKey(sourceId))
    if (bySourceId) {
      return { exerciseId: bySourceId.id, customName: null, ...prescription }
    }
  }

  if (name) {
    const byName = catalog.byName.get(normalizeCatalogKey(name))
    if (byName) {
      return { exerciseId: byName.id, customName: null, ...prescription }
    }

    const fuzzy = fuzzyMatch(name, catalog)
    if (fuzzy) {
      return { exerciseId: fuzzy.id, customName: null, ...prescription }
    }
  }

  const customName = name && name.length > 0 ? name : sourceId ? deriveNameFromSourceId(sourceId) : null

  if (customName) {
    const key = normalizeCatalogKey(customName)
    if (key.length > 0 && !seenCustom.has(key)) {
      seenCustom.add(key)
      customNames.push(customName)
    }
  }

  return { exerciseId: null, customName, ...prescription }
}

export function resolveExercises(
  generated: GeneratedRoutine,
  catalog: CatalogIndex,
): { days: ResolvedDay[]; customNames: string[] } {
  const customNames: string[] = []
  const seenCustom = new Set<string>()

  const days = generated.days.map((day) => ({
    weekday: day.weekday,
    label: day.label ?? null,
    exercises: day.exercises.map((exercise) =>
      resolveOne(exercise, catalog, customNames, seenCustom),
    ),
  }))

  return { days, customNames }
}
