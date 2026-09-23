import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { routineInputSchema } from "@/features/routines/schemas/routine"
import { deleteRoutine, getRoutine, replaceRoutine } from "@/server/services/routine.service"

export async function GET(_request: Request, ctx: RouteContext<"/api/routines/[routineId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { routineId } = await ctx.params
    return ok(await getRoutine(session.user.id, routineId))
  } catch (error) {
    return toApiError(error)
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/routines/[routineId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { routineId } = await ctx.params
    const parsed = routineInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid routine", parsed.error.flatten())
    return ok(await replaceRoutine(session.user.id, routineId, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/routines/[routineId]">) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const { routineId } = await ctx.params
    await deleteRoutine(session.user.id, routineId)
    return ok({ deleted: true })
  } catch (error) {
    return toApiError(error)
  }
}
