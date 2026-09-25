import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { AI_MOCK_MODEL, AI_MOCK_PORT, startAiMockServer } from "./ai-mock-server"

export const AI_E2E_STATE_PATH = path.join(tmpdir(), "gym-ai-e2e-state.json")

const WORKER_READY = "worker:ai started"
const WORKER_TIMEOUT_MS = 30_000

function killProcessTree(pid: number | undefined) {
  if (pid == null) return
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // already exited
    }
  }
}

function waitForWorkerReady(worker: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`AI worker did not start within ${WORKER_TIMEOUT_MS}ms`))
    }, WORKER_TIMEOUT_MS)

    worker.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      process.stdout.write(text)
      if (text.includes(WORKER_READY)) {
        clearTimeout(timer)
        resolve()
      }
    })
    worker.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk.toString())
    })
    worker.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`AI worker exited before becoming ready (code ${code})`))
    })
  })
}

export default async function globalSetup() {
  const workerScript = path.join(process.cwd(), "scripts", "worker-ai.ts")
  if (!existsSync(workerScript)) {
    throw new Error(
      `AI E2E worker script not found at ${workerScript}; run "pnpm e2e" from the repo root`,
    )
  }

  const server = await startAiMockServer(AI_MOCK_PORT)

  const worker = spawn(
    "pnpm",
    ["tsx", "--tsconfig", "scripts/tsconfig.json", "scripts/worker-ai.ts"],
    {
      cwd: process.cwd(),
      detached: true,
      env: {
        ...process.env,
        AI_BASE_URL: `http://127.0.0.1:${AI_MOCK_PORT}`,
        AI_MODEL: AI_MOCK_MODEL,
        AI_API_KEY: "e2e",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  try {
    await waitForWorkerReady(worker)
  } catch (error) {
    killProcessTree(worker.pid)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    throw error
  }

  await fs.writeFile(
    AI_E2E_STATE_PATH,
    JSON.stringify({ workerPid: worker.pid }),
  )

  return async () => {
    killProcessTree(worker.pid)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fs.rm(AI_E2E_STATE_PATH, { force: true })
  }
}
