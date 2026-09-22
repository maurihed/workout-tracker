import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getActiveRoutine } from "@/server/services/routine.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getActiveRoutine(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}
