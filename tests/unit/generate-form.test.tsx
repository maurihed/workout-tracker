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
      screen.getByRole("button", { name: en.ai.form.locations.home }),
    )
    await user.click(
      screen.getByRole("button", {
        name: en.onboarding.equipment.items.dumbbell,
      }),
    )
    await user.selectOptions(screen.getByLabelText(en.ai.form.daysPerWeek), "4")
    await user.type(screen.getByLabelText(en.ai.form.focus), "upper body")
    await user.click(screen.getByRole("button", { name: en.ai.form.submit }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      goal: "build_muscle",
      experience: "intermediate",
      location: "home",
      equipment: ["dumbbell"],
      gymProfile: "intermediate",
      daysPerWeek: 4,
      focus: "upper body",
      personalize: true,
    })
  })

  it("shows gym equipment levels by default and hides the equipment picker", () => {
    renderForm()

    expect(
      screen.getByRole("button", {
        name: new RegExp(en.ai.form.gymProfiles.basic),
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: en.onboarding.equipment.items.dumbbell,
      }),
    ).not.toBeInTheDocument()
  })

  it("swaps gym levels for the equipment picker at a home or park", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(
      screen.getByRole("button", { name: en.ai.form.locations.home }),
    )

    expect(
      screen.getByRole("button", {
        name: en.onboarding.equipment.items.dumbbell,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: new RegExp(en.ai.form.gymProfiles.basic),
      }),
    ).not.toBeInTheDocument()
  })

  it("submits the selected gym equipment level", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.selectOptions(
      screen.getByLabelText(en.ai.form.goal),
      "get_stronger",
    )
    await user.selectOptions(
      screen.getByLabelText(en.ai.form.experience),
      "advanced",
    )
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(en.ai.form.gymProfiles.fully_equipped),
      }),
    )
    await user.click(screen.getByRole("button", { name: en.ai.form.submit }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "gym",
        gymProfile: "fully_equipped",
      }),
    )
  })

  it("toggles an equipment selection on and off", async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(
      screen.getByRole("button", { name: en.ai.form.locations.home }),
    )
    const dumbbell = screen.getByRole("button", {
      name: en.onboarding.equipment.items.dumbbell,
    })
    expect(dumbbell).toHaveAttribute("aria-pressed", "false")

    await user.click(dumbbell)
    expect(dumbbell).toHaveAttribute("aria-pressed", "true")

    await user.click(dumbbell)
    expect(dumbbell).toHaveAttribute("aria-pressed", "false")
  })

  it("defaults personalization on and submits it", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    const toggle = screen.getByLabelText(en.ai.form.personalize)
    expect(toggle).toBeChecked()

    await user.selectOptions(
      screen.getByLabelText(en.ai.form.goal),
      "build_muscle",
    )
    await user.selectOptions(
      screen.getByLabelText(en.ai.form.experience),
      "beginner",
    )
    await user.selectOptions(screen.getByLabelText(en.ai.form.daysPerWeek), "3")
    await user.click(screen.getByRole("button", { name: en.ai.form.submit }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ personalize: true }),
    )
  })

  it("submits personalize false when toggled off", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.click(screen.getByLabelText(en.ai.form.personalize))
    await user.selectOptions(
      screen.getByLabelText(en.ai.form.goal),
      "build_muscle",
    )
    await user.selectOptions(
      screen.getByLabelText(en.ai.form.experience),
      "beginner",
    )
    await user.selectOptions(screen.getByLabelText(en.ai.form.daysPerWeek), "3")
    await user.click(screen.getByRole("button", { name: en.ai.form.submit }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ personalize: false }),
    )
  })
})
