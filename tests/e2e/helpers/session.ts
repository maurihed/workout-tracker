import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../../src/generated/prisma/client"

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/**
 * Creates a not-yet-onboarded user with a bare profile and a database session,
 * returning the `authjs.session-token` cookie the test can inject so Auth.js
 * (database session strategy) authenticates subsequent requests.
 */
export async function createTestSession(email: string) {
  // Upsert keeps retries idempotent: a retried test reuses its email, which
  // would otherwise collide on the unique `User.email` constraint.
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, profile: { create: {} } },
  })
  const token = `e2e_${user.id}_${Date.now()}`
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + 3_600_000),
    },
  })
  return { cookie: { name: "authjs.session-token", value: token }, userId: user.id }
}

/** Removes the test user; profile, sessions and routines cascade on delete. */
export async function cleanupTestUser(email: string) {
  await prisma.user.deleteMany({ where: { email } })
}

/** Closes the shared connection pool so the Playwright worker can exit. */
export async function disconnectTestDb() {
  await prisma.$disconnect()
}
