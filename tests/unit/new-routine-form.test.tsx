import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const push = vi.hoisted(() => vi.fn())
const create = vi.hoisted(() => vi.fn(async () => ({ id: "r9" })))
const createFromTemplate = vi.hoisted(() => vi.fn(async () => ({ id: "r10" })))
const templates = vi.hoisted(() => ({
  value: [] as {
    slug: string
    name: string
    nameEs: string
    description: string
    descriptionEs: string
    daysPerWeek: number
    score: number
    recommended: boolean
  }[],
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("@/features/routines/hooks/use-create-routine", () => ({
  useCreateRoutine: () => ({ mutateAsync: create, isPending: false }),
}))
vi.mock("@/features/routines/hooks/use-routine-templates", () => ({
  useRoutineTemplates: () => ({ data: templates.value, isLoading: false }),
}))
vi.mock("@/features/routines/hooks/use-create-from-template", () => ({
  useCreateFromTemplate: () => ({
    mutateAsync: createFromTemplate,
    isPending: false,
  }),
}))

import { NewRoutineForm } from "@/features/routines/components/new-routine-form"

beforeEach(() => {
  push.mockClear()
  create.mockClear()
  createFromTemplate.mockClear()
  templates.value = []
})

describe("NewRoutineForm", () => {
  it("creates a blank routine and navigates to the editor", async () => {
    render(<NewRoutineForm />)
    await userEvent.type(screen.getByLabelText(/name/i), "My Plan")
    await userEvent.click(
      screen.getByRole("button", { name: /create\s*blank|^create$/i }),
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Plan" }),
    )
    expect(push).toHaveBeenCalledWith("/en/routines/r9")
  })

  it("creates a routine from a template and navigates to the editor", async () => {
    templates.value = [
      {
        slug: "full-body-3x",
        name: "Full Body 3x",
        nameEs: "",
        description: "",
        descriptionEs: "",
        daysPerWeek: 3,
        score: 1,
        recommended: true,
      },
    ]
    render(<NewRoutineForm />)
    await userEvent.click(
      screen.getByRole("button", { name: /Full Body 3x/ }),
    )
    expect(createFromTemplate).toHaveBeenCalledWith("full-body-3x")
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/en/routines/r10"),
    )
  })
})
