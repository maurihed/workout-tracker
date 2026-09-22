export type RawExercise = {
  id: string
  name: string
  force: string | null
  level: string | null
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string | null
  images: string[]
}

export type ExerciseSeed = {
  sourceId: string
  name: string
  force: string | null
  level: string | null
  mechanic: string | null
  equipment: string | null
  category: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  images: string[]
}

export function mapExercise(raw: RawExercise): ExerciseSeed {
  return {
    sourceId: raw.id,
    name: raw.name,
    force: raw.force ?? null,
    level: raw.level ?? null,
    mechanic: raw.mechanic ?? null,
    equipment: raw.equipment ?? null,
    category: raw.category ?? null,
    primaryMuscles: raw.primaryMuscles ?? [],
    secondaryMuscles: raw.secondaryMuscles ?? [],
    instructions: raw.instructions ?? [],
    images: raw.images ?? [],
  }
}

type UpsertClient = {
  exercise: {
    findUnique: (args: {
      where: { sourceId: string }
    }) => Promise<{ id: string } | null>
    upsert: (args: {
      where: { sourceId: string }
      create: ExerciseSeed
      update: Omit<ExerciseSeed, "sourceId">
    }) => Promise<{ id: string }>
  }
}

export async function importExercises(
  client: UpsertClient,
  items: RawExercise[],
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  for (const raw of items) {
    const data = mapExercise(raw)
    const before = await client.exercise.findUnique({
      where: { sourceId: data.sourceId },
    })
    await client.exercise.upsert({
      where: { sourceId: data.sourceId },
      create: data,
      update: {
        name: data.name,
        force: data.force,
        level: data.level,
        mechanic: data.mechanic,
        equipment: data.equipment,
        category: data.category,
        primaryMuscles: data.primaryMuscles,
        secondaryMuscles: data.secondaryMuscles,
        instructions: data.instructions,
        images: data.images,
      },
    })
    if (before) updated += 1
    else created += 1
  }
  return { created, updated }
}
