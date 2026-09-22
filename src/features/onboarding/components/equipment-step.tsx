"use client"

import { Buildings, Check, House, SquaresFour } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { EQUIPMENT } from "@/features/exercises/schemas/exercise"

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
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg">{t("label")}</h2>
        <p className="text-muted-foreground text-sm">{t("location")}</p>
        <div
          role="group"
          aria-label={t("location")}
          className="flex flex-col gap-3"
        >
          {LOCATIONS.map(({ id, icon: LocationIcon }) => (
            <Button
              key={id}
              type="button"
              variant={location === id ? "default" : "secondary"}
              aria-pressed={location === id}
              className="h-12 justify-start gap-3"
              onClick={() => onLocationChange(id)}
            >
              <LocationIcon className="size-5" aria-hidden="true" />
              {t(id)}
            </Button>
          ))}
        </div>
      </div>

      <div role="group" aria-label={t("label")} className="flex flex-col gap-3">
        {EQUIPMENT.map((item) => {
          const selected = equipment.includes(item)
          return (
            <Button
              key={item}
              type="button"
              variant={selected ? "default" : "secondary"}
              aria-pressed={selected}
              className="h-12 justify-start gap-3"
              onClick={() => onEquipmentChange(toggle(equipment, item))}
            >
              <Check
                className={selected ? "size-5" : "size-5 opacity-0"}
                aria-hidden="true"
              />
              {item}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
