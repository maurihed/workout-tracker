import "server-only"

import { PrismaAdapter } from "@auth/prisma-adapter"
import { headers } from "next/headers"
import NextAuth from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

import { RateLimitError } from "@/lib/api-error"
import { requireOAuthEnv } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { consumeRateLimit } from "@/lib/rate-limit"

const AUTH_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const

async function getClientIp(): Promise<string> {
  const requestHeaders = await headers()
  const forwarded = requestHeaders.get("x-forwarded-for")
  return (
    forwarded?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown"
  )
}

const googleEnv = requireOAuthEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])
const facebookEnv = requireOAuthEnv([
  "FACEBOOK_CLIENT_ID",
  "FACEBOOK_CLIENT_SECRET",
])

export const providers = [
  Google({
    clientId: googleEnv.GOOGLE_CLIENT_ID,
    clientSecret: googleEnv.GOOGLE_CLIENT_SECRET,
    allowDangerousEmailAccountLinking: false,
  }),
  Facebook({
    clientId: facebookEnv.FACEBOOK_CLIENT_ID,
    clientSecret: facebookEnv.FACEBOOK_CLIENT_SECRET,
    allowDangerousEmailAccountLinking: false,
  }),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/en/login" },
  providers,
  callbacks: {
    async signIn() {
      const ip = await getClientIp()
      const { allowed } = await consumeRateLimit({
        key: `auth:${ip}`,
        limit: AUTH_RATE_LIMIT.limit,
        windowMs: AUTH_RATE_LIMIT.windowMs,
      })
      if (!allowed) throw new RateLimitError()
      return true
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id
      return session
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return
      await prisma.profile.create({ data: { userId: user.id, timezone: "UTC" } })
    },
  },
})
