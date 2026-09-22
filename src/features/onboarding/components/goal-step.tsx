"use client"

import {
  Barbell,
  Fire,
  Heartbeat,
  Lightning,
  TrendUp,
} from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

const GOALS = [
  { id: "lose_weight", icon: Fire },
  { id: "build_muscle", icon: Barbell },
  { id: "get_stronger", icon: TrendUp },
  { id: "endurance", icon: Heartbeat },
  { id: "general_fitness", icon: Lightning },
] as const

export function GoalStep({
  value,
  onSelect,
}: {
  value: string | null
  onSelect: (goal: string) => void
}) {
  const t = useTranslations("onboarding.goals")
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-lg">{t("label")}</h2>
      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {GOALS.map(({ id, icon: GoalIcon }) => (
          <Button
            key={id}
            type="button"
            variant={value === id ? "default" : "secondary"}
            aria-pressed={value === id}
            className="h-12 justify-start gap-3"
            onClick={() => onSelect(id)}
          >
            <GoalIcon className="size-5" aria-hidden="true" />
            {t(id)}
          </Button>
        ))}
      </div>
    </section>
  )
}
