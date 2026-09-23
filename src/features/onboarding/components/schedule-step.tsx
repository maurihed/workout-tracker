"use client"

import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function ScheduleStep({
  value,
  onSelect,
}: {
  value: number | null
  onSelect: (daysPerWeek: number) => void
}) {
  const t = useTranslations("onboarding.schedule")
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        {t("label")}
      </h2>
      <div
        role="group"
        aria-label={t("label")}
        className="flex flex-col gap-3"
      >
        {DAYS.map((day, index) => {
          const selected = value === day
          return (
            <Button
              key={day}
              type="button"
              variant="outline"
              aria-pressed={selected}
              className={cn(
                "animate-rise h-14 justify-between gap-3 rounded-2xl px-5 text-base",
                selected &&
                  "border-primary bg-primary/15 ring-2 ring-primary/40 hover:bg-primary/20",
              )}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => onSelect(day)}
            >
              <span className="font-semibold">{t("days", { count: day })}</span>
              <span
                className={cn(
                  "font-heading flex size-9 items-center justify-center rounded-full text-lg font-bold tabular-nums",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {day}
              </span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}
