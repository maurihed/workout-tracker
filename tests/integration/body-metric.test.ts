import { afterEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  deleteBodyMetric,
  listBodyMetrics,
  upsertBodyMetric,
} from "@/server/services/body-metric.service"

const DOMAIN = "@body-metric-test.local"

function makeUser() {
  return prisma.user.create({
    data: { email: `bm_${Date.now()}${Math.random()}${DOMAIN}`, profile: { create: {} } },
  })
}

describe("body metric service", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
  })

  it("upserts idempotently per day, updating the same row", async () => {
    const user = await makeUser()
    const first = await upsertBodyMetric(user.id, { recordedOn: "2026-01-05", weightKg: 80 })
    const second = await upsertBodyMetric(user.id, {
      recordedOn: "2026-01-05",
      weightKg: 82,
      bodyFatPct: 18,
    })
    expect(second.id).toBe(first.id)
    expect(second.weightKg).toBe(82)
    expect(second.bodyFatPct).toBe(18)
    expect(await prisma.bodyMetric.count({ where: { userId: user.id } })).toBe(1)
  })

  it("stores recordedOn at UTC midnight and returns an ISO DTO", async () => {
    const user = await makeUser()
    const dto = await upsertBodyMetric(user.id, { recordedOn: "2026-01-05", bodyFatPct: 20 })
    expect(dto.recordedOn).toBe("2026-01-05T00:00:00.000Z")
    expect(dto.weightKg).toBeNull()
  })

  it("lists ascending and filters by from/to", async () => {
    const user = await makeUser()
    await upsertBodyMetric(user.id, { recordedOn: "2026-01-10", weightKg: 80 })
    await upsertBodyMetric(user.id, { recordedOn: "2026-01-05", weightKg: 79 })
    await upsertBodyMetric(user.id, { recordedOn: "2026-01-20", weightKg: 81 })

    const all = await listBodyMetrics(user.id, {})
    expect(all.map((m) => m.recordedOn)).toEqual([
      "2026-01-05T00:00:00.000Z",
      "2026-01-10T00:00:00.000Z",
      "2026-01-20T00:00:00.000Z",
    ])

    const windowed = await listBodyMetrics(user.id, { from: "2026-01-06", to: "2026-01-15" })
    expect(windowed.map((m) => m.recordedOn)).toEqual(["2026-01-10T00:00:00.000Z"])
  })

  it("scopes listing to the owner", async () => {
    const user = await makeUser()
    const other = await makeUser()
    await upsertBodyMetric(other.id, { recordedOn: "2026-01-05", weightKg: 80 })
    expect(await listBodyMetrics(user.id, {})).toEqual([])
  })

  it("deletes only the owner's entry", async () => {
    const user = await makeUser()
    const other = await makeUser()
    const dto = await upsertBodyMetric(user.id, { recordedOn: "2026-01-05", weightKg: 80 })

    await expect(deleteBodyMetric(other.id, dto.id)).rejects.toThrow("Body metric not found")
    await deleteBodyMetric(user.id, dto.id)
    expect(await prisma.bodyMetric.count({ where: { userId: user.id } })).toBe(0)
  })

  it("throws 404 deleting a missing entry", async () => {
    const user = await makeUser()
    await expect(deleteBodyMetric(user.id, "missing")).rejects.toThrow("Body metric not found")
  })
})
