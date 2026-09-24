"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BodyMetricForm,
  BodyMetricList,
} from "@/features/progress/components/body-metric-form"
import { chartBoundary } from "@/features/progress/components/chart-shell"
import type { WeightTrendChartProps } from "@/features/progress/components/weight-trend-chart"
import { useBodyMetrics } from "@/features/progress/hooks/use-body-metrics"
import { useDeleteBodyMetric } from "@/features/progress/hooks/use-delete-body-metric"
import { useUpsertBodyMetric } from "@/features/progress/hooks/use-upsert-body-metric"
import { useProfile } from "@/features/profile/hooks/use-profile"

const WeightTrendChart = chartBoundary<WeightTrendChartProps>(() =>
  import("@/features/progress/components/weight-trend-chart").then((mod) => ({
    default: mod.WeightTrendChart,
  })),
)

function localToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export default function MetricsPage() {
  const t = useTranslations("metrics")
  const tHistory = useTranslations("history")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const profile = useProfile()
  const metrics = useBodyMetrics()
  const upsert = useUpsertBodyMetric()
  const remove = useDeleteBodyMetric()

  const unitSystem = profile.data?.unitSystem ?? "metric"
  const timeZone = profile.data?.timezone ?? "UTC"
  const entries = metrics.data ?? []
  const sorted = [...entries].sort((a, b) =>
    b.recordedOn.localeCompare(a.recordedOn),
  )

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {t("title")}
      </h1>

      {metrics.isLoading ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true">
          <span className="sr-only">{tCommon("loading")}</span>
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
        </div>
      ) : metrics.isError ? (
        <EmptyState
          icon={WarningCircle}
          title={tCommon("error")}
          action={
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => metrics.refetch()}
            >
              {tCommon("retry")}
            </Button>
          }
        />
      ) : (
        <>
          <BodyMetricForm
            key={timeZone}
            defaultDate={localToday(timeZone)}
            entries={entries}
            unitSystem={unitSystem}
            isPending={upsert.isPending}
            onSubmit={(draft) => {
              void upsert.mutateAsync(draft)
            }}
          />
          <WeightTrendChart entries={entries} unitSystem={unitSystem} />
          <BodyMetricList
            entries={sorted}
            unitSystem={unitSystem}
            deletingId={remove.isPending ? (remove.variables ?? null) : null}
            onDelete={(id) => remove.mutate(id)}
          />
        </>
      )}

      <Button asChild size="lg" variant="outline" className="w-full">
        <Link href={`/${locale}/progress`}>{tHistory("title")}</Link>
      </Button>
    </div>
  )
}
