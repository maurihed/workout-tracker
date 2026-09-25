import "server-only"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"

export const bodyMetricSelect = {
  id: true,
  recordedOn: true,
  weightKg: true,
  bodyFatPct: true,
} satisfies Prisma.BodyMetricSelect

export type BodyMetricRecord = Prisma.BodyMetricGetPayload<{ select: typeof bodyMetricSelect }>

export async function listByUser(userId: string, range: { from?: Date; to?: Date }) {
  const recordedOn = {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  }
  const rows = await prisma.bodyMetric.findMany({
    where: { userId, ...(range.from || range.to ? { recordedOn } : {}) },
    orderBy: { recordedOn: "desc" },
    take: 730,
    select: bodyMetricSelect,
  })
  return rows.reverse()
}

export function upsertForUser(
  userId: string,
  recordedOn: Date,
  values: { weightKg?: number | null | undefined; bodyFatPct?: number | null | undefined },
) {
  const data: { weightKg?: number | null; bodyFatPct?: number | null } = {}
  if (values.weightKg !== undefined) data.weightKg = values.weightKg
  if (values.bodyFatPct !== undefined) data.bodyFatPct = values.bodyFatPct
  return prisma.bodyMetric.upsert({
    where: { userId_recordedOn: { userId, recordedOn } },
    create: { userId, recordedOn, ...data },
    update: data,
    select: bodyMetricSelect,
  })
}

export function deleteForUser(userId: string, id: string) {
  return prisma.bodyMetric.deleteMany({ where: { userId, id } })
}
