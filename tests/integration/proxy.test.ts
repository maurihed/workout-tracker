import { NextRequest } from "next/server"
import { afterAll, describe, expect, it } from "vitest"

import proxy from "@/proxy"
import { prisma } from "@/lib/prisma"

const SESSION_TOKEN = "it_proxy_session_token"
const EMAIL = "proxy-test@test.local"

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
}

describe("proxy route protection", () => {
  afterAll(cleanup)

  it("redirects an unauthenticated request to the locale login", async () => {
    const request = new NextRequest("http://localhost:3000/en/dashboard")
    const response = (await proxy(request, {} as never)) as Response

    expect(response.status).toBe(307)
    const location = response.headers.get("location")
    expect(location).toContain("/en/login")
    expect(location).toContain("callbackUrl=%2Fen%2Fdashboard")
  })

  it("lets an authenticated user through and preserves the session cookie", async () => {
    await cleanup()
    const user = await prisma.user.create({ data: { email: EMAIL } })
    await prisma.session.create({
      data: {
        sessionToken: SESSION_TOKEN,
        userId: user.id,
        expires: new Date(Date.now() + 60_000),
      },
    })

    const request = new NextRequest("http://localhost:3000/en/dashboard", {
      headers: { cookie: `authjs.session-token=${SESSION_TOKEN}` },
    })
    const response = (await proxy(request, {} as never)) as Response

    expect(response.headers.get("location")).toBeNull()
    expect(response.status).not.toBe(307)

    const setCookie = response.headers.getSetCookie().join(";")
    expect(setCookie).not.toContain("authjs.session-token=;")
    expect(setCookie).toContain(SESSION_TOKEN)
  })
})
