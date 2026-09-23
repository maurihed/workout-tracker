"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useParams } from "next/navigation"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SessionSummary } from "@/features/workouts/components/session-summary"
import { useSession } from "@/features/workouts/hooks/use-session"

function SummarySkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
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

  if (isLoading) {
    return <SummarySkeleton label={tCommon("loading")} />
  }

  if (isError || !data) {
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
      <SessionSummary session={data} />
      <Button asChild size="lg" className="w-full">
        <Link href={`/${locale}/dashboard`}>{t("done")}</Link>
      </Button>
    </div>
  )
}
