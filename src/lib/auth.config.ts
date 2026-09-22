import type { NextAuthConfig } from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

import { requireOAuthEnv } from "@/lib/env"

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

export const authConfig = {
  pages: { signIn: "/en/login" },
  providers,
  callbacks: {},
} satisfies NextAuthConfig
