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
import type { BodyMetricDTO } from "@/features/profile/schemas/body-metric"
import { displayWeight } from "@/features/workouts/lib/units"

type UnitSystem = "metric" | "imperial"

export type WeightTrendChartProps = {
  entries: BodyMetricDTO[]
  unitSystem?: UnitSystem
}

export function WeightTrendChart({
  entries,
  unitSystem = "metric",
}: WeightTrendChartProps) {
  const t = useTranslations("metrics")
  const unitLabel = unitSystem === "imperial" ? "lb" : "kg"

  const data = entries
    .filter(
      (entry): entry is BodyMetricDTO & { weightKg: number } =>
        entry.weightKg != null,
    )
    .map((entry) => ({
      date: entry.recordedOn.slice(0, 10),
      weight: displayWeight(entry.weightKg, unitSystem),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const config = {
    weight: { label: t("weight"), color: "var(--color-chart-1)" },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("trend")}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState icon={ChartLine} title={t("empty")} />
        ) : (
          <>
            <ChartContainer config={config} className="h-48 w-full">
              <LineChart data={data} accessibilityLayer>
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
                  width={40}
                  domain={["auto", "auto"]}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  dataKey="weight"
                  type="monotone"
                  stroke="var(--color-weight)"
                  strokeWidth={2}
                  dot
                />
              </LineChart>
            </ChartContainer>

            <ul className="sr-only">
              {data.map((point) => (
                <li key={point.date}>
                  <span>{point.date}</span>
                  <span>{`${point.weight} ${unitLabel}`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
