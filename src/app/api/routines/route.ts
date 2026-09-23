import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { createRoutineSchema } from "@/features/routines/schemas/routine"
import { createBlankRoutine, listRoutines } from "@/server/services/routine.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await listRoutines(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const parsed = createRoutineSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new ValidationError("Invalid routine", parsed.error.flatten())
    return ok(await createBlankRoutine(session.user.id, parsed.data), { status: 201 })
  } catch (error) {
    return toApiError(error)
  }
}
