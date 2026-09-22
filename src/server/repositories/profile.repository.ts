import "server-only"
import { prisma } from "@/lib/prisma"
import type { UpdateProfileInput } from "@/features/profile/schemas/profile"

type ProfileWriteData = {
  [K in keyof Omit<UpdateProfileInput, "onboardedAt" | "onboardingSkippedAt">]-?: Exclude<
    UpdateProfileInput[K],
    undefined
  >
} & {
  onboardedAt?: Date | null
  onboardingSkippedAt?: Date | null
}

function toPrismaData(input: UpdateProfileInput): ProfileWriteData {
  const converted = {
    ...input,
    onboardedAt: input.onboardedAt ? new Date(input.onboardedAt) : input.onboardedAt,
    onboardingSkippedAt: input.onboardingSkippedAt
      ? new Date(input.onboardingSkippedAt)
      : input.onboardingSkippedAt,
  }
  return Object.fromEntries(
    Object.entries(converted).filter(([, value]) => value !== undefined),
  ) as ProfileWriteData
}

const profileSelect = {
  id: true,
  birthYear: true,
  heightCm: true,
  weightKg: true,
  gender: true,
  experience: true,
  goal: true,
  unitSystem: true,
  timezone: true,
  weekStartsOn: true,
  daysPerWeek: true,
  notificationsEnabled: true,
  onboardedAt: true,
  location: true,
  equipment: true,
  onboardingSkippedAt: true,
} as const

export function findByUserId(userId: string) {
  return prisma.profile.findUnique({ where: { userId }, select: profileSelect })
}

export function upsertForUser(userId: string, input: UpdateProfileInput) {
  const data = toPrismaData(input)
  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
    select: profileSelect,
  })
}
