import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { fromTemplateSchema } from "@/features/onboarding/schemas/onboarding"
import { createRoutineFromTemplate } from "@/server/services/routine.service"

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const body: unknown = await request.json().catch(() => null)
    const parsed = fromTemplateSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError("Invalid payload", parsed.error.flatten())
    return ok(await createRoutineFromTemplate(session.user.id, parsed.data.slug), { status: 201 })
  } catch (error) {
    return toApiError(error)
  }
}
