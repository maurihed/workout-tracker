"use client"

import { Scales } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const UNITS = ["metric", "imperial"] as const

export function PreferencesStep({
  unitSystem,
  timezone,
  onUnitSystemChange,
  onTimezoneChange,
}: {
  unitSystem: string | null
  timezone: string | null
  onUnitSystemChange: (unitSystem: string) => void
  onTimezoneChange: (timezone: string) => void
}) {
  const t = useTranslations("onboarding.preferences")

  useEffect(() => {
    if (timezone) return
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detected) onTimezoneChange(detected)
  }, [timezone, onTimezoneChange])

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-lg">{t("label")}</h2>
        <p className="text-muted-foreground text-sm">{t("units")}</p>
        <div
          role="group"
          aria-label={t("units")}
          className="flex flex-col gap-3"
        >
          {UNITS.map((unit) => (
            <Button
              key={unit}
              type="button"
              variant={unitSystem === unit ? "default" : "secondary"}
              aria-pressed={unitSystem === unit}
              className="h-12 justify-start gap-3"
              onClick={() => onUnitSystemChange(unit)}
            >
              <Scales className="size-5" aria-hidden="true" />
              {t(unit)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="onboarding-timezone">{t("timezone")}</Label>
        <Input
          id="onboarding-timezone"
          value={timezone ?? ""}
          autoComplete="off"
          onChange={(event) => onTimezoneChange(event.target.value)}
        />
      </div>
    </section>
  )
}
