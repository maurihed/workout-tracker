import { describe, expect, it } from "vitest"
import { exerciseListQuerySchema } from "@/features/exercises/schemas/exercise"

describe("exerciseListQuerySchema", () => {
  it("defaults limit and treats empty q as undefined", () => {
    const parsed = exerciseListQuerySchema.parse({ q: "   " })
    expect(parsed.limit).toBe(20)
    expect(parsed.q).toBeUndefined()
  })

  it("clamps limit to the maximum", () => {
    expect(exerciseListQuerySchema.parse({ limit: "999" }).limit).toBe(50)
  })

  it("accepts wildcard characters without transformation", () => {
    expect(exerciseListQuerySchema.parse({ q: "100%_raw" }).q).toBe("100%_raw")
  })

  it("rejects an unknown equipment value", () => {
    expect(exerciseListQuerySchema.safeParse({ equipment: "jetpack" }).success).toBe(false)
  })
})
