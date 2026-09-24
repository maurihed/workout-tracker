import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { deleteBodyMetric } from "@/server/services/body-metric.service"

export async function DELETE(_request: Request, ctx: RouteContext<"/api/body-metrics/[id]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { id } = await ctx.params
    await deleteBodyMetric(session.user.id, id)
    return ok({ deleted: true })
  } catch (error) {
    return toApiError(error)
  }
}
