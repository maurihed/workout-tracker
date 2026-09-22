import { describe, expect, it } from "vitest"
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
  toApiError,
} from "@/lib/api-error"

describe("toApiError", () => {
  it("maps a known ApiError to its status and envelope", async () => {
    const res = toApiError(new NotFoundError("Routine not found"))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Routine not found" },
    })
  })

  it("includes validation details when provided", async () => {
    const res = toApiError(new ValidationError("Invalid", { name: ["Required"] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.details).toEqual({ name: ["Required"] })
  })

  it("maps unknown errors to a generic 500 without leaking the message", async () => {
    const res = toApiError(new Error("db password is hunter2"))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: { code: "internal_error", message: "Something went wrong" },
    })
  })

  it("maps conflicts and preserves status from a raw ApiError", () => {
    expect(toApiError(new ConflictError("dup")).status).toBe(409)
    expect(toApiError(new ApiError(418, "teapot", "nope")).status).toBe(418)
  })
})
