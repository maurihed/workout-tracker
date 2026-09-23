import { describe, expect, it } from "vitest"
import { copyRoutineName } from "@/features/routines/lib/copy-name"

describe("copyRoutineName", () => {
  it("appends a localized copy suffix", () => {
    expect(copyRoutineName("Push Day", "en")).toBe("Push Day (copy)")
    expect(copyRoutineName("Push Day", "es")).toBe("Push Day (copia)")
  })
  it("falls back to English for an unknown locale", () => {
    expect(copyRoutineName("X", "fr")).toBe("X (copy)")
  })
})
