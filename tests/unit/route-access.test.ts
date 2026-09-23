import { describe, expect, it } from "vitest"
import { isPublicPath, stripLocale } from "@/lib/route-access"

describe("stripLocale", () => {
  it("splits a known locale from the path", () => {
    expect(stripLocale("/es/routines/1")).toEqual({ locale: "es", path: "/routines/1" })
  })
  it("defaults to en when no locale prefix", () => {
    expect(stripLocale("/routines/1")).toEqual({ locale: "en", path: "/routines/1" })
  })
})

describe("isPublicPath", () => {
  it("treats login, legal, and api/health as public", () => {
    for (const p of ["/login", "/legal/privacy", "/legal/terms", "/api/health"]) {
      expect(isPublicPath(p)).toBe(true)
    }
  })
  it("treats app routes as protected", () => {
    for (const p of ["/", "/dashboard", "/routines", "/profile"]) {
      expect(isPublicPath(p)).toBe(false)
    }
  })
})

describe("offline route access", () => {
  it("treats the localized offline route as public", () => {
    expect(isPublicPath("/en/offline")).toBe(true)
    expect(isPublicPath("/es/offline")).toBe(true)
  })
})
