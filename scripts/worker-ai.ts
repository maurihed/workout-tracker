import "dotenv/config"
import * as Sentry from "@sentry/node"
import { getBoss, startAiWorker } from "../src/server/ai/queue"
import { runJob } from "../src/server/services/ai.service"

const dsn = process.env.SENTRY_DSN?.trim()
if (dsn) {
  Sentry.init({ dsn, environment: process.env.NODE_ENV })
}

function report(error: unknown) {
  console.error(error)
  if (dsn) Sentry.captureException(error)
}

process.on("uncaughtException", async (error) => {
  console.error(error)
  if (dsn) {
    Sentry.captureException(error)
    await Sentry.flush(2000).catch(() => undefined)
  }
  process.exit(1)
})
process.on("unhandledRejection", async (reason) => {
  report(reason)
  if (dsn) await Sentry.flush(2000).catch(() => undefined)
})

await startAiWorker((jobId) => runJob(jobId))
console.log("ai worker started")

async function shutdown() {
  const boss = await getBoss()
  await boss.stop()
  process.exit(0)
}

process.on("SIGINT", () => void shutdown())
process.on("SIGTERM", () => void shutdown())
