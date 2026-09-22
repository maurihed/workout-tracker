import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { createAsync } = vi.hoisted(() => ({
  createAsync: vi.fn(async () => ({ id: "r1", name: "Full Body 3x" })),
}))

const templates = vi.hoisted(() => ({
  value: undefined as unknown,
}))

vi.mock("@/features/routines/hooks/use-routine-templates", () => ({
  useRoutineTemplates: () => templates.value,
}))
vi.mock("@/features/routines/hooks/use-create-from-template", () => ({
  useCreateFromTemplate: () => ({ mutateAsync: createAsync, isPending: false }),
}))

const localeMock = vi.hoisted(() => ({ value: "en" }))
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => localeMock.value,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { TemplatePickStep } from "@/features/onboarding/components/template-pick-step"

const TEMPLATE = {
  slug: "full-body-3x",
  name: "Full Body 3x",
  nameEs: "Cuerpo Completo 3x",
  description: "Three full-body sessions a week.",
  descriptionEs: "Tres sesiones de cuerpo completo.",
  daysPerWeek: 3,
  score: 9,
  recommended: true,
}

beforeEach(() => {
  localeMock.value = "en"
  createAsync.mockClear()
  templates.value = {
    data: [TEMPLATE],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }
})

describe("TemplatePickStep", () => {
  it("creates a routine from the chosen template and reports it", async () => {
    const onPicked = vi.fn()
    render(<TemplatePickStep onPicked={onPicked} />)
    await userEvent.click(screen.getByRole("button", { name: /full body 3x/i }))
    expect(createAsync).toHaveBeenCalledWith("full-body-3x")
    expect(onPicked).toHaveBeenCalled()
  })

  it("renders localized names and descriptions for the es locale", () => {
    localeMock.value = "es"
    render(<TemplatePickStep onPicked={vi.fn()} />)
    expect(screen.getByText("Cuerpo Completo 3x")).toBeInTheDocument()
    expect(screen.getByText("Tres sesiones de cuerpo completo.")).toBeInTheDocument()
    expect(screen.queryByText("Full Body 3x")).not.toBeInTheDocument()
  })

  it("shows a retryable error state when the templates query fails", async () => {
    const refetch = vi.fn()
    templates.value = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    }
    render(<TemplatePickStep onPicked={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "error" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "retry" }))
    expect(refetch).toHaveBeenCalled()
  })

  it("shows an empty state when there are no templates", () => {
    templates.value = {
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }
    render(<TemplatePickStep onPicked={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "empty" })).toBeInTheDocument()
  })
})
