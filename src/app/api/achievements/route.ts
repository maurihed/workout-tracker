import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getAchievements } from "@/server/services/stats.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getAchievements(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}
