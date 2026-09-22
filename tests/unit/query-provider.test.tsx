import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useMutation } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { QueryProvider } from "@/components/query-provider"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))

function FailingMutation() {
  const mutation = useMutation({
    mutationFn: async () => {
      throw new Error("boom")
    },
  })

  return (
    <button type="button" onClick={() => mutation.mutate()}>
      trigger
    </button>
  )
}

describe("QueryProvider", () => {
  it("surfaces the localized common.error copy when a mutation fails", async () => {
    render(
      <QueryProvider>
        <FailingMutation />
      </QueryProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "trigger" }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("error"))
  })
})
