import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { getProfile, updateProfile } from "@/server/services/profile.service"

const EMAIL_DOMAIN = "@profile-test.local"

async function makeUser() {
  return prisma.user.create({
    data: { email: `p_${Date.now()}${EMAIL_DOMAIN}` },
  })
}

describe("profile service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    })
  })

  it("throws NotFoundError before a profile exists", async () => {
    const user = await makeUser()
    await expect(getProfile(user.id)).rejects.toThrow("Profile not found")
  })

  it("upserts a profile and persists a valid timezone", async () => {
    const user = await makeUser()
    await updateProfile(user.id, {
      timezone: "Europe/Madrid",
      unitSystem: "metric",
    })
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

  it("persists onboarding location and equipment", async () => {
    const user = await makeUser()
    await updateProfile(user.id, {
      location: "home",
      equipment: ["dumbbell", "body only"],
    })
    const profile = await getProfile(user.id)
    expect(profile.location).toBe("home")
    expect(profile.equipment).toEqual(["dumbbell", "body only"])
  })

  it("sets onboardingSkippedAt when onboarding is skipped", async () => {
    const user = await makeUser()
    await updateProfile(user.id, { onboardingSkippedAt: "2026-02-03T04:05:06.000Z" })
    const profile = await getProfile(user.id)
    expect(profile.onboardingSkippedAt).toBeInstanceOf(Date)
    expect(profile.onboardingSkippedAt?.toISOString()).toBe("2026-02-03T04:05:06.000Z")
  })
})
