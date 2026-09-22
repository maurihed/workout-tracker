export type StepId =
  | "goal"
  | "experience"
  | "equipment"
  | "schedule"
  | "preferences"
  | "metrics"
  | "template"

export const ONBOARDING_STEPS: { id: StepId; required: boolean }[] = [
  { id: "goal", required: true },
  { id: "experience", required: true },
  { id: "equipment", required: true },
  { id: "schedule", required: true },
  { id: "preferences", required: true },
  { id: "metrics", required: false },
  { id: "template", required: true },
]

export type StepProfile = {
  goal: string | null
  experience: string | null
  location: string | null
  // Readonly so literal profiles (e.g. `as const` fixtures) remain assignable.
  equipment: readonly string[]
  daysPerWeek: number | null
  unitSystem: string | null
  timezone: string | null
}

// Mirrors the database defaults, so a fresh/resumable profile behaves the same
// whether or not a row has been written yet.
export const EMPTY_ONBOARDING_PROFILE: StepProfile = {
  goal: null,
  experience: null,
  location: null,
  equipment: [],
  daysPerWeek: null,
  unitSystem: "metric",
  timezone: "UTC",
}

export function isStepComplete(id: StepId, p: StepProfile): boolean {
  switch (id) {
    case "goal":
      return p.goal != null
    case "experience":
      return p.experience != null
    case "equipment":
      return p.location != null && p.equipment.length > 0
    case "schedule":
      return p.daysPerWeek != null
    case "preferences":
      return p.unitSystem != null && p.timezone != null
    case "metrics":
      return true // optional
    case "template":
      return false // completed by creating a routine
  }
}

export function firstIncompleteStep(p: StepProfile): StepId {
  const required = ONBOARDING_STEPS.filter(
    (s) => s.required && s.id !== "template",
  )
  return required.find((s) => !isStepComplete(s.id, p))?.id ?? "template"
}
