import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  createQueue: vi.fn(async () => {}),
}))

vi.mock("pg-boss", () => ({
  PgBoss: class {
    start = vi.fn(async () => this)
    createQueue = mocks.createQueue
    send = mocks.send
  },
}))

import { enqueueAiJob } from "@/server/ai/queue"

describe("enqueueAiJob", () => {
  beforeAll(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://gym:gym@localhost:5432/gym_test?schema=public")
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("resolves when pg-boss returns a job id", async () => {
    mocks.send.mockResolvedValueOnce("pgboss-id")

    await expect(enqueueAiJob("job-1")).resolves.toBeUndefined()
    expect(mocks.send).toHaveBeenCalledWith("ai-routine", { jobId: "job-1" })
  })

  it("throws when pg-boss returns null", async () => {
    mocks.send.mockResolvedValueOnce(null)

    await expect(enqueueAiJob("job-2")).rejects.toThrow(/enqueue AI job/i)
  })
})
