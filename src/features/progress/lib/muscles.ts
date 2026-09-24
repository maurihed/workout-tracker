export type RegionId =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves"
  | "traps"
  | "custom"

export const MUSCLE_REGIONS: { id: RegionId; name: string; nameEs: string }[] = [
  { id: "chest", name: "Chest", nameEs: "Pecho" },
  { id: "back", name: "Back", nameEs: "Espalda" },
  { id: "shoulders", name: "Shoulders", nameEs: "Hombros" },
  { id: "biceps", name: "Biceps", nameEs: "Bíceps" },
  { id: "triceps", name: "Triceps", nameEs: "Tríceps" },
  { id: "forearms", name: "Forearms", nameEs: "Antebrazos" },
  { id: "abs", name: "Abs", nameEs: "Abdominales" },
  { id: "glutes", name: "Glutes", nameEs: "Glúteos" },
  { id: "quads", name: "Quads", nameEs: "Cuádriceps" },
  { id: "hamstrings", name: "Hamstrings", nameEs: "Isquiotibiales" },
  { id: "calves", name: "Calves", nameEs: "Gemelos" },
  { id: "traps", name: "Traps", nameEs: "Trapecios" },
  { id: "custom", name: "Custom", nameEs: "Personalizado" },
]

export const MUSCLE_TO_REGION: Record<string, RegionId> = {
  chest: "chest",
  lats: "back",
  "middle back": "back",
  "lower back": "back",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  abdominals: "abs",
  quadriceps: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  traps: "traps",
  neck: "traps",
  adductors: "quads",
  abductors: "glutes",
}

export function creditMuscles(
  primaryMuscles: string[],
  secondaryMuscles: string[],
  volumeKg: number,
): Partial<Record<RegionId, number>> {
  const credits: Partial<Record<RegionId, number>> = {}
  for (const muscle of primaryMuscles) {
    const region = MUSCLE_TO_REGION[muscle] ?? "custom"
    credits[region] = (credits[region] ?? 0) + volumeKg
  }
  for (const muscle of secondaryMuscles) {
    const region = MUSCLE_TO_REGION[muscle] ?? "custom"
    credits[region] = (credits[region] ?? 0) + volumeKg * 0.5
  }
  if (Object.keys(credits).length === 0) credits.custom = volumeKg
  return credits
}

export function heatLevel(volumeKg: number, maxVolumeKg: number): number {
  if (maxVolumeKg <= 0) return 0
  return Math.min(1, Math.max(0, volumeKg / maxVolumeKg))
}
