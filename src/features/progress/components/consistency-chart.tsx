"use client"

import { ChartBar } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { EmptyState } from "@/components/shared/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { WeekBucket } from "@/features/progress/lib/volume"

export type ConsistencyChartProps = {
  volumeByWeek: WeekBucket[]
  weeks?: number
}

export function ConsistencyChart({ volumeByWeek, weeks }: ConsistencyChartProps) {
  const t = useTranslations("analytics")

  const config = {
    sessions: { label: t("sessions"), color: "var(--color-chart-2)" },
  } satisfies ChartConfig

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("consistency")}</CardTitle>
        {weeks ? (
          <p className="text-muted-foreground text-xs">
            {t("lastWeeks", { count: weeks })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {volumeByWeek.length === 0 ? (
          <EmptyState icon={ChartBar} title={t("empty")} />
        ) : (
          <>
            <ChartContainer config={config} className="h-48 w-full">
              <BarChart data={volumeByWeek} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="sessions"
                  fill="var(--color-sessions)"
                  radius={4}
                />
              </BarChart>
            </ChartContainer>

            <ul className="sr-only">
              {volumeByWeek.map((week) => (
                <li key={week.weekStart}>
                  <span>{t("weekOf", { date: week.weekStart })}</span>
                  <span>{week.sessions}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
