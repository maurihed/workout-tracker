import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { duplicateRoutine } from "@/server/services/routine.service"

function readLocale(request: Request): string {
  const fromQuery = new URL(request.url).searchParams.get("locale")
  if (fromQuery) return fromQuery
  const fromHeader = request.headers.get("accept-language")?.split(",")[0]?.trim()
  return fromHeader ? fromHeader.slice(0, 2).toLowerCase() : "en"
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/routines/[routineId]/duplicate">,
) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { routineId } = await ctx.params
    return ok(await duplicateRoutine(session.user.id, routineId, readLocale(request)), {
      status: 201,
    })
  } catch (error) {
    return toApiError(error)
  }
}
