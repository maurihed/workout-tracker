"use client"

import { Barbell, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useMemo, useRef } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useActiveRoutine } from "@/features/routines/hooks/use-active-routine"
import { DayChooser } from "@/features/workouts/components/day-chooser"
import { WorkoutRunner } from "@/features/workouts/components/workout-runner"
import { useActiveSession } from "@/features/workouts/hooks/use-active-session"
import { useStartSession } from "@/features/workouts/hooks/use-start-session"

function WorkoutSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  )
}

export default function WorkoutPage() {
  const t = useTranslations("runner")
  const tCommon = useTranslations("common")
  const locale = useLocale()

  const session = useActiveSession()
  const routine = useActiveRoutine()
  const start = useStartSession()

  const activeSession = session.data ?? null
  const days = useMemo(() => routine.data?.days ?? [], [routine.data])
  const sessionRefetch = session.refetch
  const startStatus = (
    start.error as { response?: { status?: number } } | null | undefined
  )?.response?.status

  // A single-day routine has no choice to make: start it as soon as we know
  // there is no in-progress session. The ref keeps StrictMode/refetches from
  // firing a second `POST` (which the service would reject with a conflict).
  // It is deliberately NOT re-armed on a failed start: a persistent 409 must
  // not turn into a retry storm. Only the explicit retry button re-arms it.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (session.isLoading || routine.isLoading) return
    if (activeSession) {
      // A resumed session already counts as "started": after it is completed
      // the active query flips to null, which must NOT auto-start a new one.
      autoStartedRef.current = true
      return
    }
    if (autoStartedRef.current) return
    if (days.length === 1) {
      autoStartedRef.current = true
      start.mutate(days[0]!.id)
    }
  }, [activeSession, days, routine.isLoading, session.isLoading, start])

  // A 409 means a session is already in progress (typically another tab).
  // Refresh the active query once so the runner takes over instead of looping.
  useEffect(() => {
    if (startStatus !== 409) return
    void sessionRefetch()
  }, [startStatus, sessionRefetch])

  if (session.isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => void session.refetch()}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  if (activeSession) {
    return <WorkoutRunner session={activeSession} />
  }

  if (session.isLoading || routine.isLoading) {
    return <WorkoutSkeleton label={tCommon("loading")} />
  }

  if (routine.isError || start.isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={startStatus === 409 ? t("conflict") : tCommon("error")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => {
              start.reset()
              // An explicit retry is the only thing that re-arms auto-start.
              autoStartedRef.current = false
              if (days.length === 1) start.mutate(days[0]!.id)
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
    <DayChooser
      routine={routine.data}
      onPick={(dayId) => start.mutate(dayId)}
    />
  )
}
