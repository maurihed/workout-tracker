import { routing } from "@/i18n/routing"

const PUBLIC_PREFIXES = ["/login", "/legal", "/api/health", "/api/auth"] as const
const PUBLIC_EXACT = ["/api/health"] as const

export function stripLocale(pathname: string): {
  locale: (typeof routing.locales)[number]
  path: string
} {
  const segments = pathname.split("/")
  const maybeLocale = segments[1]
  const isLocale = routing.locales.includes(
    maybeLocale as (typeof routing.locales)[number],
  )
  const locale = isLocale
    ? (maybeLocale as (typeof routing.locales)[number])
    : routing.defaultLocale
  const path = `/${segments.slice(isLocale ? 2 : 1).join("/")}`
  return { locale, path: path === "/" ? "/" : path.replace(/\/$/, "") }
}

export function isPublicPath(pathname: string): boolean {
  const { path } = stripLocale(pathname)
  if (path === "/") return false
  if (PUBLIC_EXACT.includes(path as (typeof PUBLIC_EXACT)[number])) return true
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  )
}
