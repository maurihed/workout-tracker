import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { createJob, listJobs } from "@/server/services/ai.service"
import { toAiJobDTO } from "@/features/ai/schemas/job"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const jobs = await listJobs(session.user.id)
    return ok(jobs.map(toAiJobDTO))
  } catch (error) {
    return toApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError("Invalid JSON body")
    }

    const job = await createJob(session.user.id, body)
    return ok(toAiJobDTO(job), { status: 202 })
  } catch (error) {
    return toApiError(error)
  }
}
