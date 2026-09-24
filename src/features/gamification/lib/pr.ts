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
