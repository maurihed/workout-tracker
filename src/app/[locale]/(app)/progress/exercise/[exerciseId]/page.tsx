"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useParams } from "next/navigation"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import {
  ChartSkeleton,
  chartBoundary,
} from "@/features/progress/components/chart-shell"
import type { ExerciseProgressChartProps } from "@/features/progress/components/exercise-progress-chart"
import { useExerciseProgress } from "@/features/progress/hooks/use-exercise-progress"
import { useProfile } from "@/features/profile/hooks/use-profile"

const ExerciseProgressChart = chartBoundary<ExerciseProgressChartProps>(() =>
  import("@/features/progress/components/exercise-progress-chart").then(
    (mod) => ({
      default: mod.ExerciseProgressChart,
    }),
  ),
)

export default function ExerciseProgressPage() {
  const t = useTranslations("pr")
  const tHistory = useTranslations("history")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const params = useParams()
  const exerciseId =
    typeof params?.exerciseId === "string" ? params.exerciseId : ""
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"
  const { data, isLoading, isError, refetch } = useExerciseProgress(exerciseId)

  const name = data
    ? locale === "es"
      ? (data.nameEs ?? data.name)
      : data.name
    : ""

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {data ? name : t("e1rm")}
      </h1>

      {isLoading && !data ? <ChartSkeleton /> : null}

      {!isLoading && (isError || !data) ? (
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

      {data ? (
        <ExerciseProgressChart points={data.points} unitSystem={unitSystem} />
      ) : null}

      <Button asChild size="lg" variant="outline" className="w-full">
        <Link href={`/${locale}/progress`}>{tHistory("title")}</Link>
      </Button>
    </div>
  )
}
