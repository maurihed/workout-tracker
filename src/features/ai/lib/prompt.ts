import { contractJsonSchema } from "@/features/ai/lib/contract"
import type { AiJobInput } from "@/features/ai/lib/contract"
import {
  GYM_PROFILE_DESCRIPTIONS,
  allowedEquipmentForInput,
} from "@/features/ai/lib/gym-profile"

export const PROMPT_VERSION = "3"

export type PromptCatalogEntry = {
  sourceId: string
  name: string
  primaryMuscles: string[]
  equipment?: string | null
}

function locationLine(input: AiJobInput): string {
  if (input.location === "gym") {
    return `- Training place: gym. Equipment level: ${GYM_PROFILE_DESCRIPTIONS[input.gymProfile]}`
  }
  const equipment =
    input.equipment.length > 0 ? input.equipment.join(", ") : "bodyweight only"
  return `- Training place: home or park. Available equipment: ${equipment}. Bodyweight is always available.`
}

export function buildPrompt(
  input: AiJobInput,
  catalog: PromptCatalogEntry[],
  historySummary?: string,
): string {
  const catalogLines =
    catalog.length > 0
      ? catalog
          .map((entry) => {
            const muscles = entry.primaryMuscles.join(", ") || "unspecified"
            const equipment = entry.equipment
              ? `; equipment: ${entry.equipment}`
              : ""
            return `- ${entry.sourceId} — ${entry.name} (${muscles}${equipment})`
          })
          .join("\n")
      : "- (no catalog entries available; set sourceId to null and provide a name)"

  const allowedEquipment = [...allowedEquipmentForInput(input)].join(", ")

  const lines = [
    "You are an expert strength and conditioning coach. Generate a weekly workout routine.",
    "",
    "Requested routine:",
    `- Goal: ${input.goal}`,
    `- Experience: ${input.experience}`,
    locationLine(input),
    `- Available equipment: ${allowedEquipment}`,
    `- Days per week: ${input.daysPerWeek}`,
    `- Focus: ${input.focus?.trim() || "none"}`,
    "",
    "JSON only, no prose, no markdown, no code fences. Respond with a single JSON object that matches this schema exactly:",
    JSON.stringify(contractJsonSchema),
    "",
    "Rules:",
    `- Include exactly ${input.daysPerWeek} day object(s) in "days".`,
    '- "weekday" is an integer from 0 (Monday) through 6 (Sunday); no two days may share a weekday.',
    "- Each day must contain at least one exercise.",
    "- Prefer catalog sourceIds from the allowed catalog below so exercises can be matched automatically.",
    "- Only use sourceId values that appear in the allowed catalog. Never prescribe equipment that is not available.",
    "- If the routine needs a movement that the catalog does not cover, set sourceId to null, provide a descriptive name, and include 2-4 short instructions steps for it.",
    "- Include instructions only for custom exercises (sourceId null); omit it for catalog exercises.",
    "- Keep instructions concise, one step per string: setup, execution, and a key technique cue.",
    '- Use timerType "none" for standard set/rep work; interval, emom, and amrap require a workSeconds value.',
    "- sets is 1-10, restSeconds is 0-3600, rounds is 1-50.",
    '- reps is a string such as "8-10" or "30s".',
    "- Omit targetWeightKg or set it to null unless a specific load is clearly appropriate for a beginner.",
    "",
    "The catalog below is already limited to exercises that fit the training place and equipment.",
    "Allowed catalog:",
    catalogLines,
    "",
    `Use temperature 0 and make the output deterministic: the same input must always produce the same routine with no random variation. promptVersion=${PROMPT_VERSION}.`,
  ]

  if (historySummary && historySummary.trim().length > 0) {
    lines.push(
      "",
      "Recent training (last 3 sessions, 12 weeks):",
      historySummary.trim(),
      "Choose loads close to the athlete's recent performance and keep them conservative.",
    )
  }

  return lines.join("\n")
}
