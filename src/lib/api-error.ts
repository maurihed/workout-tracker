import { NextResponse } from "next/server"

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, "validation_error", message, details)
  }
}
export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required") {
    super(401, "unauthorized", message)
  }
}
export class ForbiddenError extends ApiError {
  constructor(message = "Not allowed") {
    super(403, "forbidden", message)
  }
}
export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, "not_found", message)
  }
}
export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(409, "conflict", message)
  }
}
export class RateLimitError extends ApiError {
  constructor(message = "Too many requests") {
    super(429, "rate_limited", message)
  }
}

export function toApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    )
  }

  console.error("Unhandled API error", error)
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 },
  )
}
