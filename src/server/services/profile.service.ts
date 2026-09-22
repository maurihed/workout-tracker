import "server-only"
import { NotFoundError } from "@/lib/api-error"
import { logger } from "@/lib/logger"
import type { UpdateProfileInput } from "@/features/profile/schemas/profile"
import * as profileRepository from "@/server/repositories/profile.repository"

export async function getProfile(userId: string) {
  const profile = await profileRepository.findByUserId(userId)
  if (!profile) throw new NotFoundError("Profile not found")
  return profile
}

export async function getProfileOrNull(userId: string) {
  return profileRepository.findByUserId(userId)
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const profile = await profileRepository.upsertForUser(userId, input)
  if (input.onboardingSkippedAt) {
    logger.info({ event: "onboarding.skipped", userId }, "onboarding skipped")
  } else if (
    input.goal ||
    input.experience ||
    input.location ||
    input.equipment ||
    input.daysPerWeek
  ) {
    logger.info({ event: "onboarding.step_saved", userId }, "onboarding step saved")
  }
  return profile
}
