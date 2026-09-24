import "server-only"
import { NotFoundError } from "@/lib/api-error"
import { bucketByWeek, windowStart } from "@/features/progress/lib/volume"
import { creditMuscles, MUSCLE_REGIONS, type RegionId } from "@/features/progress/lib/muscles"
import { seriesForExercise } from "@/features/progress/lib/one-rm"
import { recentPrs } from "@/features/progress/lib/pr"
import * as profileRepository from "@/server/repositories/profile.repository"
import * as progressRepository from "@/server/repositories/progress.repository"

export type PrItemDTO = {
  sessionId: string
  date: string
  exerciseId: string
  name: string
  nameEs: string | null
  weightKg: number
  reps: number
}

export type MuscleVolumeDTO = { muscle: RegionId; volumeKg: number }

export type OverviewDTO = {
  volumeByWeek: { weekStart: string; volumeKg: number; sessions: number }[]
  muscleVolume: MuscleVolumeDTO[]
  recentPrs: PrItemDTO[]
}

export type ExerciseProgressDTO = {
  exerciseId: string
  name: string
  nameEs: string | null
  points: { date: string; e1rm: number; topWeightKg: number; reps: number }[]
}

const DAY_MS = 86_400_000
const RECENT_PR_LIMIT = 5

type SessionRecord = progressRepository.ProgressSessionRecord
type ExerciseRecord = SessionRecord["exercises"][number]

function localDate(iso: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(iso)
}

function exerciseVolume(exercise: ExerciseRecord): number {
  let volume = 0
  for (const set of exercise.sets) {
    if (set.type === "warmup") continue
    if (!set.completedAt || set.reps == null || set.weightKg == null) continue
    volume += set.reps * set.weightKg
  }
  return volume
}

function sessionVolume(session: SessionRecord): number {
  let volume = 0
  for (const exercise of session.exercises) volume += exerciseVolume(exercise)
  return volume
}

async function loadExerciseNames(ids: string[]) {
  const unique = [...new Set(ids)]
  const rows = await Promise.all(unique.map((id) => progressRepository.findExercise(id)))
  const names = new Map<string, progressRepository.ExerciseNameRecord>()
  unique.forEach((id, index) => {
    const row = rows[index]
    if (row) names.set(id, row)
  })
  return names
}

export async function getOverview(userId: string, weeks: number): Promise<OverviewDTO> {
  const profile = await profileRepository.findByUserId(userId)
  const timeZone = profile?.timezone ?? "UTC"
  const weekStartsOn = profile?.weekStartsOn ?? 1
  const today = localDate(new Date(), timeZone)
  const start = windowStart(today, weeks, weekStartsOn)
  const from = new Date(Date.parse(`${start}T00:00:00Z`) - DAY_MS)
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * DAY_MS)
  const sessions = await progressRepository.listCompletedSessionsWithMuscles(userId, from, to)
  const completed = sessions.filter(
    (session): session is SessionRecord & { completedAt: Date } => session.completedAt !== null,
  )
  const windowed = completed.filter((session) => {
    const date = localDate(session.completedAt, timeZone)
    return date >= start && date <= today
  })

  const volumeByWeek = bucketByWeek(
    windowed.map((session) => ({ completedDate: localDate(session.completedAt, timeZone), volumeKg: sessionVolume(session) })),
    weekStartsOn,
  )

  const muscleTotals = new Map<RegionId, number>()
  for (const session of windowed) {
    for (const exercise of session.exercises) {
      const volume = exerciseVolume(exercise)
      if (volume <= 0) continue
      const credits = creditMuscles(
        exercise.exercise?.primaryMuscles ?? [],
        exercise.exercise?.secondaryMuscles ?? [],
        volume,
      )
      for (const [region, value] of Object.entries(credits)) {
        const id = region as RegionId
        muscleTotals.set(id, (muscleTotals.get(id) ?? 0) + (value ?? 0))
      }
    }
  }
  const muscleVolume = MUSCLE_REGIONS.filter((region) => (muscleTotals.get(region.id) ?? 0) > 0).map((region) => ({
    muscle: region.id,
    volumeKg: muscleTotals.get(region.id) ?? 0,
  }))

  const prSessions = windowed.map((session) => ({
    id: session.id,
    date: localDate(session.completedAt, timeZone),
    exercises: session.exercises.flatMap((exercise) =>
      exercise.exerciseId === null
        ? []
        : [
            {
              exerciseId: exercise.exerciseId,
              nameSnapshot: exercise.nameSnapshot,
              sets: exercise.sets.map((set) => ({ isPr: set.isPr, weightKg: set.weightKg, reps: set.reps })),
            },
          ],
    ),
  }))
  const prItems = recentPrs(prSessions, RECENT_PR_LIMIT)
  const names = await loadExerciseNames(prItems.map((item) => item.exerciseId))
  const recentPrItems: PrItemDTO[] = prItems.map((item) => ({
    ...item,
    nameEs: names.get(item.exerciseId)?.nameEs ?? null,
  }))

  return { volumeByWeek, muscleVolume, recentPrs: recentPrItems }
}

export async function getExerciseProgress(userId: string, exerciseId: string): Promise<ExerciseProgressDTO> {
  const profile = await profileRepository.findByUserId(userId)
  const timeZone = profile?.timezone ?? "UTC"
  const sessions = await progressRepository.listCompletedSessionsWithMuscles(
    userId,
    new Date(0),
    new Date(Date.now() + 2 * DAY_MS),
  )
  const completed = sessions.filter(
    (session): session is SessionRecord & { completedAt: Date } => session.completedAt !== null,
  )
  const seriesSessions = completed.map((session) => ({
    id: session.id,
    date: localDate(session.completedAt, timeZone),
    exercises: session.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map((set) => ({ reps: set.reps, weightKg: set.weightKg, type: set.type })),
    })),
  }))
  const points = seriesForExercise(seriesSessions, exerciseId)
  if (points.length === 0) throw new NotFoundError("Exercise not found")

  const match = completed
    .flatMap((session) => session.exercises)
    .find((exercise) => exercise.exerciseId === exerciseId)
  const catalog = await progressRepository.findExercise(exerciseId)
  return {
    exerciseId,
    name: catalog?.name ?? match?.nameSnapshot ?? exerciseId,
    nameEs: catalog?.nameEs ?? null,
    points,
  }
}
