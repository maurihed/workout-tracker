import { PgBoss } from "pg-boss"

export const AI_QUEUE = "ai-routine"

export type AiJobData = {
  jobId: string
}

export type AiJobHandler = (jobId: string) => Promise<void>

let bossPromise: Promise<PgBoss> | undefined
let queuePromise: Promise<void> | undefined

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set")
  }
  return url
}

async function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: databaseUrl(),
    schema: "pgboss",
  })
  return boss.start()
}

export function getBoss(): Promise<PgBoss> {
  bossPromise ??= startBoss().catch((error: unknown) => {
    bossPromise = undefined
    throw error
  })
  return bossPromise
}

async function ensureQueue(boss: PgBoss): Promise<void> {
  queuePromise ??= boss.createQueue(AI_QUEUE).catch((error: unknown) => {
    queuePromise = undefined
    throw error
  })
  return queuePromise
}

export async function enqueueAiJob(jobId: string): Promise<void> {
  const boss = await getBoss()
  await ensureQueue(boss)
  await boss.send(AI_QUEUE, { jobId })
}

export async function startAiWorker(handler: AiJobHandler): Promise<void> {
  const boss = await getBoss()
  await ensureQueue(boss)
  await boss.work<AiJobData>(AI_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await handler(job.data.jobId)
    }
  })
}
