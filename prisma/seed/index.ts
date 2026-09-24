import "dotenv/config"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../src/generated/prisma/client"
import { importAchievements } from "./achievements"
import { importExercises, type RawExercise } from "./exercises"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
const DATASET_URL =
  process.env.FREE_EXERCISE_DB_URL ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"

async function main() {
  const response = await fetch(DATASET_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`)
  }
  const raw = (await response.json()) as RawExercise[]
  const result = await importExercises(prisma, raw)
  console.log(`seed: exercises created=${result.created} updated=${result.updated}`)
  const achievements = await importAchievements(prisma)
  console.log(`seed: achievements upserted=${achievements.upserted}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
