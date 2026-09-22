import "server-only"
import { NotFoundError } from "@/lib/api-error"
import type { UpdateProfileInput } from "@/features/profile/schemas/profile"
import * as profileRepository from "@/server/repositories/profile.repository"

export async function getProfile(userId: string) {
  const profile = await profileRepository.findByUserId(userId)
  if (!profile) throw new NotFoundError("Profile not found")
  return profile
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  return profileRepository.upsertForUser(userId, input)
}
