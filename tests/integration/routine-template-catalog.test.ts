import { describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"

describe("template catalog references", () => {
  it("every template sourceId exists in the seeded catalog", async () => {
    const ids = [...new Set(ROUTINE_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((e) => e.sourceId))))]
    const found = await prisma.exercise.findMany({ where: { sourceId: { in: ids } }, select: { sourceId: true } })
    const foundSet = new Set(found.map((f) => f.sourceId))
    const missing = ids.filter((id) => !foundSet.has(id))
    expect(missing).toEqual([])
  })
})
