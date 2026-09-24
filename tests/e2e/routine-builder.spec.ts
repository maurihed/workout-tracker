import { expect, test } from "@playwright/test"

import {
  cleanupTestUser,
  createTestSession,
  disconnectTestDb,
} from "./helpers/session"

const email = `e2e_builder_${Date.now()}@e2e-test.local`

test.afterAll(async () => {
  await cleanupTestUser(email)
  await disconnectTestDb()
})

test("builds a routine, activates it, then duplicates and deletes", async ({
  page,
  context,
}) => {
  // The builder lives under the `(app)` gate, so the session must be onboarded.
  const { cookie } = await createTestSession(email, { onboarded: true })
  await context.addCookies([{ ...cookie, domain: "127.0.0.1", path: "/" }])

  // Build from scratch: create a blank routine and land on its editor.
  await page.goto("/en/routines/new")
  await page.getByLabel("Routine name").fill("E2E Plan")
  await page.getByRole("button", { name: "Create blank routine" }).click()
  await expect(page).toHaveURL(/\/en\/routines\/[^/]+$/)

  // Add a day, then open the exercise picker for it.
  await page.getByRole("button", { name: "Add day" }).click()
  await page.getByRole("link", { name: "Add exercise" }).click()
  await expect(page).toHaveURL(/\/en\/routines\/[^/]+\/picker\?day=/)

  // Pick two exercises and add them to the day.
  await expect(page.getByRole("checkbox").first()).toBeVisible()
  await page.getByRole("checkbox").nth(0).check()
  await page.getByRole("checkbox").nth(1).check()
  await page.getByRole("button", { name: /Add \d+ exercise/ }).click()

  await expect(page).toHaveURL(/\/en\/routines\/[^/]+$/)
  await expect(page.getByRole("button", { name: "Add set" })).toHaveCount(2)
  const repsInputs = page.getByLabel(/\.reps$/)
  await expect(repsInputs).toHaveCount(6)

  await repsInputs.first().fill("12")
  await page.getByRole("button", { name: "Add set" }).first().click()
  await expect(repsInputs).toHaveCount(7)
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Routine saved")).toBeVisible()

  // Activate it and confirm the dashboard surfaces it.
  await page.goto("/en/routines")
  await page.getByRole("button", { name: "Activate" }).first().click()
  await expect(page.getByText("Active", { exact: true })).toBeVisible()
  await page.goto("/en/dashboard")
  await expect(page.getByText("E2E Plan", { exact: true })).toBeVisible()

  // Duplicate: a copy with the "(copy)" suffix appears in the list.
  await page.goto("/en/routines")
  await page.getByRole("button", { name: "Duplicate" }).first().click()
  await expect(page.getByText(/E2E Plan \(copy\)/i)).toBeVisible()
  await expect(page.getByText("E2E Plan", { exact: true })).toBeVisible()

  // Delete the original (not the copy); both actions share the "Delete" label.
  const originalCard = page
    .getByRole("listitem")
    .filter({ has: page.getByText("E2E Plan", { exact: true }) })
  await originalCard.getByRole("button", { name: "Delete" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page.getByText("E2E Plan", { exact: true })).toHaveCount(0)
  await expect(page.getByText(/E2E Plan \(copy\)/i)).toBeVisible()
})
