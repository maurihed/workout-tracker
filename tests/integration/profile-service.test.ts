import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { getProfile, updateProfile } from "@/server/services/profile.service"

async function makeUser() {
  return prisma.user.create({ data: { email: `p_${Date.now()}@test.local` } })
}

describe("profile service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } })
  })

  it("throws NotFoundError before a profile exists", async () => {
    const user = await makeUser()
    await expect(getProfile(user.id)).rejects.toThrow("Profile not found")
  })

  it("upserts a profile and persists a valid timezone", async () => {
    const user = await makeUser()
    await updateProfile(user.id, { timezone: "Europe/Madrid", unitSystem: "metric" })
    const profile = await getProfile(user.id)
    expect(profile.timezone).toBe("Europe/Madrid")
  })

  it("converts a nullable ISO onboardedAt string into a DateTime", async () => {
    const user = await makeUser()
    await updateProfile(user.id, { onboardedAt: "2026-01-02T03:04:05.000Z" })
    const profile = await getProfile(user.id)
    expect(profile.onboardedAt).toBeInstanceOf(Date)
    expect(profile.onboardedAt?.toISOString()).toBe("2026-01-02T03:04:05.000Z")
  })
})
