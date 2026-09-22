import NextAuth from "next-auth"
import createIntlMiddleware from "next-intl/middleware"
import { NextResponse } from "next/server"

import { authConfig } from "@/lib/auth.config"
import { isPublicPath, stripLocale } from "@/lib/route-access"
import { routing } from "@/i18n/routing"

const intlMiddleware = createIntlMiddleware(routing)

const { auth } = NextAuth(authConfig)

export default auth((request) => {
  const { pathname } = request.nextUrl
  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  if (isPublicPath(pathname)) {
    return intlMiddleware(request)
  }

  if (!request.auth) {
    const { locale } = stripLocale(pathname)
    const loginUrl = new URL(`/${locale}/login`, request.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return intlMiddleware(request)
})

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] }
