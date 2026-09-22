import "server-only"
import { prisma } from "@/lib/prisma"
import type { UpdateProfileInput } from "@/features/profile/schemas/profile"

type ProfileWriteData = {
  [K in keyof Omit<UpdateProfileInput, "onboardedAt">]-?: Exclude<
    UpdateProfileInput[K],
    undefined
  >
} & {
  onboardedAt?: Date | null
}

function toPrismaData(input: UpdateProfileInput): ProfileWriteData {
  const converted = {
    ...input,
    onboardedAt: input.onboardedAt ? new Date(input.onboardedAt) : input.onboardedAt,
  }
  return Object.fromEntries(
    Object.entries(converted).filter(([, value]) => value !== undefined),
  ) as ProfileWriteData
}

export function findByUserId(userId: string) {
  return prisma.profile.findUnique({ where: { userId } })
}

export function upsertForUser(userId: string, input: UpdateProfileInput) {
  const data = toPrismaData(input)
  return prisma.profile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
}
