import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import type { RoutineTemplate } from "@/features/onboarding/templates/routine-templates"
import { createRoutineFromTemplate, getActiveRoutine } from "@/server/services/routine.service"
import { assertCatalogSeeded } from "./helpers/catalog"

const override = vi.hoisted(() => ({ template: undefined as unknown }))

vi.mock("@/features/onboarding/templates/routine-templates", async () => {
  const actual =
    await vi.importActual<typeof import("@/features/onboarding/templates/routine-templates")>(
      "@/features/onboarding/templates/routine-templates",
    )
  return {
    ...actual,
    getTemplateBySlug: (slug: string) =>
      (override.template as RoutineTemplate | undefined) ?? actual.getTemplateBySlug(slug),
  }
})

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `rs_${Date.now()}${Math.random()}@routine-service-test.local`,
      profile: { create: {} },
    },
  })
}

describe("routine service", () => {
  beforeAll(assertCatalogSeeded)

  afterEach(async () => {
    override.template = undefined
    await prisma.user.deleteMany({
      where: { email: { endsWith: "@routine-service-test.local" } },
    })
  })

  it("creates an active routine and sets onboardedAt", async () => {
    const user = await makeUser()
    const routine = await createRoutineFromTemplate(user.id, "full-body-3x")
    expect(routine.days).toHaveLength(3)
    expect(routine.source).toBe("template")
    expect(routine.nameEs).toBe("Cuerpo Completo 3x")
    expect(routine.descriptionEs).toBeTruthy()
    const active = await getActiveRoutine(user.id)
    expect(active?.id).toBe(routine.id)
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })
    expect(profile.onboardedAt).not.toBeNull()
  })

  it("keeps exactly one active routine when called again", async () => {
    const user = await makeUser()
    await createRoutineFromTemplate(user.id, "full-body-3x")
    await createRoutineFromTemplate(user.id, "bodyweight-3x")
    const activeCount = await prisma.routine.count({
      where: { userId: user.id, isActive: true },
    })
    expect(activeCount).toBe(1)
    expect((await getActiveRoutine(user.id))?.name).toContain("Bodyweight")
  })

  it("throws NotFound for an unknown slug", async () => {
    const user = await makeUser()
    await expect(createRoutineFromTemplate(user.id, "does-not-exist")).rejects.toThrow(
      "Template not found",
    )
    expect(await prisma.routine.count({ where: { userId: user.id } })).toBe(0)
  })

  it("fails closed with no partial routine when a template exercise is missing", async () => {
    const user = await makeUser()
    override.template = {
      slug: "bogus-1x",
      name: "Bogus 1x",
      nameEs: "Falso 1x",
      description: "References an exercise that is not in the catalog.",
      descriptionEs: "Referencia un ejercicio que no está en el catálogo.",
      goal: "general_fitness",
      level: "beginner",
      location: "both",
      equipment: [],
      daysPerWeek: 1,
      days: [
        {
          weekday: 1,
          label: "Bogus A",
          exercises: [
            { sourceId: "Definitely_Not_A_Real_Exercise", sets: 3, reps: "10", restSeconds: 60 },
          ],
        },
      ],
    }

    await expect(createRoutineFromTemplate(user.id, "bogus-1x")).rejects.toThrow("unknown exercises")
    expect(await prisma.routine.count({ where: { userId: user.id } })).toBe(0)
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } })
    expect(profile.onboardedAt).toBeNull()
  })
})
