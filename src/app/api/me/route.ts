import { auth } from "@/lib/auth"
import { ok } from "@/lib/api-response"
import { toApiError, UnauthorizedError } from "@/lib/api-error"
import { deleteAccount } from "@/server/services/account.service"

export async function DELETE() {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new UnauthorizedError()
    await deleteAccount(session.user.id)

    const response = ok({ deleted: true })
    response.cookies.delete("authjs.session-token")
    response.cookies.delete("__Secure-authjs.session-token")
    return response
  } catch (error) {
    return toApiError(error)
  }
}
