"use client"

import { Play } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { weekdayLabel } from "@/features/routines/lib/weekdays"

export function RoutinePreview({ routine }: { routine: RoutineDTO }) {
  const t = useTranslations("dashboard")
  const locale = useLocale()
  const routineName =
    locale === "es" ? (routine.nameEs ?? routine.name) : routine.name
  const exerciseName = (exercise: {
    name: string
    nameEs: string | null
  }): string => (locale === "es" ? (exercise.nameEs ?? exercise.name) : exercise.name)

  return (
    <section className="flex flex-col gap-4" aria-label={t("activeRoutine")}>
      <h2 className="font-heading text-xl font-bold">{routineName}</h2>

      <ul className="flex flex-col gap-3">
        {routine.days.map((day) => (
          <li key={day.id}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {day.label ?? weekdayLabel(locale, day.weekday)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1">
                  {day.exercises.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span>
                        {item.exercise
                          ? exerciseName(item.exercise)
                          : (item.customName ?? "")}
                      </span>
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

      <Button asChild className="h-12 w-full">
        <Link href={`/${locale}/workout`}>
          <Play className="size-5" aria-hidden="true" />
          {t("startWorkout")}
        </Link>
      </Button>
    </section>
  )
}
