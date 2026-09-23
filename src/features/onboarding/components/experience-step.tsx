"use client"

import { Check, Fire, Plant, TrendUp } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        {t("label")}
      </h2>
      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {LEVELS.map(({ id, icon: LevelIcon }, index) => {
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
                <LevelIcon className="size-5" weight="duotone" aria-hidden="true" />
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
