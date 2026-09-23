"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionSummary } from "@/features/workouts/components/session-summary"
import { useSession } from "@/features/workouts/hooks/use-session"
import { loadActiveSession } from "@/features/workouts/lib/session-persistence"
import type { SummaryInput } from "@/features/workouts/lib/summary"

function SummarySkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-24 w-full rounded-3xl" />
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  )
}

export default function SessionSummaryPage() {
  const t = useTranslations("summary")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const params = useParams()
  const sessionId =
    typeof params?.sessionId === "string" ? params.sessionId : ""
  const { data, isLoading, isError, refetch } = useSession(sessionId)
  const [localSummary, setLocalSummary] = useState<SummaryInput | null>(null)

  useEffect(() => {
    let active = true
    void loadActiveSession().then((value) => {
      if (!active || !value) return
      if (value.source.id === sessionId && value.source.status === "completed") {
        setLocalSummary({
          activeSeconds: value.source.activeSeconds,
          exercises: value.source.exercises,
        })
      }
    })
    return () => {
      active = false
    }
  }, [sessionId])

  const session = data ?? localSummary

  if (isLoading && !session) {
    return <SummarySkeleton label={tCommon("loading")} />
  }

  if ((isError && !session) || !session) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => refetch()}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <SessionSummary session={session} />
      <Button asChild size="lg" className="w-full">
        <Link href={`/${locale}/dashboard`}>{t("done")}</Link>
      </Button>
    </div>
  )
}
