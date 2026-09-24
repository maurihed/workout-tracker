import "server-only"
import { NotFoundError } from "@/lib/api-error"
import type {
  BodyMetricDTO,
  BodyMetricQuery,
  BodyMetricUpsertInput,
} from "@/features/profile/schemas/body-metric"
import * as bodyMetricRepository from "@/server/repositories/body-metric.repository"

function toDTO(row: bodyMetricRepository.BodyMetricRecord): BodyMetricDTO {
  return {
    id: row.id,
    recordedOn: row.recordedOn.toISOString(),
    weightKg: row.weightKg,
    bodyFatPct: row.bodyFatPct,
  }
}

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

export async function listBodyMetrics(userId: string, query: BodyMetricQuery) {
  const rows = await bodyMetricRepository.listByUser(userId, {
    ...(query.from ? { from: utcMidnight(query.from) } : {}),
    ...(query.to ? { to: new Date(`${query.to}T23:59:59.999Z`) } : {}),
  })
  return rows.map(toDTO)
}

export async function upsertBodyMetric(userId: string, input: BodyMetricUpsertInput) {
  const { recordedOn, ...values } = input
  const row = await bodyMetricRepository.upsertForUser(userId, utcMidnight(recordedOn), values)
  return toDTO(row)
}

export async function deleteBodyMetric(userId: string, id: string): Promise<void> {
  const { count } = await bodyMetricRepository.deleteForUser(userId, id)
  if (count === 0) throw new NotFoundError("Body metric not found")
}
