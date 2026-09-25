"use client"

import { Barbell, ChartLine, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CelebrationLayer } from "@/features/gamification/components/celebration-layer"
import { StatsHeader } from "@/features/gamification/components/stats-header"
import {
  ChartSkeleton,
  chartBoundary,
} from "@/features/progress/components/chart-shell"
import type { ConsistencyChartProps } from "@/features/progress/components/consistency-chart"
import { MuscleHeatmap } from "@/features/progress/components/muscle-heatmap"
import { RecentPrs } from "@/features/progress/components/recent-prs"
import type { VolumeChartProps } from "@/features/progress/components/volume-chart"
import { useAnalyticsOverview } from "@/features/progress/hooks/use-analytics-overview"
import { useProfile } from "@/features/profile/hooks/use-profile"
import { RoutinePreview } from "@/features/routines/components/routine-preview"
import { useActiveRoutine } from "@/features/routines/hooks/use-active-routine"

const VolumeChart = chartBoundary<VolumeChartProps>(() =>
  import("@/features/progress/components/volume-chart").then((mod) => ({
    default: mod.VolumeChart,
  })),
)

const ConsistencyChart = chartBoundary<ConsistencyChartProps>(() =>
  import("@/features/progress/components/consistency-chart").then((mod) => ({
    default: mod.ConsistencyChart,
  })),
)

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
  const tAnalytics = useTranslations("analytics")
  const locale = useLocale()
  const { data: routine, isLoading, isError, refetch } = useActiveRoutine()
  const [weeks, setWeeks] = useState(12)
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"
  const analytics = useAnalyticsOverview(weeks)

  const hasAnalytics = analytics.data
    ? analytics.data.volumeByWeek.length > 0 ||
      analytics.data.muscleVolume.length > 0 ||
      analytics.data.recentPrs.length > 0
    : false

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {tNav("dashboard")}
      </h1>

      <StatsHeader />

      {analytics.isLoading ? <ChartSkeleton /> : null}

      {!analytics.isLoading && analytics.isError ? (
        <EmptyState
          icon={WarningCircle}
          title={tCommon("error")}
          action={
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => analytics.refetch()}
            >
              {tCommon("retry")}
            </Button>
          }
        />
      ) : null}

      {!analytics.isLoading &&
      !analytics.isError &&
      analytics.data &&
      !hasAnalytics ? (
        <EmptyState icon={ChartLine} title={tAnalytics("empty")} />
      ) : null}

      {!analytics.isLoading &&
      !analytics.isError &&
      analytics.data &&
      hasAnalytics ? (
        <>
          <VolumeChart
            volumeByWeek={analytics.data.volumeByWeek}
            weeks={weeks}
            onWeeksChange={setWeeks}
            unitSystem={unitSystem}
          />
          <ConsistencyChart
            volumeByWeek={analytics.data.volumeByWeek}
            weeks={weeks}
          />
          <MuscleHeatmap
            muscleVolume={analytics.data.muscleVolume}
            unitSystem={unitSystem}
          />
          <RecentPrs items={analytics.data.recentPrs} unitSystem={unitSystem} />
        </>
      ) : null}

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

      <CelebrationLayer />
    </div>
  )
}
