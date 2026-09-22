"use client"

import { Fire, Plant, TrendUp } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

const LEVELS = [
  { id: "beginner", icon: Plant },
  { id: "intermediate", icon: TrendUp },
  { id: "advanced", icon: Fire },
] as const

export function ExperienceStep({
  value,
  onSelect,
}: {
  value: string | null
  onSelect: (experience: string) => void
}) {
  const t = useTranslations("onboarding.experience")
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-lg">{t("label")}</h2>
      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {LEVELS.map(({ id, icon: LevelIcon }) => (
          <Button
            key={id}
            type="button"
            variant={value === id ? "default" : "secondary"}
            aria-pressed={value === id}
            className="h-12 justify-start gap-3"
            onClick={() => onSelect(id)}
          >
            <LevelIcon className="size-5" aria-hidden="true" />
            {t(id)}
          </Button>
        ))}
      </div>
    </section>
  )
}
