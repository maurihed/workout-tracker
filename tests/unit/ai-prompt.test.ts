import { describe, expect, it } from "vitest"
import type { AiJobInput } from "@/features/ai/lib/contract"
import { PROMPT_VERSION, buildPrompt } from "@/features/ai/lib/prompt"

const catalog = [
  {
    sourceId: "Barbell_Squat",
    name: "Barbell Squat",
    primaryMuscles: ["quadriceps"],
  },
]

const input: AiJobInput = {
  goal: "build_muscle",
  experience: "beginner",
  location: "gym",
  equipment: ["barbell"],
  gymProfile: "intermediate",
  daysPerWeek: 3,
  focus: null,
  personalize: true,
}

describe("buildPrompt", () => {
  it("pins the JSON contract, forbids prose, and lists catalog ids", () => {
    const prompt = buildPrompt(input, catalog)
    expect(PROMPT_VERSION).toBe("3")
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

  it("bumps the prompt version", () => {
    expect(PROMPT_VERSION).toBe("3")
  })

  it("describes a home training place and its selected equipment", () => {
    const prompt = buildPrompt(
      { ...input, location: "home", equipment: ["dumbbell", "bands"] },
      catalog,
    )
    expect(prompt).toMatch(/home or park/i)
    expect(prompt).toContain("dumbbell")
    expect(prompt).toContain("bands")
  })

  it("describes the selected gym equipment level", () => {
    const prompt = buildPrompt({ ...input, gymProfile: "basic" }, catalog)
    expect(prompt).toMatch(/Basic gym/i)
    expect(prompt).toMatch(/cable stations/i)
  })

  it("asks for how-to steps only on custom exercises", () => {
    const prompt = buildPrompt(input, catalog)
    expect(prompt).toMatch(/instructions/i)
    expect(prompt).toMatch(/sourceId null/i)
  })

  it("includes the history summary when provided", () => {
    const prompt = buildPrompt(
      {
        goal: "build_muscle",
        experience: "beginner",
        location: "gym",
        equipment: ["barbell"],
        gymProfile: "intermediate",
        daysPerWeek: 3,
        focus: null,
        personalize: true,
      },
      [
        {
          sourceId: "Barbell_Squat",
          name: "Barbell Squat",
          primaryMuscles: ["quadriceps"],
        },
      ],
      "- Barbell Squat: 100 kg × 5 (2026-09-20)",
    )
    expect(prompt).toContain("Recent training")
    expect(prompt).toContain("100 kg")
  })

  it("omits the history block when no summary is provided", () => {
    const prompt = buildPrompt(
      {
        goal: "build_muscle",
        experience: "beginner",
        location: "gym",
        equipment: ["barbell"],
        gymProfile: "intermediate",
        daysPerWeek: 3,
        focus: null,
        personalize: true,
      },
      [
        {
          sourceId: "Barbell_Squat",
          name: "Barbell Squat",
          primaryMuscles: ["quadriceps"],
        },
      ],
    )
    expect(prompt).not.toContain("Recent training")
  })
})
