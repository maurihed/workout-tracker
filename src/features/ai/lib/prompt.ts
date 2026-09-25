import { contractJsonSchema } from "@/features/ai/lib/contract"
import type { AiJobInput } from "@/features/ai/lib/contract"

export const PROMPT_VERSION = "2"

export type PromptCatalogEntry = {
  sourceId: string
  name: string
  primaryMuscles: string[]
}

export function buildPrompt(
  input: AiJobInput,
  catalog: PromptCatalogEntry[],
  historySummary?: string,
): string {
  const catalogLines =
    catalog.length > 0
      ? catalog
          .map(
            (entry) =>
              `- ${entry.sourceId} — ${entry.name} (${entry.primaryMuscles.join(", ") || "unspecified"})`,
          )
          .join("\n")
      : "- (no catalog entries available; set sourceId to null and provide a name)"

  const lines = [
    "You are an expert strength and conditioning coach. Generate a weekly workout routine.",
    "",
    "Requested routine:",
    `- Goal: ${input.goal}`,
    `- Experience: ${input.experience}`,
    `- Equipment: ${input.equipment.length > 0 ? input.equipment.join(", ") : "bodyweight only"}`,
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
    "- Only use sourceId values that appear in the allowed catalog. If no catalog entry fits, set sourceId to null and provide a descriptive name.",
    '- Use timerType "none" for standard set/rep work; interval, emom, and amrap require a workSeconds value.',
    "- sets is 1-10, restSeconds is 0-3600, rounds is 1-50.",
    "- reps is a string such as \"8-10\" or \"30s\".",
    "- Omit targetWeightKg or set it to null unless a specific load is clearly appropriate for a beginner.",
    "",
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
