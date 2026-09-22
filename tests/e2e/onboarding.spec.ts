import { expect, test } from "@playwright/test"

import {
  cleanupTestUser,
  createTestSession,
  disconnectTestDb,
} from "./helpers/session"

const completedEmail = `e2e_onboarding_${Date.now()}@e2e-test.local`
const skippedEmail = `e2e_skip_${Date.now()}@e2e-test.local`

const ROUTINE_NAME =
  /Full Body 3x|Upper \/ Lower 4x|Push \/ Pull \/ Legs 6x|Dumbbell Home 3x|Bodyweight 3x/

test.afterAll(async () => {
  await cleanupTestUser(completedEmail)
  await cleanupTestUser(skippedEmail)
  await disconnectTestDb()
})

test("new user completes onboarding and lands on the dashboard with a routine", async ({
  page,
  context,
}) => {
  const { cookie } = await createTestSession(completedEmail)
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  await page.goto("/en/dashboard")
  await expect(page).toHaveURL(/\/en\/onboarding/)

  // Goal
  await page.getByRole("button", { name: "Build muscle" }).click()
  await page.getByRole("button", { name: "Next" }).click()

  // Experience
  await page.getByRole("button", { name: "Beginner" }).click()
  await page.getByRole("button", { name: "Next" }).click()

  // Equipment: location plus at least one item
  await page.getByRole("button", { name: "Gym" }).click()
  await page.getByRole("button", { name: "Barbell" }).click()
  await page.getByRole("button", { name: "Next" }).click()

  // Schedule
  await page.getByRole("button", { name: "3 days per week" }).click()
  await page.getByRole("button", { name: "Next" }).click()

  // Preferences: metric/UTC are already valid defaults, so continue.
  await page.getByRole("button", { name: "Next" }).click()

  // Metrics is optional; saving an empty form advances without a request.
  await page.getByRole("button", { name: "Save" }).click()

  // Template: pick the first recommended routine.
  const templateStep = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /Pick a routine/i }) })
  await expect(templateStep).toBeVisible()
  await templateStep.getByRole("button").first().click()

  await expect(page).toHaveURL(/\/en\/dashboard/)
  await expect(page.getByRole("heading", { name: ROUTINE_NAME })).toBeVisible()
})

test("skip for now reaches the dashboard without a routine", async ({
  page,
  context,
}) => {
  const { cookie } = await createTestSession(skippedEmail)
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  await page.goto("/en/onboarding")
  await page.getByRole("button", { name: "Skip" }).click()

  await expect(page).toHaveURL(/\/en\/dashboard/)
  await expect(
    page.getByRole("link", { name: /Pick a routine|Elegir una rutina/i }),
  ).toBeVisible()
})
