import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { Disclaimer } from "@/features/ai/components/disclaimer"
import { JobProgress } from "@/features/ai/components/job-progress"
import { RoutinePreviewCard } from "@/features/ai/components/routine-preview-card"
import type { AiJobResult } from "@/features/ai/lib/contract"
import type { AiJobStatus } from "@/features/ai/schemas/job"
import en from "@/i18n/messages/en.json"

function withProvider(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {node}
    </NextIntlClientProvider>,
  )
}

const result: AiJobResult = {
  source: "ai",
  customNames: ["Handstand Push-up"],
  personalized: false,
  personalizedCount: 0,
  personalizationVersion: "1",
  routine: {
    name: "Upper Strength",
    goal: "get_stronger",
    days: [
      {
        weekday: 1,
        label: "Push",
        exercises: [
          {
            sourceId: "barbell-bench-press",
            name: "Bench Press",
            sets: 4,
            reps: "6-8",
            restSeconds: 120,
            targetWeightKg: null,
            timerType: "none",
            workSeconds: null,
            rounds: null,
            exerciseId: "x1",
            customName: null,
          },
          {
            sourceId: null,
            name: "Handstand Push-up",
            sets: 3,
            reps: "5",
            restSeconds: 90,
            targetWeightKg: null,
            timerType: "none",
            workSeconds: null,
            rounds: null,
            exerciseId: null,
            customName: "Handstand Push-up",
            instructions: [
              "Kick up into a handstand with your back to a wall.",
              "Lower until your head nearly touches the floor, then press back up.",
            ],
          },
        ],
      },
    ],
  },
}

const noop = () => undefined

const STATUSES: AiJobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]

describe("JobProgress", () => {
  it.each(STATUSES)("renders the %s status copy", (status) => {
    withProvider(<JobProgress status={status} />)
    expect(screen.getByText(en.ai.status[status])).toBeInTheDocument()
  })

  it("offers a cancel action while running", async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    withProvider(<JobProgress status="running" onCancel={onCancel} />)

    await user.click(screen.getByRole("button", { name: en.common.cancel }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("hides the cancel action once the job is finished", () => {
    withProvider(<JobProgress status="succeeded" />)
    expect(
      screen.queryByRole("button", { name: en.common.cancel }),
    ).not.toBeInTheDocument()
  })

  it("shows a generic error when a job failed", () => {
    withProvider(<JobProgress status="failed" error="boom" />)
    expect(screen.getByText(en.ai.errors.generic)).toBeInTheDocument()
  })

  it("shows the unavailable message for a provider outage", () => {
    withProvider(
      <JobProgress status="failed" error="AI provider unavailable" />,
    )
    expect(screen.getByText(en.ai.errors.unavailable)).toBeInTheDocument()
  })
})

describe("RoutinePreviewCard", () => {
  it("renders the routine name, day and exercises with prescription", () => {
    withProvider(
      <RoutinePreviewCard
        result={result}
        onAccept={noop}
        onRegenerate={noop}
        onDiscard={noop}
      />,
    )

    expect(screen.getByText("Upper Strength")).toBeInTheDocument()
    expect(screen.getByText("Push")).toBeInTheDocument()
    expect(screen.getByText("Bench Press")).toBeInTheDocument()
    expect(screen.getByText("4 × 6-8 · 120s rest")).toBeInTheDocument()
  })

  it("falls back to the weekday name when a day has no label", () => {
    const unlabeled: AiJobResult = {
      ...result,
      routine: {
        ...result.routine,
        days: [{ ...result.routine.days[0]!, label: null }],
      },
    }

    withProvider(
      <RoutinePreviewCard
        result={unlabeled}
        onAccept={noop}
        onRegenerate={noop}
        onDiscard={noop}
      />,
    )

    expect(screen.getByText("Monday")).toBeInTheDocument()
  })

  it("marks a custom exercise and shows the disclaimer", () => {
    withProvider(
      <RoutinePreviewCard
        result={result}
        onAccept={noop}
        onRegenerate={noop}
        onDiscard={noop}
      />,
    )

    expect(screen.getByText("Handstand Push-up")).toBeInTheDocument()
    expect(screen.getByText(en.ai.preview.customNote)).toBeInTheDocument()
    expect(screen.getByText(en.ai.preview.howTo)).toBeInTheDocument()
    expect(
      screen.getByText("Kick up into a handstand with your back to a wall."),
    ).toBeInTheDocument()
    expect(screen.getByText(en.ai.disclaimer)).toBeInTheDocument()
  })

  it("shows the template notice for a fallback routine", () => {
    withProvider(
      <RoutinePreviewCard
        result={{ ...result, source: "template" }}
        onAccept={noop}
        onRegenerate={noop}
        onDiscard={noop}
      />,
    )

    expect(screen.getByText(en.ai.preview.template)).toBeInTheDocument()
  })

  it("shows AI provenance with the model and prompt version", () => {
    withProvider(
      <RoutinePreviewCard
        result={result}
        model="gpt-4o-mini"
        promptVersion="v3"
        onAccept={noop}
        onRegenerate={noop}
        onDiscard={noop}
      />,
    )

    expect(
      screen.getByText("Generated by AI (gpt-4o-mini)"),
    ).toBeInTheDocument()
    expect(screen.getByText("v3")).toBeInTheDocument()
  })

  it("shows the personalized note only when personalized", () => {
    const { rerender } = withProvider(
      <RoutinePreviewCard
        result={{ ...result, personalized: true }}
        onAccept={noop}
        onRegenerate={noop}
        onDiscard={noop}
        isAccepting={false}
      />,
    )
    expect(screen.getByText(en.ai.preview.personalized)).toBeInTheDocument()
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <RoutinePreviewCard
          result={{ ...result, personalized: false }}
          onAccept={noop}
          onRegenerate={noop}
          onDiscard={noop}
          isAccepting={false}
        />
      </NextIntlClientProvider>,
    )
    expect(
      screen.queryByText(en.ai.preview.personalized),
    ).not.toBeInTheDocument()
  })

  it("fires accept, regenerate and discard", async () => {
    const user = userEvent.setup()
    const onAccept = vi.fn()
    const onRegenerate = vi.fn()
    const onDiscard = vi.fn()

    withProvider(
      <RoutinePreviewCard
        result={result}
        onAccept={onAccept}
        onRegenerate={onRegenerate}
        onDiscard={onDiscard}
      />,
    )

    await user.click(screen.getByRole("button", { name: en.ai.preview.accept }))
    await user.click(
      screen.getByRole("button", { name: en.ai.preview.regenerate }),
    )
    await user.click(
      screen.getByRole("button", { name: en.ai.preview.discard }),
    )

    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onRegenerate).toHaveBeenCalledTimes(1)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})

describe("Disclaimer", () => {
  it("always renders the disclaimer copy", () => {
    withProvider(<Disclaimer />)
    expect(screen.getByText(en.ai.disclaimer)).toBeInTheDocument()
  })

  it("renders the data-sharing disclosure", () => {
    withProvider(<Disclaimer />)
    expect(screen.getByText(en.ai.disclaimerData)).toBeInTheDocument()
  })
})
