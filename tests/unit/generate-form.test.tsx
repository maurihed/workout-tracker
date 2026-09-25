import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { GenerateForm } from "@/features/ai/components/generate-form"
import en from "@/i18n/messages/en.json"

function renderForm(onSubmit = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GenerateForm onSubmit={onSubmit} />
    </NextIntlClientProvider>,
  )
  return { onSubmit }
}

describe("GenerateForm", () => {
  it("does not submit while goal and experience are missing", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.click(screen.getByRole("button", { name: en.ai.form.submit }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits a valid generation input", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.selectOptions(
      screen.getByLabelText(en.ai.form.goal),
      "build_muscle",
    )
    await user.selectOptions(
      screen.getByLabelText(en.ai.form.experience),
      "intermediate",
    )
    await user.click(
      screen.getByRole("button", {
        name: en.onboarding.equipment.items.dumbbell,
      }),
    )
    await user.selectOptions(
      screen.getByLabelText(en.ai.form.daysPerWeek),
      "4",
    )
    await user.type(screen.getByLabelText(en.ai.form.focus), "upper body")
    await user.click(screen.getByRole("button", { name: en.ai.form.submit }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      goal: "build_muscle",
      experience: "intermediate",
      equipment: ["dumbbell"],
      daysPerWeek: 4,
      focus: "upper body",
      personalize: true,
    })
  })

  it("toggles an equipment selection on and off", async () => {
    const user = userEvent.setup()
    renderForm()

    const dumbbell = screen.getByRole("button", {
      name: en.onboarding.equipment.items.dumbbell,
    })
    expect(dumbbell).toHaveAttribute("aria-pressed", "false")

    await user.click(dumbbell)
    expect(dumbbell).toHaveAttribute("aria-pressed", "true")

    await user.click(dumbbell)
    expect(dumbbell).toHaveAttribute("aria-pressed", "false")
  })
})
