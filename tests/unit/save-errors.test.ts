import { describe, expect, it } from "vitest"

import {
  getHttpStatus,
  HttpError,
  isRetryableSaveError,
} from "@/features/workouts/lib/save-errors"

describe("getHttpStatus", () => {
  it("reads an axios-style response status", () => {
    expect(getHttpStatus({ response: { status: 409 } })).toBe(409)
  })

  it("reads the keepalive HttpError status", () => {
    expect(getHttpStatus(new HttpError(503))).toBe(503)
  })

  it("returns null when there is no status", () => {
    expect(getHttpStatus(new Error("network"))).toBeNull()
    expect(getHttpStatus(undefined)).toBeNull()
  })
})

describe("isRetryableSaveError", () => {
  it("retries network errors and timeouts (no status)", () => {
    expect(isRetryableSaveError(new Error("network"))).toBe(true)
    expect(isRetryableSaveError({ code: "ECONNABORTED" })).toBe(true)
  })

  it("retries 5xx and transient 408/429", () => {
    expect(isRetryableSaveError({ response: { status: 500 } })).toBe(true)
    expect(isRetryableSaveError(new HttpError(503))).toBe(true)
    expect(isRetryableSaveError(new HttpError(408))).toBe(true)
    expect(isRetryableSaveError(new HttpError(429))).toBe(true)
  })

  it("stops on terminal 4xx such as 400 and 409", () => {
    expect(isRetryableSaveError({ response: { status: 400 } })).toBe(false)
    expect(isRetryableSaveError(new HttpError(409))).toBe(false)
    expect(isRetryableSaveError(new HttpError(404))).toBe(false)
  })
})
