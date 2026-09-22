import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  deleteAccount,
  exportUserData,
} from "@/server/services/account.service"

const EMAIL_DOMAIN = "@account-test.local"

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `acct_${Date.now()}${Math.random()}${EMAIL_DOMAIN}`,
      profile: { create: {} },
    },
  })
}

describe("account service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    })
  })

  it("exports a well-formed document even with no workouts", async () => {
    const user = await makeUser()
    const doc = await exportUserData(user.id)
    expect(doc.user.id).toBe(user.id)
    expect(doc.profile).toBeTruthy()
    expect(Array.isArray(doc.routines)).toBe(true)
    expect(doc.exportedAt).toMatch(/T/)
  })

  it("deletes the user and cascades the profile", async () => {
    const user = await makeUser()
    await deleteAccount(user.id)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull()
    expect(await prisma.profile.count({ where: { userId: user.id } })).toBe(0)
  })

  it("throws NotFoundError when exporting an unknown user", async () => {
    await expect(exportUserData("missing-user")).rejects.toThrow(
      "User not found",
    )
  })

  it("throws NotFoundError when deleting an unknown user", async () => {
    await expect(deleteAccount("missing-user")).rejects.toThrow(
      "User not found",
    )
  })
})
