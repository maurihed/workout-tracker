import "server-only"
import { prisma } from "@/lib/prisma"
import { NotFoundError } from "@/lib/api-error"

export type ExportDocument = {
  exportedAt: string
  user: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  }
  profile: unknown
  routines: unknown[]
}

export async function exportUserData(userId: string): Promise<ExportDocument> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      profile: true,
    },
  })
  if (!user) throw new NotFoundError("User not found")
  const { profile, ...rest } = user
  return {
    exportedAt: new Date().toISOString(),
    user: rest,
    profile,
    routines: [],
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  const result = await prisma.user.deleteMany({ where: { id: userId } })
  if (result.count === 0) throw new NotFoundError("User not found")
}
