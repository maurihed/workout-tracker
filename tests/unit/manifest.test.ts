import { describe, expect, it } from "vitest"
import manifest from "@/app/manifest"

describe("web app manifest", () => {
  it("is installable and points at the icons", () => {
    const m = manifest()
    expect(m.display).toBe("standalone")
    expect(m.start_url).toBe("/")
    const sizes = (m.icons ?? []).map((icon) => icon.sizes)
    expect(sizes).toContain("192x192")
    expect(sizes).toContain("512x512")
  })
})
