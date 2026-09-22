import { describe, expect, it } from "vitest"
import { providers } from "@/lib/auth"

describe("auth providers", () => {
  it("registers exactly google and facebook", () => {
    const ids = providers.map((p) => p.id).sort()
    expect(ids).toEqual(["facebook", "google"])
  })
})
