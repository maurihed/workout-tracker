import "server-only"

import { prisma } from "@/lib/prisma"

export type ConsumeResult = { allowed: boolean; remaining: number }

export async function consumeRateLimit(input: {
  key: string
  limit: number
  windowMs: number
  now?: Date
}): Promise<ConsumeResult> {
  const now = input.now ?? new Date()
  const existing = await prisma.rateLimitBucket.findUnique({
    where: { key: input.key },
  })
  const inWindow =
    existing !== null &&
    now.getTime() - existing.windowStart.getTime() < input.windowMs
  const count = inWindow ? existing.count + 1 : 1
  const windowStart = inWindow ? existing.windowStart : now

  await prisma.rateLimitBucket.upsert({
    where: { key: input.key },
    create: { key: input.key, count, windowStart },
    update: { count, windowStart },
  })

  const allowed = count <= input.limit
  return { allowed, remaining: Math.max(0, input.limit - count) }
}
