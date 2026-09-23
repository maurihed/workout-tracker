import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const isDev = process.env.NODE_ENV !== "production"

// Optional self-hosted origin for exercise media; falls back to the seeded
// upstream host so `img-src` always allows whatever the app renders.
const exerciseImageBase =
  process.env.NEXT_PUBLIC_EXERCISE_IMAGE_BASE ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"

function originOf(url: string, fallback: string) {
  try {
    return new URL(url).origin
  } catch {
    return fallback
  }
}

const exerciseImageOrigin = originOf(
  exerciseImageBase,
  "https://raw.githubusercontent.com",
)

// Pragmatic CSP: Next.js emits inline bootstrap/hydration scripts without a
// nonce, so `'unsafe-inline'` (and `'unsafe-eval'` in dev for React Refresh) is
// required for scripts. Tighten with nonces if/when a middleware nonce is added.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "manifest-src 'self'",
  "worker-src 'self'",
  `img-src 'self' data: blob: ${exerciseImageOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ")

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pino"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/yuhonas/free-exercise-db/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
