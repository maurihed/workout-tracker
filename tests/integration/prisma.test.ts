import { afterAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/prisma"

const EMAIL_DOMAIN = "@prisma-test.local"

describe("prisma connection", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    })
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

  it("allows multiple users with a null email", async () => {
    const a = await prisma.user.create({ data: { email: null } })
    const b = await prisma.user.create({ data: { email: null } })
    expect(a.id).not.toBe(b.id)
    await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } })
  })
})
