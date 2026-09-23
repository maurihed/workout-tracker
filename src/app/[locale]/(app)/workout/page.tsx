"use client"

import { Barbell, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveRoutine } from "@/features/routines/hooks/use-active-routine"
import { exerciseImageUrl } from "@/lib/exercise-images"
import { useOfflinePrefetch } from "@/lib/offline/use-offline-prefetch"
import { DayChooser } from "@/features/workouts/components/day-chooser"
import {
  WorkoutRunner,
  type RunnerSessionInput,
} from "@/features/workouts/components/workout-runner"
import { useActiveSession } from "@/features/workouts/hooks/use-active-session"
import { useStartSession } from "@/features/workouts/hooks/use-start-session"
import type { SessionSnapshot } from "@/features/workouts/lib/session-snapshot"
import {
  loadActiveSession, saveActiveSession, type PersistedSession,
} from "@/features/workouts/lib/session-persistence"
import {
  useSessionStore,
  type SessionStoreSource,
} from "@/features/workouts/stores/session-store"

function WorkoutSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-3xl" />
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  )
}

type ExerciseMedia = { id: string; name: string; nameEs: string | null; images: string[] }

function toRunnerInput(
  persisted: PersistedSession,
  mediaByExerciseId: Map<string, ExerciseMedia>,
): RunnerSessionInput {
  return {
    id: persisted.source.id,
    exercises: persisted.source.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      timerType: exercise.timerType,
      workSeconds: exercise.workSeconds,
      restSeconds: exercise.restSeconds,
      rounds: exercise.rounds,
      exercise: exercise.exerciseId
        ? (mediaByExerciseId.get(exercise.exerciseId) ?? null)
        : null,
      lastPerformance: null,
    })),
  }
}

export default function WorkoutPage() {
  const t = useTranslations("runner")
  const tCommon = useTranslations("common")
  const locale = useLocale()

  const session = useActiveSession()
  const routine = useActiveRoutine()
  const start = useStartSession()
  const hydrate = useSessionStore((state) => state.hydrate)

  const [persisted, setPersisted] = useState<PersistedSession | null>(null)
  const [localLoaded, setLocalLoaded] = useState(false)

  useEffect(() => {
    let active = true
    void loadActiveSession().then((value) => {
      if (!active) return
      setPersisted(value ?? null)
      setLocalLoaded(true)
    })
    return () => {
      active = false
    }
  }, [])

  const serverSession = session.data ?? null

  const started = useMemo<PersistedSession | null>(
    () =>
      start.data
        ? {
            source: start.data.source,
            snapshot: start.data.snapshot,
            routineDayId: start.data.routineDayId,
            timer: null,
            paused: false,
          }
        : null,
    [start.data],
  )

  const local = started ?? persisted
  const localSource = local?.source ?? null
  const localWins = Boolean(
    localSource &&
      localSource.status === "in_progress" &&
      (!serverSession || serverSession.id !== localSource.id),
  )

  const mediaByExerciseId = useMemo(() => {
    const media = new Map<string, ExerciseMedia>()
    for (const day of routine.data?.days ?? []) {
      for (const exercise of day.exercises) {
        if (exercise.exercise) media.set(exercise.exercise.id, exercise.exercise)
      }
    }
    for (const exercise of serverSession?.exercises ?? []) {
      if (exercise.exercise) media.set(exercise.exercise.id, exercise.exercise)
    }
    return media
  }, [routine.data, serverSession])

  const chosen = useMemo<RunnerSessionInput | null>(
    () => (localWins && local ? toRunnerInput(local, mediaByExerciseId) : serverSession),
    [localWins, local, serverSession, mediaByExerciseId],
  )
  const chosenSource = useMemo<SessionStoreSource | null>(
    () => (localWins && local ? local.source : serverSession),
    [localWins, local, serverSession],
  )
  const chosenSnapshot = useMemo<SessionSnapshot | null>(
    () =>
      localWins && local
        ? local.snapshot
        : ((serverSession?.snapshot as SessionSnapshot | null) ?? null),
    [localWins, local, serverSession],
  )
  const chosenRoutineDayId = useMemo(
    () => (localWins && local ? local.routineDayId : serverSession?.routineDayId ?? null),
    [localWins, local, serverSession],
  )

  useEffect(() => {
    if (!chosen || !chosenSource) return
    const state = useSessionStore.getState()
    if (state.sessionId === chosen.id && !(chosenSnapshot != null && state.snapshot == null)) {
      return
    }
    hydrate(chosenSource, {
      snapshot: chosenSnapshot,
      routineDayId: chosenRoutineDayId,
    })
  }, [chosen, chosenSource, chosenSnapshot, chosenRoutineDayId, hydrate])

  // Adopt a server session into local storage so a later offline reload resumes it.
  const adoptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!serverSession || !localLoaded) return
    if (localSource?.id === serverSession.id) return
    if (localSource?.status === "in_progress") return
    if (adoptedRef.current === serverSession.id) return
    adoptedRef.current = serverSession.id
    void saveActiveSession({
      source: serverSession,
      snapshot: (serverSession.snapshot as SessionSnapshot | null) ?? null,
      routineDayId: serverSession.routineDayId,
      timer: null,
      paused: false,
    })
  }, [serverSession, localSource, localLoaded])

  const days = useMemo(() => routine.data?.days ?? [], [routine.data])

  const prefetchUrls = useMemo(() => {
    const urls = ["/api/exercises"]
    for (const day of routine.data?.days ?? []) {
      for (const exercise of day.exercises) {
        const image = exercise.exercise?.images?.[0]
        if (image) urls.push(exerciseImageUrl(image))
      }
    }
    return urls
  }, [routine.data])
  useOfflinePrefetch(prefetchUrls)

  const autoStartedRef = useRef(false)
  const startingRef = useRef(false)

  const requestStart = useCallback(
    (dayId: string) => {
      if (startingRef.current || !routine.data) return
      startingRef.current = true
      start.mutate({ routine: routine.data, dayId })
    },
    [routine.data, start],
  )

  useEffect(() => {
    if (session.isLoading || routine.isLoading || !localLoaded) return
    if (chosen) {
      autoStartedRef.current = true
      return
    }
    if (autoStartedRef.current) return
    if (days.length === 1) {
      autoStartedRef.current = true
      requestStart(days[0]!.id)
    }
  }, [chosen, days, routine.isLoading, session.isLoading, localLoaded, requestStart])

  if (chosen) {
    return <WorkoutRunner session={chosen} />
  }

  if (session.isLoading || routine.isLoading || !localLoaded) {
    return <WorkoutSkeleton label={tCommon("loading")} />
  }

  if (session.isError && !start.isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button type="button" variant="outline" className="h-12" onClick={() => void session.refetch()}>
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  if (routine.isError || start.isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => {
              start.reset()
              autoStartedRef.current = false
              startingRef.current = false
              if (days.length === 1) requestStart(days[0]!.id)
              else void routine.refetch()
            }}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  if (!routine.data || days.length === 0) {
    return (
      <EmptyState
        icon={Barbell}
        title={t("noActiveRoutine")}
        action={
          <Button asChild className="h-12">
            <Link href={`/${locale}/routines`}>{t("emptyCta")}</Link>
          </Button>
        }
      />
    )
  }

  if (days.length === 1) {
    return <WorkoutSkeleton label={tCommon("loading")} />
  }

  return (
    <DayChooser routine={routine.data} onPick={(dayId) => requestStart(dayId)} />
  )
}
