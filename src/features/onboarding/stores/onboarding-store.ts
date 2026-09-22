"use client"
import { create } from "zustand"

type Answers = Record<string, unknown>

type OnboardingState = {
  stepIndex: number
  answers: Answers
  setAnswer: (key: string, value: unknown) => void
  goNext: () => void
  goBack: () => void
  reset: (firstStepId: string) => void
}

const ORDER = [
  "goal",
  "experience",
  "equipment",
  "schedule",
  "preferences",
  "metrics",
  "template",
]

export const useOnboardingStore = create<OnboardingState>((set) => ({
  stepIndex: 0,
  answers: {},
  setAnswer: (key, value) =>
    set((s) => ({ answers: { ...s.answers, [key]: value } })),
  goNext: () =>
    set((s) => ({ stepIndex: Math.min(s.stepIndex + 1, ORDER.length - 1) })),
  goBack: () => set((s) => ({ stepIndex: Math.max(s.stepIndex - 1, 0) })),
  reset: (firstStepId) =>
    set({ stepIndex: Math.max(ORDER.indexOf(firstStepId), 0), answers: {} }),
}))
