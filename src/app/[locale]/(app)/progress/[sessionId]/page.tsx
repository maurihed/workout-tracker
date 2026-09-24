"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useParams } from "next/navigation"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { HistoryDetail } from "@/features/history/components/history-detail"
import { useProfile } from "@/features/profile/hooks/use-profile"
import { useSession } from "@/features/workouts/hooks/use-session"

function DetailSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-32 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-3xl" />
    </div>
  )
}

export default function HistoryDetailPage() {
  const t = useTranslations("history")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const params = useParams()
  const sessionId =
    typeof params?.sessionId === "string" ? params.sessionId : ""
  const { data, isLoading, isError, refetch } = useSession(sessionId)
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"

  if (isLoading && !data) {
    return <DetailSkeleton label={tCommon("loading")} />
  }

  if ((isError && !data) || !data) {
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
      <HistoryDetail session={data} unitSystem={unitSystem} />
      <Button asChild size="lg" className="w-full">
        <Link href={`/${locale}/progress`}>{t("title")}</Link>
      </Button>
    </div>
  )
}
