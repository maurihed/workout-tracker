import "dotenv/config"
import { getBoss, startAiWorker } from "../src/server/ai/queue"
import { runJob } from "../src/server/services/ai.service"

await startAiWorker((jobId) => runJob(jobId))
console.log("worker:ai started")

async function shutdown() {
  await (await getBoss()).stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
