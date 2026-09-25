import { expect, test } from "@playwright/test"

import {
  cleanupTestUser,
  createTestSession,
  disconnectTestDb,
  seedActiveRoutine,
} from "./helpers/session"

const email = `e2e_progress_${Date.now()}@e2e-test.local`

const ROUTINE_NAME = "E2E Progress Plan"
const DAY_LABEL = "E2E Progress Day"
const EXERCISE = "E2E Front Squat"

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

test("completed workout feeds the dashboard charts and the metric trend", async ({
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
  await page.getByLabel("Weight").first().fill("25")

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
  // The server-side completion (analytics source) must land before asserting.
  await completed

  // A full reload gives a fresh query client so the dashboard reads fresh data.
  await page.goto("/en/dashboard")
  await expect(page).toHaveURL(/\/en\/dashboard$/)
  await expect(page.getByText("Volume", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Muscle heatmap", { exact: true }),
  ).toBeVisible()

  // Add a body-metric entry and confirm it shows up in the weight trend.
  await page.goto("/en/progress/metrics")
  await expect(page).toHaveURL(/\/en\/progress\/metrics$/)
  const saved = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === "PUT" &&
      url.pathname === "/api/body-metrics" &&
      response.status() === 200
    )
  })
  await page.getByLabel("Weight", { exact: true }).fill("80")
  await page.getByRole("button", { name: "Save" }).click()
  await saved

  await expect(page.getByText("Weight trend", { exact: true })).toBeVisible()
  await expect(page.getByText("80 kg").first()).toBeVisible()
})
