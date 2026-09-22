export type OnboardingState = {
  onboardedAt: Date | null
  onboardingSkippedAt: Date | null
}

export function needsOnboarding(state: OnboardingState): boolean {
  return state.onboardedAt == null && state.onboardingSkippedAt == null
}
