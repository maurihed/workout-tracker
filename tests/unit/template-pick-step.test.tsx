import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const createAsync = vi.fn(async () => ({ id: "r1", name: "Full Body 3x" }))
vi.mock("@/features/routines/hooks/use-routine-templates", () => ({
  useRoutineTemplates: () => ({
    data: [
      {
        slug: "full-body-3x",
        name: "Full Body 3x",
        nameEs: "Cuerpo Completo 3x",
        description: "d",
        descriptionEs: "d",
        daysPerWeek: 3,
        score: 9,
        recommended: true,
      },
    ],
    isLoading: false,
  }),
}))
vi.mock("@/features/routines/hooks/use-create-from-template", () => ({
  useCreateFromTemplate: () => ({ mutateAsync: createAsync, isPending: false }),
}))
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))

import { TemplatePickStep } from "@/features/onboarding/components/template-pick-step"

describe("TemplatePickStep", () => {
  it("creates a routine from the chosen template and reports it", async () => {
    const onPicked = vi.fn()
    render(<TemplatePickStep onPicked={onPicked} />)
    await userEvent.click(screen.getByRole("button", { name: /full body 3x/i }))
    expect(createAsync).toHaveBeenCalledWith("full-body-3x")
    expect(onPicked).toHaveBeenCalled()
  })
})
