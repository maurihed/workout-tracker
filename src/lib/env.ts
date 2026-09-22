import "server-only"

function isEnforcementSkipped() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PHASE === "phase-production-build"
  )
}

/**
 * Reads the given environment variables, throwing when any are missing outside
 * of tests and production builds. Tests import server modules directly and
 * fresh clones/CI may build with placeholder env, so enforcement is skipped in
 * those two phases only.
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
    throw new Error(`Missing OAuth credentials: ${missing.join(", ")}`)
  }

  return values
}
