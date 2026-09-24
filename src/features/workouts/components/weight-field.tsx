"use client"

import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { displayWeight, parseWeightToKg } from "@/features/workouts/lib/units"

export type UnitSystem = "metric" | "imperial"

type WeightFieldProps = {
  id: string
  ariaLabel: string
  unitSystem: UnitSystem
  weightKg: number | null
  onCommit: (weightKg: number | null) => void
  className?: string
}

function weightToDraft(weightKg: number | null, unitSystem: UnitSystem): string {
  return weightKg == null ? "" : String(displayWeight(weightKg, unitSystem))
}

export function WeightField({
  id,
  ariaLabel,
  unitSystem,
  weightKg,
  onCommit,
  className,
}: WeightFieldProps) {
  const [draft, setDraft] = useState(() => weightToDraft(weightKg, unitSystem))
  const focused = useRef(false)

  useEffect(() => {
    if (focused.current) return
    setDraft(weightToDraft(weightKg, unitSystem))
  }, [weightKg, unitSystem])

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.5"
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
      }}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        const parsed = Number.parseFloat(raw)
        if (raw.trim() === "" || Number.isNaN(parsed)) {
          onCommit(null)
          return
        }
        const kg = parseWeightToKg(parsed, unitSystem)
        onCommit(kg <= 0 ? null : kg)
      }}
      className={className}
    />
  )
}
