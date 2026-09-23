"use client"

import { Buildings, Check, House, SquaresFour } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { EQUIPMENT } from "@/features/exercises/schemas/exercise"
import { cn } from "@/lib/utils"

const LOCATIONS = [
  { id: "gym", icon: Buildings },
  { id: "home", icon: House },
  { id: "both", icon: SquaresFour },
] as const

function toggle(list: readonly string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

export function EquipmentStep({
  location,
  equipment,
  onLocationChange,
  onEquipmentChange,
}: {
  location: string | null
  equipment: readonly string[]
  onLocationChange: (location: string) => void
  onEquipmentChange: (equipment: string[]) => void
}) {
  const t = useTranslations("onboarding.equipment")
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          {t("label")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("location")}</p>
        <div
          role="group"
          aria-label={t("location")}
          className="grid grid-cols-3 gap-2"
        >
          {LOCATIONS.map(({ id, icon: LocationIcon }) => {
            const selected = location === id
            return (
              <Button
                key={id}
                type="button"
                variant="outline"
                aria-pressed={selected}
                className={cn(
                  "h-20 flex-col gap-1.5 rounded-2xl px-2 text-xs",
                  selected &&
                    "border-primary bg-primary/15 ring-2 ring-primary/40 hover:bg-primary/20",
                )}
                onClick={() => onLocationChange(id)}
              >
                <LocationIcon
                  className={cn("size-6", selected && "text-primary")}
                  weight={selected ? "fill" : "duotone"}
                  aria-hidden="true"
                />
                <span className="font-semibold">{t(id)}</span>
              </Button>
            )
          })}
        </div>
      </div>

      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {EQUIPMENT.map((item, index) => {
          const selected = equipment.includes(item)
          return (
            <Button
              key={item}
              type="button"
              variant="outline"
              aria-pressed={selected}
              className={cn(
                "animate-rise h-14 justify-start gap-3 rounded-2xl px-4",
                selected &&
                  "border-primary bg-primary/15 ring-2 ring-primary/40 hover:bg-primary/20",
              )}
              style={{ animationDelay: `${index * 30}ms` }}
              onClick={() => onEquipmentChange(toggle(equipment, item))}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border",
                )}
              >
                {selected ? (
                  <Check className="size-4" weight="bold" aria-hidden="true" />
                ) : null}
              </span>
              <span className="flex-1 text-left font-medium">
                {t(`items.${item}`)}
              </span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}
