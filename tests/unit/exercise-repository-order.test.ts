import { beforeEach, describe, expect, it, vi } from "vitest"

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { exercise: { findMany } },
}))

import * as exerciseRepository from "@/server/repositories/exercise.repository"

describe("exercise repository ordering", () => {
  beforeEach(() => {
    findMany.mockClear()
  })

  it("orders by name with id as a deterministic tiebreaker", async () => {
    await exerciseRepository.list({ limit: 20 })

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls.at(0)?.[0]?.orderBy).toEqual([
      { name: "asc" },
      { id: "asc" },
    ])
  })
})
