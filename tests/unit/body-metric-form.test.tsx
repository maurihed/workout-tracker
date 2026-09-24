import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import type { BodyMetricDTO } from "@/features/profile/schemas/body-metric"
import {
  BodyMetricForm,
  BodyMetricList,
} from "@/features/progress/components/body-metric-form"
import en from "@/i18n/messages/en.json"

type FormProps = Parameters<typeof BodyMetricForm>[0]

function renderForm(overrides: Partial<FormProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn()
  const props: FormProps = {
    defaultDate: "2026-01-05",
    ...overrides,
    onSubmit,
  }
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BodyMetricForm {...props} />
    </NextIntlClientProvider>,
  )
  return { onSubmit }
}

const entries: BodyMetricDTO[] = [
  {
    id: "m1",
    recordedOn: "2026-01-05T00:00:00.000Z",
    weightKg: 80,
    bodyFatPct: 18,
  },
  {
    id: "m2",
    recordedOn: "2026-01-04T00:00:00.000Z",
    weightKg: null,
    bodyFatPct: 20,
  },
]

describe("BodyMetricForm", () => {
  it("submits a weight in the user's unit as kilograms", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.type(screen.getByLabelText(en.metrics.weight), "82.5")
    await user.click(screen.getByRole("button", { name: en.metrics.save }))

    expect(onSubmit).toHaveBeenCalledWith({
      recordedOn: "2026-01-05",
      weightKg: 82.5,
      bodyFatPct: null,
    })
  })

  it("converts an imperial weight to kilograms", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm({ unitSystem: "imperial" })

    await user.type(screen.getByLabelText(en.metrics.weight), "180")
    await user.click(screen.getByRole("button", { name: en.metrics.save }))

    expect(onSubmit).toHaveBeenCalledWith({
      recordedOn: "2026-01-05",
      weightKg: 81.6,
      bodyFatPct: null,
    })
  })

  it("requires at least one measurement", async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await user.click(screen.getByRole("button", { name: en.metrics.save }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(en.metrics.invalid)).toBeInTheDocument()
  })

  it("preloads the existing entry for the selected date", () => {
    renderForm({ entries })

    expect(screen.getByLabelText(en.metrics.weight)).toHaveValue("80")
    expect(screen.getByLabelText(en.metrics.bodyFat)).toHaveValue("18")
  })
})

describe("BodyMetricList", () => {
  it("lists entries with a delete action", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <BodyMetricList entries={entries} onDelete={onDelete} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText("80 kg")).toBeInTheDocument()
    expect(screen.getByText("18%")).toBeInTheDocument()

    await user.click(screen.getAllByRole("button", { name: /Delete/ })[0]!)
    expect(onDelete).toHaveBeenCalledWith("m1")
  })

  it("shows an empty state without entries", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <BodyMetricList entries={[]} onDelete={vi.fn()} />
      </NextIntlClientProvider>,
    )

    expect(screen.getByText(en.metrics.empty)).toBeInTheDocument()
  })
})
