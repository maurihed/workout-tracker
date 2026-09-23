import { expect, test } from "@playwright/test"

import {
  cleanupTestUser,
  createTestSession,
  disconnectTestDb,
  seedActiveRoutine,
} from "./helpers/session"

const email = `e2e_runner_${Date.now()}@e2e-test.local`

const EXERCISE_A = "E2E Bench Press"
const EXERCISE_B = "E2E Back Squat"

test.afterAll(async () => {
  await cleanupTestUser(email)
  await disconnectTestDb()
})

/**
 * Onboarded user with an active two-day routine. Two days (rather than one)
 * keeps the day chooser in play and prevents the single-day auto-start from
 * firing, which makes the "no active session" assertion after a discard
 * meaningful.
 */
async function seedUserWithRoutine() {
  const { cookie, userId } = await createTestSession(email, { onboarded: true })
  await seedActiveRoutine(userId, {
    name: "E2E Runner Plan",
    days: [
      {
        weekday: 1,
        label: "E2E Day A",
        exercises: [{ name: EXERCISE_A, restSeconds: 60 }],
      },
      {
        weekday: 3,
        label: "E2E Day B",
        exercises: [{ name: EXERCISE_B, restSeconds: 60 }],
      },
    ],
  })
  return { cookie }
}

test("runs a workout, logs a set, resumes after a reload, then finishes", async ({
  page,
  context,
}) => {
  const { cookie } = await seedUserWithRoutine()
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  // Start from the day chooser.
  await page.goto("/en/workout")
  await expect(
    page.getByRole("heading", { name: "Choose a workout" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "E2E Day A", exact: true }).click()

  // Runner is up on the first exercise.
  await expect(
    page.getByRole("heading", { level: 2, name: EXERCISE_A }),
  ).toBeVisible()

  // Log a set: add the row, fill reps/weight, then mark it complete.
  await page.getByRole("button", { name: "Add set" }).click()
  await page.getByLabel("Reps").fill("10")
  await page.getByLabel("Weight").fill("20")

  // Register the response wait before completing: the runner pushes the state
  // to the server ~2s after the last edit, and the reload must resume from it.
  const persisted = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /\/api\/sessions\/[^/]+$/.test(response.url()) &&
      response.status() === 200,
  )
  await page.getByRole("checkbox", { name: "Mark set complete" }).check()

  // Completing a set with rest configured surfaces the rest timer bar.
  await expect(page.getByRole("region", { name: "Rest" })).toBeVisible()
  await persisted

  // A reload restores the in-progress session and the logged set.
  await page.reload()
  await expect(
    page.getByRole("heading", { level: 2, name: EXERCISE_A }),
  ).toBeVisible()
  await expect(page.getByLabel("Reps")).toHaveValue("10")
  await expect(page.getByLabel("Weight")).toHaveValue("20")
  await expect(
    page.getByRole("checkbox", { name: "Mark set complete" }),
  ).toBeChecked()

  // Finish (the only set is complete, so no confirmation dialog) → summary.
  await page.getByRole("button", { name: "Finish" }).click()
  await expect(page).toHaveURL(/\/en\/workout\/summary\/[^/]+$/)

  await expect(
    page.getByRole("heading", { name: "Workout summary" }),
  ).toBeVisible()
  await expect(page.getByText("Duration")).toBeVisible()
  await expect(page.getByText("Sets completed")).toBeVisible()
  await expect(page.getByText("Total volume")).toBeVisible()
  // 10 reps × 20 kg logged on the single completed set.
  await expect(page.getByText("200 kg")).toBeVisible()
})

test("discards a workout and leaves no active session", async ({
  page,
  context,
}) => {
  const { cookie } = await seedUserWithRoutine()
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  await page.goto("/en/workout")
  await page.getByRole("button", { name: "E2E Day B", exact: true }).click()
  await expect(
    page.getByRole("heading", { level: 2, name: EXERCISE_B }),
  ).toBeVisible()

  // Discard and confirm in the dialog.
  await page.getByRole("button", { name: "Discard" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Discard" }).click()

  await expect(page).toHaveURL(/\/en\/dashboard$/)

  // The abandoned session must not resume: the day chooser greets us again.
  await page.goto("/en/workout")
  await expect(
    page.getByRole("heading", { name: "Choose a workout" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { level: 2, name: EXERCISE_B }),
  ).toHaveCount(0)
})
