"use client"

import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

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
      <h2 className="font-heading text-lg">{t("label")}</h2>
      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {DAYS.map((day) => (
          <Button
            key={day}
            type="button"
            variant={value === day ? "default" : "secondary"}
            aria-pressed={value === day}
            className="h-12 justify-start"
            onClick={() => onSelect(day)}
          >
            {t("days", { count: day })}
          </Button>
        ))}
      </div>
    </section>
  )
}
