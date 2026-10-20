import { EQUIPMENT } from "@/features/exercises/schemas/exercise"
import type { AiJobInput, GymProfile } from "@/features/ai/lib/contract"

const BODY_ONLY = "body only" as const

const BASIC_GYM_EQUIPMENT = [
  BODY_ONLY,
  "barbell",
  "dumbbell",
  "kettlebells",
  "bands",
  "medicine ball",
  "exercise ball",
  "foam roll",
] as const

const INTERMEDIATE_GYM_EQUIPMENT = [
  ...BASIC_GYM_EQUIPMENT,
  "cable",
  "machine",
  "e-z curl bar",
] as const

const FULLY_EQUIPPED_GYM_EQUIPMENT = [...EQUIPMENT] as const

const GYM_EQUIPMENT: Record<GymProfile, ReadonlySet<string>> = {
  basic: new Set(BASIC_GYM_EQUIPMENT),
  intermediate: new Set(INTERMEDIATE_GYM_EQUIPMENT),
  fully_equipped: new Set(FULLY_EQUIPPED_GYM_EQUIPMENT),
}

export const GYM_PROFILE_DESCRIPTIONS: Record<GymProfile, string> = {
  basic:
    "Basic gym: barbells, dumbbells, kettlebells, benches, racks, bands and bodyweight. Cable stations and selectorized machines may be unavailable.",
  intermediate:
    "Intermediate gym: everything needed for standard exercise variations, including cables, standard machines, EZ bars and benches.",
  fully_equipped:
    "Fully equipped gym: everything in an intermediate gym plus specialty bars, plate-loaded and specialty machines, and accessories such as a GHD, reverse hyper, safety squat bar or sled.",
}

export function allowedEquipmentForGymProfile(
  profile: GymProfile,
): ReadonlySet<string> {
  return GYM_EQUIPMENT[profile]
}

export function allowedEquipmentForInput(
  input: Pick<AiJobInput, "location" | "equipment" | "gymProfile">,
): ReadonlySet<string> {
  if (input.location === "gym")
    return allowedEquipmentForGymProfile(input.gymProfile)
  return new Set([BODY_ONLY, ...input.equipment])
}

export function equipmentForInput(input: AiJobInput): string[] {
  return [...allowedEquipmentForInput(input)]
}

export function isEquipmentAllowed(
  allowed: ReadonlySet<string>,
  equipment: string | null,
): boolean {
  return equipment == null || allowed.has(equipment)
}

export function filterCatalogEntriesForInput<
  T extends { equipment: string | null },
>(
  entries: readonly T[],
  input: Pick<AiJobInput, "location" | "equipment" | "gymProfile">,
): T[] {
  const allowed = allowedEquipmentForInput(input)
  return entries.filter((entry) => isEquipmentAllowed(allowed, entry.equipment))
}
