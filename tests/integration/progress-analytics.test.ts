import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { weekStart } from "@/features/gamification/lib/week"
import { getExerciseProgress, getOverview } from "@/server/services/progress.service"
import { assertCatalogSeeded } from "./helpers/catalog"

const DOMAIN = "@progress-analytics.local"
const SOURCE_PREFIX = `progress-test-${Date.now()}-`

function localDateUtc(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function makeUser(timezone = "UTC") {
  return prisma.user.create({
    data: {
      email: `pa_${Date.now()}${Math.random()}${DOMAIN}`,
      profile: { create: { timezone, weekStartsOn: 1 } },
    },
  })
}

function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function makeExercise(suffix: string, primaryMuscles: string[], secondaryMuscles: string[]) {
  return prisma.exercise.create({
    data: {
      sourceId: `${SOURCE_PREFIX}${suffix}`,
      name: `Progress ${suffix}`,
      nameEs: `Progreso ${suffix}`,
      primaryMuscles,
      secondaryMuscles,
      instructions: [],
      images: [],
    },
  })
}

type SeedSession = {
  userId: string
  date: string
  at?: string
  exercises: {
    exerciseId: string | null
    nameSnapshot: string
    sets: { reps: number | null; weightKg: number | null; type?: "warmup" | "working"; isPr?: boolean; completedAt?: Date | null }[]
  }[]
}

function seedSession(input: SeedSession) {
  const completedAt = new Date(input.at ?? `${input.date}T12:00:00Z`)
  return prisma.workoutSession.create({
    data: {
      userId: input.userId,
      name: "Test session",
      status: "completed",
      completedAt,
      snapshot: {},
      exercises: {
        create: input.exercises.map((exercise, index) => ({
          exerciseId: exercise.exerciseId,
          order: index,
          nameSnapshot: exercise.nameSnapshot,
          completed: true,
          sets: {
            create: exercise.sets.map((set, setIndex) => ({
              setNumber: setIndex + 1,
              type: set.type ?? "working",
              reps: set.reps,
              weightKg: set.weightKg,
              isPr: set.isPr ?? false,
              completedAt:
                set.completedAt === undefined ? completedAt : set.completedAt,
            })),
          },
        })),
      },
    },
  })
}

describe("progress analytics service", () => {
  beforeAll(assertCatalogSeeded)

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } })
    await prisma.exercise.deleteMany({ where: { sourceId: { startsWith: SOURCE_PREFIX } } })
  })

  async function seedAnalyticsData() {
    const user = await makeUser()
    const exA = await makeExercise("A", ["chest"], ["triceps"])
    const exB = await makeExercise("B", ["quadriceps"], [])
    const exC = await makeExercise("C", ["lats"], [])

    const today = localDateUtc(new Date())
    const thisWeek = weekStart(today, 1)
    const lastWeek = addDays(thisWeek, -7)
    const outside = addDays(thisWeek, -28)
    const midWeek = addDays(thisWeek, 2)
    const secondSessionDate = midWeek <= today ? midWeek : today

    await seedSession({
      userId: user.id,
      date: thisWeek,
      exercises: [
        {
          exerciseId: exA.id,
          nameSnapshot: "Progress A",
          sets: [
            { reps: 5, weightKg: 100, isPr: true },
            { reps: 10, weightKg: 50, type: "warmup" },
            { reps: null, weightKg: 60 },
          ],
        },
        { exerciseId: exB.id, nameSnapshot: "Progress B", sets: [{ reps: 10, weightKg: 50 }] },
      ],
    })

    await seedSession({
      userId: user.id,
      date: secondSessionDate,
      exercises: [
        {
          exerciseId: null,
          nameSnapshot: "Custom Move",
          sets: [{ reps: 10, weightKg: 100, isPr: true }],
        },
      ],
    })

    await seedSession({
      userId: user.id,
      date: lastWeek,
      exercises: [
        { exerciseId: exA.id, nameSnapshot: "Progress A", sets: [{ reps: 5, weightKg: 110, isPr: true }] },
      ],
    })

    await seedSession({
      userId: user.id,
      date: outside,
      exercises: [{ exerciseId: exB.id, nameSnapshot: "Progress B", sets: [{ reps: 5, weightKg: 200 }] }],
    })

    return { user, exA, exB, exC, thisWeek, lastWeek }
  }

  it("aggregates weekly volume excluding warm-ups and out-of-window sessions", async () => {
    const { user, thisWeek, lastWeek } = await seedAnalyticsData()
    const overview = await getOverview(user.id, 4)
    expect(overview.volumeByWeek).toHaveLength(4)
    expect(overview.volumeByWeek.filter((bucket) => bucket.sessions > 0)).toEqual([
      { weekStart: lastWeek, volumeKg: 550, sessions: 1 },
      { weekStart: thisWeek, volumeKg: 2000, sessions: 2 },
    ])
  })

  it("buckets weeks by the profile timezone rather than UTC", async () => {
    const timeZone = "America/Los_Angeles"
    const user = await makeUser(timeZone)
    const ex = await makeExercise("TZ", ["chest"], [])
    const today = localDate(new Date(), timeZone)
    const thisWeek = weekStart(today, 1)
    const previousWeek = addDays(thisWeek, -7)

    await seedSession({
      userId: user.id,
      date: thisWeek,
      at: `${thisWeek}T02:00:00Z`,
      exercises: [
        {
          exerciseId: ex.id,
          nameSnapshot: "Progress TZ",
          sets: [{ reps: 5, weightKg: 20 }],
        },
      ],
    })

    const overview = await getOverview(user.id, 4)
    expect(overview.volumeByWeek.filter((bucket) => bucket.sessions > 0)).toEqual([
      { weekStart: previousWeek, volumeKg: 100, sessions: 1 },
    ])
  })

  it("credits muscles at 1.0/0.5 and buckets custom work", async () => {
    const { user } = await seedAnalyticsData()
    const overview = await getOverview(user.id, 4)
    expect(overview.muscleVolume).toEqual([
      { muscle: "chest", volumeKg: 1050 },
      { muscle: "triceps", volumeKg: 525 },
      { muscle: "quads", volumeKg: 500 },
      { muscle: "custom", volumeKg: 1000 },
    ])
  })

  it("extracts recent PRs newest-first and skips custom exercises", async () => {
    const { user, exA, thisWeek, lastWeek } = await seedAnalyticsData()
    const overview = await getOverview(user.id, 4)
    expect(overview.recentPrs).toEqual([
      {
        sessionId: expect.any(String),
        date: thisWeek,
        exerciseId: exA.id,
        name: "Progress A",
        nameEs: "Progreso A",
        weightKg: 100,
        reps: 5,
      },
      {
        sessionId: expect.any(String),
        date: lastWeek,
        exerciseId: exA.id,
        name: "Progress A",
        nameEs: "Progreso A",
        weightKg: 110,
        reps: 5,
      },
    ])
  })

  it("scopes the overview to the owner", async () => {
    await seedAnalyticsData()
    const other = await makeUser()
    const overview = await getOverview(other.id, 4)
    expect(overview.volumeByWeek).toHaveLength(4)
    expect(
      overview.volumeByWeek.every((bucket) => bucket.volumeKg === 0 && bucket.sessions === 0),
    ).toBe(true)
    expect(overview.muscleVolume).toEqual([])
    expect(overview.recentPrs).toEqual([])
  })

  it("builds a per-exercise e1rm series sorted by date", async () => {
    const { user, exA, thisWeek, lastWeek } = await seedAnalyticsData()
    const progress = await getExerciseProgress(user.id, exA.id)
    expect(progress.exerciseId).toBe(exA.id)
    expect(progress.name).toBe("Progress A")
    expect(progress.nameEs).toBe("Progreso A")
    expect(progress.points).toHaveLength(2)
    expect(progress.points[0]).toMatchObject({
      date: lastWeek,
      topWeightKg: 110,
      reps: 5,
      e1rm: 110 * (1 + 5 / 30),
    })
    expect(progress.points[1]).toMatchObject({
      date: thisWeek,
      topWeightKg: 100,
      reps: 5,
      e1rm: 100 * (1 + 5 / 30),
    })
  })

  it("404s when the exercise has no completed history for the user", async () => {
    const { user, exC } = await seedAnalyticsData()
    await expect(getExerciseProgress(user.id, exC.id)).rejects.toThrow("Exercise not found")
  })

  it("404s when the history belongs to another user", async () => {
    const { exA } = await seedAnalyticsData()
    const other = await makeUser()
    await expect(getExerciseProgress(other.id, exA.id)).rejects.toThrow("Exercise not found")
  })
})
