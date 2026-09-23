"use client"

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
      <h1 className="font-heading text-2xl font-bold">{t("startChooseDay")}</h1>
      <ul className="flex flex-col gap-3">
        {days.map((day) => {
          const label = day.label ?? weekdayLabel(locale, day.weekday)
          const isToday = day.weekday === today
          return (
            <li key={day.id}>
              <Button
                type="button"
                variant="outline"
                data-today={isToday ? "true" : undefined}
                className={cn(
                  "h-auto min-h-14 w-full justify-start py-3 text-left",
                  isToday && "border-primary ring-primary/30 ring-2",
                )}
                onClick={() => onPick(day.id)}
              >
                <span className="font-medium">{label}</span>
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
