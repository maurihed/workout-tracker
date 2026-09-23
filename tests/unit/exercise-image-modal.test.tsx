import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }))
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

import { ExerciseImageModal } from "@/features/workouts/components/exercise-image-modal"

const imagePaths = ["Barbell_Squat/0.jpg", "Barbell_Squat/1.jpg"]

function currentSrc() {
  return screen.getByRole("img").getAttribute("src")
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })),
  )
}

describe("ExerciseImageModal", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("shows the exercise name and alternates between the two frames", () => {
    render(
      <ExerciseImageModal
        open
        onOpenChange={vi.fn()}
        name="Squat"
        imagePaths={imagePaths}
      />,
    )
    expect(screen.getByText("Squat")).toBeInTheDocument()
    const first = currentSrc()
    act(() => {
      vi.advanceTimersByTime(700)
    })
    const second = currentSrc()
    expect(second).not.toBe(first)
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(currentSrc()).toBe(first)
  })

  it("pauses on tap and resumes on the next tap", () => {
    render(
      <ExerciseImageModal
        open
        onOpenChange={vi.fn()}
        name="Squat"
        imagePaths={imagePaths}
      />,
    )
    const before = currentSrc()
    fireEvent.click(screen.getByRole("button", { name: "image.pause" }))
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(currentSrc()).toBe(before)
    fireEvent.click(screen.getByRole("button", { name: "image.play" }))
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(currentSrc()).not.toBe(before)
  })

  it("stays static when reduced motion is preferred", () => {
    stubMatchMedia(true)
    render(
      <ExerciseImageModal
        open
        onOpenChange={vi.fn()}
        name="Squat"
        imagePaths={imagePaths}
      />,
    )
    const before = currentSrc()
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(currentSrc()).toBe(before)
  })

  it("stays static when only one frame exists", () => {
    render(
      <ExerciseImageModal
        open
        onOpenChange={vi.fn()}
        name="Squat"
        imagePaths={["Barbell_Squat/0.jpg"]}
      />,
    )
    const before = currentSrc()
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(currentSrc()).toBe(before)
  })
})
