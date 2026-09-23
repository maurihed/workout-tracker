import { expect, test } from "@playwright/test"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../src/generated/prisma/client"
import {
  cleanupTestUser, createTestSession, disconnectTestDb, seedActiveRoutine,
} from "./helpers/session"

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const email = `e2e_offline_${Date.now()}@e2e-test.local`
const EXERCISE = "E2E Offline Press"

test.afterAll(async () => {
  await cleanupTestUser(email)
  await disconnectTestDb()
  await prisma.$disconnect()
})

test("runs and finishes a workout entirely offline, then syncs", async ({ page, context }) => {
  const { cookie, userId } = await createTestSession(email, { onboarded: true })
  await seedActiveRoutine(userId, {
    name: "E2E Offline Plan",
    days: [{ weekday: 1, label: "Offline Day", exercises: [{ name: EXERCISE, restSeconds: 0 }] }],
  })
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  // Load once online so the SW installs and the active session is created + synced.
  await page.goto("/en/workout")
  await expect(page.getByRole("heading", { level: 2, name: EXERCISE })).toBeVisible()
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null)
  await expect
    .poll(async () => {
      const session = await prisma.workoutSession.findFirst({
        where: { userId, status: "in_progress" },
        select: { id: true },
      })
      return session?.id ?? null
    }, { timeout: 15_000 })
    .not.toBeNull()

  // Go offline and cold-open: the SW shell + local session must resume the runner.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole("heading", { level: 2, name: EXERCISE })).toBeVisible()

  // Log the prescribed set and finish.
  await page.getByLabel("Weight").first().fill("25")
  await page.getByRole("checkbox", { name: "Mark set complete" }).first().check()
  await page.getByRole("button", { name: "Finish" }).click()
  const finishDialog = page.getByRole("alertdialog")
  if (await finishDialog.isVisible().catch(() => false)) {
    await finishDialog.getByRole("button", { name: "Finish" }).click()
  }
  await expect(page).toHaveURL(/\/en\/workout\/summary\/[^/]+$/)
  await expect(page.getByRole("heading", { name: "Workout summary" })).toBeVisible()

  // Back online: the outbox flushes and the session is completed server-side.
  await context.setOffline(false)
  await expect
    .poll(async () => {
      const session = await prisma.workoutSession.findFirst({
        where: { userId, status: "completed" },
        select: { id: true },
      })
      return session?.id ?? null
    }, { timeout: 15_000 })
    .not.toBeNull()
})
