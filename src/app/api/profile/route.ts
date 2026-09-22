import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError, ValidationError } from "@/lib/api-error"
import { updateProfileSchema } from "@/features/profile/schemas/profile"
import { getProfile, updateProfile } from "@/server/services/profile.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    return ok(await getProfile(session.user.id))
  } catch (error) {
    return toApiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const body: unknown = await request.json().catch(() => null)
    const parsed = updateProfileSchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError("Invalid profile payload", parsed.error.flatten())
    }
    return ok(await updateProfile(session.user.id, parsed.data))
  } catch (error) {
    return toApiError(error)
  }
}
