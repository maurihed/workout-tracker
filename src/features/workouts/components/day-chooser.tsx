"use client"

import { Barbell, CalendarCheck } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { weekdayLabel } from "@/features/routines/lib/weekdays"
import { cn } from "@/lib/utils"

type DayChooserProps = {
  routine: RoutineDTO
  onPick: (dayId: string) => void
}

/**
 * Lists the active routine's days so the user can pick which one to run. The
 * day matching today's weekday is visually suggested (ring + tint) but never
 * auto-selected, so the choice stays explicit.
 */
export function DayChooser({ routine, onPick }: DayChooserProps) {
  const t = useTranslations("runner")
  const locale = useLocale()
  const today = new Date().getDay()
  const days = [...routine.days].sort((a, b) => a.order - b.order)

  return (
    <section className="flex flex-col gap-4" aria-label={t("startChooseDay")}>
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {t("startChooseDay")}
      </h1>
      <ul className="flex flex-col gap-3">
        {days.map((day, index) => {
          const label = day.label ?? weekdayLabel(locale, day.weekday)
          const isToday = day.weekday === today
          return (
            <li
              key={day.id}
              className="animate-rise"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <Button
                type="button"
                variant="outline"
                data-today={isToday ? "true" : undefined}
                className={cn(
                  "h-20 w-full justify-start gap-3 rounded-3xl px-4 text-left",
                  isToday &&
                    "border-primary bg-primary/10 ring-2 ring-primary/40",
                )}
                onClick={() => onPick(day.id)}
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <CalendarCheck
                    className="size-5"
                    weight={isToday ? "fill" : "duotone"}
                    aria-hidden="true"
                  />
                </span>
                <span className="font-heading flex-1 text-lg font-bold">
                  {label}
                </span>
                <Barbell
                  className="text-muted-foreground size-5 shrink-0"
                  aria-hidden="true"
                />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
