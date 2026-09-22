import { beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { ROUTINE_TEMPLATES } from "@/features/onboarding/templates/routine-templates"
import { assertCatalogSeeded } from "./helpers/catalog"

describe("template catalog references", () => {
  beforeAll(assertCatalogSeeded)

  it("every template sourceId exists in the seeded catalog", async () => {
    const ids = [...new Set(ROUTINE_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((e) => e.sourceId))))]
    const found = await prisma.exercise.findMany({ where: { sourceId: { in: ids } }, select: { sourceId: true } })
    const foundSet = new Set(found.map((f) => f.sourceId))
    const missing = ids.filter((id) => !foundSet.has(id))
    expect(missing).toEqual([])
  })

  it("every referenced exercise's equipment is covered by its template", async () => {
    const ids = [...new Set(ROUTINE_TEMPLATES.flatMap((t) => t.days.flatMap((d) => d.exercises.map((e) => e.sourceId))))]
    const found = await prisma.exercise.findMany({
      where: { sourceId: { in: ids } },
      select: { sourceId: true, equipment: true },
    })
    const equipmentById = new Map(found.map((f) => [f.sourceId, f.equipment]))
    const violations: string[] = []
    for (const t of ROUTINE_TEMPLATES) {
      for (const d of t.days) {
        for (const e of d.exercises) {
          const equipment = equipmentById.get(e.sourceId)
          if (equipment == null || equipment === "body only") continue
          if (!t.equipment.includes(equipment)) {
            violations.push(`${t.slug}: ${e.sourceId} (${equipment}) not in [${t.equipment.join(", ")}]`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  })
})
