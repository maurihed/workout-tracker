import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../../src/generated/prisma/client"

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

/**
 * Creates a user with a bare profile and a database session, returning the
 * `authjs.session-token` cookie the test can inject so Auth.js (database
 * session strategy) authenticates subsequent requests.
 *
 * By default the profile is *not* onboarded; pass `{ onboarded: true }` to stamp
 * `Profile.onboardedAt` so specs that exercise the `(app)` routes get past the
 * onboarding gate.
 */
export async function createTestSession(
  email: string,
  { onboarded = false }: { onboarded?: boolean } = {},
) {
  // Upsert keeps retries idempotent: a retried test reuses its email, which
  // would otherwise collide on the unique `User.email` constraint.
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, profile: { create: {} } },
  })
  if (onboarded) {
    const onboardedAt = new Date()
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { onboardedAt },
      create: { userId: user.id, onboardedAt },
    })
  }
  const token = `e2e_${user.id}_${Date.now()}`
  await prisma.session.create({
    data: {
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + 3_600_000),
    },
  })
  return { cookie: { name: "authjs.session-token", value: token }, userId: user.id }
}

export type SeedRoutineExercise = {
  name: string
  targetSets?: number
  targetReps?: string
  restSeconds?: number
}

export type SeedRoutineDay = {
  weekday: number
  label: string
  exercises: SeedRoutineExercise[]
}

/**
 * Creates an active routine (with days and exercises) for `userId` so a spec can
 * drive the workout runner, which needs a day to start. Exercises use
 * `customName` rather than a catalog `exerciseId`, keeping the seed independent
 * of the exercise catalog. Any existing routines and workout sessions for the
 * user are cleared first so retries against a reused user stay idempotent.
 */
export async function seedActiveRoutine(
  userId: string,
  { name, days }: { name: string; days: SeedRoutineDay[] },
) {
  await prisma.workoutSession.deleteMany({ where: { userId } })
  await prisma.routine.deleteMany({ where: { userId } })
  return prisma.routine.create({
    data: {
      userId,
      name,
      isActive: true,
      days: {
        create: days.map((day, index) => ({
          weekday: day.weekday,
          label: day.label,
          order: index,
          exercises: {
            create: day.exercises.map((exercise, exerciseIndex) => ({
              customName: exercise.name,
              order: exerciseIndex,
              targetSets: exercise.targetSets ?? 3,
              targetReps: exercise.targetReps ?? "10",
              restSeconds: exercise.restSeconds ?? 60,
            })),
          },
        })),
      },
    },
    select: { id: true },
  })
}

/** Removes the test user; profile, sessions and routines cascade on delete. */
export async function cleanupTestUser(email: string) {
  await prisma.user.deleteMany({ where: { email } })
}

/** Closes the shared connection pool so the Playwright worker can exit. */
export async function disconnectTestDb() {
  await prisma.$disconnect()
}
