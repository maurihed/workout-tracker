export function resolveClientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  const forwarded = headers.get("x-forwarded-for")
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean)
    const closestProxy = hops[hops.length - 1]
    if (closestProxy) return closestProxy
  }

  return "unknown"
}
