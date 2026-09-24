"use client"

import { ChartLine } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { WeekBucket } from "@/features/progress/lib/volume"
import { formatWeight } from "@/features/workouts/lib/units"

const WEEK_OPTIONS = [4, 12, 26] as const

export type VolumeChartProps = {
  volumeByWeek: WeekBucket[]
  weeks: number
  onWeeksChange: (weeks: number) => void
  unitSystem?: "metric" | "imperial"
}

export function VolumeChart({
  volumeByWeek,
  weeks,
  onWeeksChange,
  unitSystem = "metric",
}: VolumeChartProps) {
  const t = useTranslations("analytics")

  const config = {
    volumeKg: { label: t("volume"), color: "var(--color-chart-1)" },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("volume")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {volumeByWeek.length === 0 ? (
          <EmptyState icon={ChartLine} title={t("empty")} />
        ) : (
          <>
            <ChartContainer config={config} className="h-48 w-full">
              <AreaChart data={volumeByWeek} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis tickLine={false} axisLine={false} width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="volumeKg"
                  type="monotone"
                  fill="var(--color-volumeKg)"
                  stroke="var(--color-volumeKg)"
                />
              </AreaChart>
            </ChartContainer>

            <ul className="sr-only">
              {volumeByWeek.map((week) => (
                <li key={week.weekStart}>
                  <span>{t("weekOf", { date: week.weekStart })}</span>
                  <span>{formatWeight(week.volumeKg, unitSystem)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div role="group" aria-label={t("weeks")} className="flex gap-2">
          {WEEK_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={weeks === option ? "default" : "outline"}
              aria-pressed={weeks === option}
              onClick={() => onWeeksChange(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
