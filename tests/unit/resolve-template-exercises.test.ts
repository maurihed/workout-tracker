import { describe, expect, it } from "vitest"
import { resolveTemplateExercises } from "@/server/services/routine.service"

describe("resolveTemplateExercises", () => {
  it("throws and returns nothing when a sourceId is missing", () => {
    const byId = new Map<string, string>([["A", "id-a"]])
    expect(() =>
      resolveTemplateExercises(
        [
          { sourceId: "A", sets: 3, reps: "10", restSeconds: 60 },
          { sourceId: "B", sets: 3, reps: "10", restSeconds: 60 },
        ],
        byId,
      ),
    ).toThrow("unknown exercises: B")
  })

  it("resolves known ids", () => {
    const byId = new Map<string, string>([["A", "id-a"]])
    expect(
      resolveTemplateExercises([{ sourceId: "A", sets: 3, reps: "10", restSeconds: 60 }], byId),
    ).toEqual([{ exerciseId: "id-a", sets: 3, reps: "10", restSeconds: 60 }])
  })
})
