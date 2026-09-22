import "server-only"

function isEnforcementSkipped() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
}

/**
 * Reads the given environment variables. Outside of tests and production
 * builds, missing values fail fast in production runtime but only warn in
 * development, so a fresh clone with the shipped `.env.example` can still boot
 * (OAuth sign-in, however, will not work until credentials are set).
 */
export function requireOAuthEnv<const K extends string>(
  keys: readonly K[],
): Record<K, string> {
  const values = {} as Record<K, string>
  const missing: string[] = []

  for (const key of keys) {
    const value = process.env[key]
    values[key] = value ?? ""
    if (!value) missing.push(key)
  }

  if (missing.length > 0 && !isEnforcementSkipped()) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `Missing OAuth credentials: ${missing.join(", ")}. ` +
          "Sign-in with the affected providers will fail until they are set.",
      )
    } else {
      throw new Error(`Missing OAuth credentials: ${missing.join(", ")}`)
    }
  }

  return values
}
