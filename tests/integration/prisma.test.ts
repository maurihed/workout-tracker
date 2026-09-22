import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/prisma"

describe("prisma connection", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } })
  })

  it("creates a user with a nullable email and cascades sessions", async () => {
    const user = await prisma.user.create({
      data: { name: "No Email", email: null },
    })
    expect(user.id).toBeTruthy()
    expect(user.email).toBeNull()

    await prisma.session.create({
      data: {
        sessionToken: `tok_${user.id}`,
        userId: user.id,
        expires: new Date(Date.now() + 60_000),
      },
    })

    await prisma.user.delete({ where: { id: user.id } })
    const sessions = await prisma.session.count({ where: { userId: user.id } })
    expect(sessions).toBe(0)
  })
})
