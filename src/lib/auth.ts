import "server-only"

import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

import { prisma } from "@/lib/prisma"

export const providers = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    allowDangerousEmailAccountLinking: false,
  }),
  Facebook({
    clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    allowDangerousEmailAccountLinking: false,
  }),
]

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: { signIn: "/en/login" },
  providers,
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id
      return session
    },
  },
})
