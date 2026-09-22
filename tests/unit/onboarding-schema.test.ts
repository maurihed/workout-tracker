import { describe, expect, it } from "vitest"
import { fromTemplateSchema } from "@/features/onboarding/schemas/onboarding"

describe("fromTemplateSchema", () => {
  it("accepts a non-empty slug", () => {
    expect(fromTemplateSchema.safeParse({ slug: "full-body-3x" }).success).toBe(true)
  })
  it("rejects an empty slug", () => {
    expect(fromTemplateSchema.safeParse({ slug: "" }).success).toBe(false)
  })
})
