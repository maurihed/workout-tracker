import { promises as fs } from "node:fs"

import { AI_E2E_STATE_PATH } from "./ai-global-setup"

function killProcessTree(pid: number) {
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

export default async function globalTeardown() {
  let workerPid: number | undefined
  try {
    const raw = await fs.readFile(AI_E2E_STATE_PATH, "utf8")
    workerPid = (JSON.parse(raw) as { workerPid?: number }).workerPid
  } catch {
    return
  }

  if (workerPid != null) killProcessTree(workerPid)
  await fs.rm(AI_E2E_STATE_PATH, { force: true })
}
