"use client"

import { Play } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

function weekdayName(weekday: number, locale: string): string {
  const date = new Date(Date.UTC(2024, 0, weekday))
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date)
}

export function RoutinePreview({ routine }: { routine: RoutineDTO }) {
  const t = useTranslations("dashboard")
  const locale = useLocale()

  return (
    <section className="flex flex-col gap-4" aria-label={t("activeRoutine")}>
      <h2 className="font-heading text-xl font-bold">{routine.name}</h2>

      <ul className="flex flex-col gap-3">
        {routine.days.map((day) => (
          <li key={day.id}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {day.label ?? weekdayName(day.weekday, locale)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1">
                  {day.exercises.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span>{item.exercise?.name ?? item.customName ?? ""}</span>
                      <span className="text-muted-foreground shrink-0 text-sm">
                        {item.targetSets} × {item.targetReps}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-center gap-1">
        <Button type="button" className="h-12 w-full" disabled>
          <Play className="size-5" aria-hidden="true" />
          {t("startWorkout")}
        </Button>
        <Badge variant="secondary">{t("comingSoon")}</Badge>
      </div>
    </section>
  )
}
