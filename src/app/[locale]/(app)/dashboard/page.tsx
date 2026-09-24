"use client"

import { Barbell, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatsHeader } from "@/features/gamification/components/stats-header"
import { RoutinePreview } from "@/features/routines/components/routine-preview"
import { useActiveRoutine } from "@/features/routines/hooks/use-active-routine"

function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
      <Skeleton className="h-24 w-full rounded-3xl" />
    </div>
  )
}

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const tNav = useTranslations("nav")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { data: routine, isLoading, isError, refetch } = useActiveRoutine()

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {tNav("dashboard")}
      </h1>

      <StatsHeader />

      {isLoading ? <DashboardSkeleton label={tCommon("loading")} /> : null}

      {!isLoading && isError ? (
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
      ) : null}

      {!isLoading && !isError && routine ? (
        <RoutinePreview routine={routine} />
      ) : null}

      {!isLoading && !isError && !routine ? (
        <EmptyState
          icon={Barbell}
          title={t("noRoutine")}
          description={t("finishSetup")}
          action={
            <Button asChild className="h-12">
              <Link href={`/${locale}/onboarding`}>{t("pickRoutine")}</Link>
            </Button>
          }
        />
      ) : null}
    </div>
  )
}
