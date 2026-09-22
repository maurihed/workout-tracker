export type OnboardingState = {
  onboardedAt: Date | null
  onboardingSkippedAt: Date | null
}

export function needsOnboarding(state: OnboardingState): boolean {
  return state.onboardedAt == null && state.onboardingSkippedAt == null
}

/**
 * Onboarding is complete only once a routine has been selected and
 * `onboardedAt` was written. Skipping is intentionally *not* completion: a
 * skipped user may re-enter the wizard from the dashboard CTA and finish.
 */
export function isOnboardingComplete(state: OnboardingState): boolean {
  return state.onboardedAt != null
}

/**
 * Whether the onboarding route should redirect a user out to the dashboard.
 * Only truly completed users are bounced; skipped users are admitted so the
 * "Pick your routine" CTA keeps working.
 */
export function shouldLeaveOnboarding(
  state: OnboardingState | null,
): boolean {
  return state != null && isOnboardingComplete(state)
}
