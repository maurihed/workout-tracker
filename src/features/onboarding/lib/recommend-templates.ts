import type { ExperienceLevel, Goal, Location } from "@/generated/prisma/client"
import type { RoutineTemplate } from "@/features/onboarding/templates/routine-templates"

export type RecommendProfile = {
  goal: Goal | null
  experience: ExperienceLevel | null
  location: Location | null
  daysPerWeek: number | null
  equipment: string[]
}

export type ScoredTemplate = { template: RoutineTemplate; score: number; recommended: boolean }

const LEVEL_ORDER: ExperienceLevel[] = ["beginner", "intermediate", "advanced"]

function scoreTemplate(profile: RecommendProfile, template: RoutineTemplate): number {
  let score = 0
  if (
    profile.location &&
    (template.location === profile.location ||
      template.location === "both" ||
      profile.location === "both")
  ) {
    score += 3
  }
  if (profile.daysPerWeek != null) {
    const diff = Math.abs(profile.daysPerWeek - template.daysPerWeek)
    if (diff === 0) score += 2
    else if (diff === 1) score += 1
  }
  if (profile.goal && profile.goal === template.goal) score += 2
  if (profile.experience) {
    const p = LEVEL_ORDER.indexOf(profile.experience)
    const t = LEVEL_ORDER.indexOf(template.level)
    if (p === t) score += 1
    else if (p === t + 1) score += 1
  }
  const needsOnlyBodyweight = template.equipment.every((e) => e === "body only")
  const equipmentCovered = template.equipment.every(
    (e) => e === "body only" || profile.equipment.includes(e),
  )
  if (needsOnlyBodyweight || equipmentCovered) score += 2
  return score
}

export function recommendTemplates(
  profile: RecommendProfile,
  templates: RoutineTemplate[],
): ScoredTemplate[] {
  const scored = templates
    .map((template, index) => ({ template, score: scoreTemplate(profile, template), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  let recommendedCount = 0
  return scored.map(({ template, score }) => {
    const recommended = score >= 4 && recommendedCount < 3
    if (recommended) recommendedCount += 1
    return { template, score, recommended }
  })
}
