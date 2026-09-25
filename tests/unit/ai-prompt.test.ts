import { describe, expect, it } from "vitest"
import type { AiJobInput } from "@/features/ai/lib/contract"
import { PROMPT_VERSION, buildPrompt } from "@/features/ai/lib/prompt"

const catalog = [
  { sourceId: "Barbell_Squat", name: "Barbell Squat", primaryMuscles: ["quadriceps"] },
]

const input: AiJobInput = {
  goal: "build_muscle",
  experience: "beginner",
  equipment: ["barbell"],
  daysPerWeek: 3,
  focus: null,
  personalize: true,
}

describe("buildPrompt", () => {
  it("pins the JSON contract, forbids prose, and lists catalog ids", () => {
    const prompt = buildPrompt(input, catalog)
    expect(PROMPT_VERSION).toBe("1")
    expect(prompt).toMatch(/JSON only/i)
    expect(prompt).toContain("Barbell_Squat")
    expect(prompt).toMatch(/build_muscle/)
    expect(prompt).toMatch(/3/)
  })

  it("enumerates catalog names and primary muscles", () => {
    const prompt = buildPrompt(input, catalog)
    expect(prompt).toContain("Barbell Squat")
    expect(prompt).toContain("quadriceps")
  })

  it("includes the schema summary and determinism guidance", () => {
    const prompt = buildPrompt(input, catalog)
    expect(prompt).toMatch(/timerType/)
    expect(prompt).toMatch(/weekday/)
    expect(prompt).toMatch(/temperature\s*0/i)
  })

  it("requests one active day per requested weekly frequency", () => {
    const prompt = buildPrompt({ ...input, daysPerWeek: 5 }, catalog)
    expect(prompt).toMatch(/5/)
  })
})
