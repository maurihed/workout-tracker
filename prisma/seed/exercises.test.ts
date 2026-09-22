import { describe, expect, it } from "vitest"
import { mapExercise } from "./exercises"

describe("mapExercise", () => {
  it("maps a full record, defaulting nulls and copied fields", () => {
    const mapped = mapExercise({
      id: "Barbell_Curl",
      name: "Barbell Curl",
      force: "pull",
      level: "beginner",
      mechanic: "isolation",
      equipment: "barbell",
      primaryMuscles: ["biceps"],
      secondaryMuscles: ["forearms"],
      instructions: ["Stand up...", "Curl..."],
      category: "strength",
      images: ["Barbell_Curl/0.jpg", "Barbell_Curl/1.jpg"],
    })
    expect(mapped.sourceId).toBe("Barbell_Curl")
    expect(mapped.images).toEqual(["Barbell_Curl/0.jpg", "Barbell_Curl/1.jpg"])
    expect(mapped.primaryMuscles).toEqual(["biceps"])
  })

  it("tolerates a record with null optional fields", () => {
    const mapped = mapExercise({
      id: "Adductor_Groin",
      name: "Adductor/Groin",
      force: "static",
      level: "intermediate",
      mechanic: null,
      equipment: null,
      primaryMuscles: ["adductors"],
      secondaryMuscles: [],
      instructions: ["Lie on your back..."],
      category: "stretching",
      images: ["Adductor_Groin/0.jpg"],
    })
    expect(mapped.mechanic).toBeNull()
    expect(mapped.equipment).toBeNull()
  })
})
