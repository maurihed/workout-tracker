import type { Prisma, PrismaClient } from "../../src/generated/prisma/client"
import {
  ACHIEVEMENTS,
  type AchievementDefinition,
} from "../../src/features/gamification/lib/achievements"

export function toAchievementRow(def: AchievementDefinition) {
  return {
    slug: def.slug,
    name: def.name,
    nameEs: def.nameEs,
    description: def.description,
    descriptionEs: def.descriptionEs,
    icon: def.icon,
    criteria: def.criteria as unknown as Prisma.InputJsonValue,
    xpReward: def.xpReward,
    order: def.order,
  }
}

export async function importAchievements(
  prisma: PrismaClient,
  definitions: AchievementDefinition[] = ACHIEVEMENTS,
) {
  for (const def of definitions) {
    const row = toAchievementRow(def)
    await prisma.achievement.upsert({ where: { slug: row.slug }, create: row, update: row })
  }
  return { upserted: definitions.length }
}
