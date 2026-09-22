import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { exportUserData } from "@/server/services/account.service"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    const document = await exportUserData(session.user.id)
    const filename = `gym-tracker-export-${document.exportedAt.slice(0, 10)}.json`
    return ok(document, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    return toApiError(error)
  }
}
