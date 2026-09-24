"use client"

import { ChartLine } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { EmptyState } from "@/components/shared/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { SeriesPoint } from "@/features/progress/lib/one-rm"
import { formatWeight } from "@/features/workouts/lib/units"

export type ExerciseProgressChartProps = {
  points: SeriesPoint[]
  unitSystem?: "metric" | "imperial"
}

export function ExerciseProgressChart({
  points,
  unitSystem = "metric",
}: ExerciseProgressChartProps) {
  const t = useTranslations("pr")
  const tAnalytics = useTranslations("analytics")

  const config = {
    e1rm: { label: t("e1rm"), color: "var(--color-chart-1)" },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("e1rm")}</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <EmptyState icon={ChartLine} title={tAnalytics("empty")} />
        ) : (
          <>
            <ChartContainer config={config} className="h-56 w-full">
              <LineChart data={points} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  domain={["auto", "auto"]}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="e1rm"
                  type="monotone"
                  stroke="var(--color-e1rm)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ChartContainer>

            <ul className="sr-only">
              {points.map((point) => (
                <li key={point.date}>
                  <span>{point.date}</span>
                  <span>{formatWeight(point.e1rm, unitSystem)}</span>
                  <span>{t("topSet")}</span>
                  <span>{`${point.reps} × ${formatWeight(point.topWeightKg, unitSystem)}`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
