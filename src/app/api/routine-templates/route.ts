import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { getProfile } from "@/server/services/profile.service"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"
import { recommendTemplates } from "@/features/onboarding/lib/recommend-templates"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const profile = await getProfile(session.user.id)
    const templates = recommendTemplates(
      {
        goal: profile.goal,
        experience: profile.experience,
        location: profile.location,
        daysPerWeek: profile.daysPerWeek,
        equipment: profile.equipment,
      },
      ROUTINE_TEMPLATES,
    ).map(({ template, score, recommended }) => ({ ...template, score, recommended }))
    return ok({ templates })
  } catch (error) {
    return toApiError(error)
  }
}
