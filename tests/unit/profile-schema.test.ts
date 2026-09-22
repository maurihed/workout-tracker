import { describe, expect, it } from "vitest"
import { updateProfileSchema } from "@/features/profile/schemas/profile"

describe("updateProfileSchema", () => {
  it("accepts a valid IANA timezone", () => {
    expect(updateProfileSchema.safeParse({ timezone: "America/Mexico_City" }).success).toBe(true)
  })

  it("rejects a non-IANA timezone", () => {
    const result = updateProfileSchema.safeParse({ timezone: "Mars/Phobos" })
    expect(result.success).toBe(false)
  })

  it("rejects an out-of-range week start", () => {
    expect(updateProfileSchema.safeParse({ weekStartsOn: 9 }).success).toBe(false)
  })

  it("accepts an empty partial update", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true)
  })
})
