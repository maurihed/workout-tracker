import { afterEach, describe, expect, it } from "vitest"

import { needsOnboarding } from "@/features/onboarding/lib/onboarding"
import { prisma } from "@/lib/prisma"
import { getProfileOrNull } from "@/server/services/profile.service"

const EMAIL_DOMAIN = "@onboarding-gate-test.local"

describe("onboarding gate", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    })
  })

  it("returns null for a user whose profile has not been created yet", async () => {
    const user = await prisma.user.create({
      data: { email: `gate_missing_${Date.now()}${EMAIL_DOMAIN}` },
    })

    expect(await getProfileOrNull(user.id)).toBeNull()
  })

  it("does not re-enter onboarding after skip or completion", async () => {
    const user = await prisma.user.create({
      data: {
        email: `gate_${Date.now()}${EMAIL_DOMAIN}`,
        profile: { create: {} },
      },
      include: { profile: true },
    })
    expect(needsOnboarding(user.profile!)).toBe(true)

    await prisma.profile.update({
      where: { userId: user.id },
      data: { onboardingSkippedAt: new Date() },
    })
    const skipped = await getProfileOrNull(user.id)
    expect(skipped).not.toBeNull()
    expect(needsOnboarding(skipped!)).toBe(false)

    await prisma.profile.update({
      where: { userId: user.id },
      data: { onboardingSkippedAt: null, onboardedAt: new Date() },
    })
    const completed = await getProfileOrNull(user.id)
    expect(completed).not.toBeNull()
    expect(needsOnboarding(completed!)).toBe(false)
  })
})
