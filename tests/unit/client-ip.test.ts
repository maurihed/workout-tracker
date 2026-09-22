import { describe, expect, it } from "vitest"

import { resolveClientIp } from "@/lib/client-ip"

describe("resolveClientIp", () => {
  it("prefers x-real-ip over x-forwarded-for", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "6.6.6.6, 10.0.0.1",
    })
    expect(resolveClientIp(headers)).toBe("203.0.113.7")
  })

  it("uses the rightmost x-forwarded-for entry when x-real-ip is absent", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })
    expect(resolveClientIp(headers)).toBe("10.0.0.1")
  })

  it("does not trust a spoofed leftmost value when a rightmost value exists", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 198.51.100.9" })
    expect(resolveClientIp(headers)).not.toBe("1.2.3.4")
    expect(resolveClientIp(headers)).toBe("198.51.100.9")
  })

  it("returns unknown when neither header is present", () => {
    expect(resolveClientIp(new Headers())).toBe("unknown")
  })

  it("ignores blank header values", () => {
    const headers = new Headers({
      "x-real-ip": "   ",
      "x-forwarded-for": " , 198.51.100.9 ",
    })
    expect(resolveClientIp(headers)).toBe("198.51.100.9")
  })
})
