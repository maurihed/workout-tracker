"use client"

import { Scales } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

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
  const autoDetected = useRef(false)

  // The wizard always passes the untouched default `"UTC"` (stub profile and
  // `EMPTY_ONBOARDING_PROFILE`), so detect whenever the field is unset or still
  // at that default. Runs once on mount; the user can override afterwards.
  useEffect(() => {
    if (autoDetected.current) return
    autoDetected.current = true
    if (timezone && timezone !== "UTC") return

    let detected = "UTC"
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
      detected = "UTC"
    }
    if (detected !== timezone) onTimezoneChange(detected)
  }, [timezone, onTimezoneChange])

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          {t("label")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("units")}</p>
        <div
          role="group"
          aria-label={t("units")}
          className="grid grid-cols-2 gap-3"
        >
          {UNITS.map((unit) => {
            const selected = unitSystem === unit
            return (
              <Button
                key={unit}
                type="button"
                variant="outline"
                aria-pressed={selected}
                className={cn(
                  "h-20 flex-col gap-1.5 rounded-2xl px-3 text-sm",
                  selected &&
                    "border-primary bg-primary/15 ring-2 ring-primary/40 hover:bg-primary/20",
                )}
                onClick={() => onUnitSystemChange(unit)}
              >
                <Scales
                  className={cn("size-6", selected && "text-primary")}
                  weight={selected ? "fill" : "duotone"}
                  aria-hidden="true"
                />
                <span className="font-semibold">{t(unit)}</span>
              </Button>
            )
          })}
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
