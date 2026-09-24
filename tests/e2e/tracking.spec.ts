import { expect, test } from "@playwright/test"

import {
  cleanupTestUser,
  createTestSession,
  disconnectTestDb,
  seedActiveRoutine,
} from "./helpers/session"

const email = `e2e_tracking_${Date.now()}@e2e-test.local`

const ROUTINE_NAME = "E2E Tracking Plan"
const DAY_LABEL = "E2E Tracking Day"
const EXERCISE = "E2E Overhead Press"

test.afterAll(async () => {
  await cleanupTestUser(email)
  await disconnectTestDb()
})

/**
 * Onboarded user with a single-day routine. A one-day routine makes `/workout`
 * auto-start the runner, so the spec drives completion without a day chooser.
 */
async function seedUserWithRoutine() {
  const { cookie, userId } = await createTestSession(email, { onboarded: true })
  await seedActiveRoutine(userId, {
    name: ROUTINE_NAME,
    days: [
      {
        weekday: 1,
        label: DAY_LABEL,
        exercises: [{ name: EXERCISE, restSeconds: 60 }],
      },
    ],
  })
  return { cookie }
}

test("completed workout surfaces streak/level and lands in history", async ({
  page,
  context,
}) => {
  const { cookie } = await seedUserWithRoutine()
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  // Single-day routine: `/workout` auto-starts and drops straight into the runner.
  await page.goto("/en/workout")
  await expect(
    page.getByRole("heading", { level: 2, name: EXERCISE }),
  ).toBeVisible()
  await expect(page.getByLabel("Reps")).toHaveCount(3)

  // Log the first set: fill the weight, then mark it complete.
  await page.getByLabel("Weight").first().fill("40")

  const completed = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === "POST" &&
      /^\/api\/sessions\/[^/]+\/complete$/.test(url.pathname) &&
      response.status() === 200
    )
  })
  await page
    .getByRole("checkbox", { name: "Mark set complete" })
    .first()
    .check()

  // Two prescribed sets remain, so finishing asks for confirmation first.
  await page.getByRole("button", { name: "Finish" }).click()
  const finishDialog = page.getByRole("alertdialog")
  await expect(finishDialog).toBeVisible()
  await finishDialog.getByRole("button", { name: "Finish" }).click()
  await expect(page).toHaveURL(/\/en\/workout\/summary\/[^/]+$/)
  await expect(
    page.getByRole("heading", { name: "Workout summary" }),
  ).toBeVisible()
  // The server-side completion (stats recompute) must land before asserting.
  await completed

  // A full reload gets a fresh query client so the dashboard reads fresh stats.
  await page.goto("/en/dashboard")
  await expect(page).toHaveURL(/\/en\/dashboard$/)
  await expect(page.getByText("1-day streak")).toBeVisible()
  const statsCard = page.locator("section", { hasText: "1-day streak" })
  await expect(statsCard.getByText(/^Level \d+$/)).toBeVisible()

  // History lists the session and opens its read-only detail.
  await page.goto("/en/progress")
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible()
  const row = page.getByRole("link", { name: DAY_LABEL })
  await expect(row).toBeVisible()
  await row.click()
  await expect(page).toHaveURL(/\/en\/progress\/[^/]+$/)
  await expect(
    page.getByRole("heading", { name: DAY_LABEL }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { level: 2, name: EXERCISE }),
  ).toBeVisible()
})
