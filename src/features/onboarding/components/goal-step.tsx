"use client"

import {
  Barbell,
  Check,
  Fire,
  Heartbeat,
  Lightning,
  TrendUp,
} from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        {t("label")}
      </h2>
      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {GOALS.map(({ id, icon: GoalIcon }, index) => {
          const selected = value === id
          return (
            <Button
              key={id}
              type="button"
              variant="outline"
              aria-pressed={selected}
              className={cn(
                "animate-rise h-16 justify-start gap-3 rounded-2xl px-4 text-base",
                selected &&
                  "border-primary bg-primary/15 ring-2 ring-primary/40 hover:bg-primary/20",
              )}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => onSelect(id)}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <GoalIcon className="size-5" weight="duotone" aria-hidden="true" />
              </span>
              <span className="flex-1 text-left font-semibold">{t(id)}</span>
              {selected ? (
                <Check className="text-primary size-5" weight="bold" aria-hidden="true" />
              ) : null}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
