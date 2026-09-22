import "server-only"

import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"

import { authConfig } from "@/lib/auth.config"
import { prisma } from "@/lib/prisma"

export { providers } from "@/lib/auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  callbacks: {
    ...authConfig.callbacks,
    session({ session, user }) {
      if (session.user) session.user.id = user.id
      return session
    },
  },
})
