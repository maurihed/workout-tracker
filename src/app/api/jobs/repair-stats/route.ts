import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { repairAllStats } from "@/server/services/stats.service"

export async function POST(request: Request) {
  try {
    const secret = process.env.JOBS_SECRET
    if (!secret || request.headers.get("x-job-secret") !== secret) throw new UnauthorizedError()
    return ok(await repairAllStats())
  } catch (error) {
    return toApiError(error)
  }
}
