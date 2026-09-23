"use client"

import { Flame } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SessionSetType } from "@/features/workouts/hooks/use-active-session"
import { displayWeight, parseWeightToKg } from "@/features/workouts/lib/units"
import type { SessionSetPatch } from "@/features/workouts/stores/session-store"
import { cn } from "@/lib/utils"

export type SetRowSet = {
  setNumber: number
  type: SessionSetType
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  rpe: number | null
  restSecondsLogged: number | null
  completedAt: string | null
}

export type UnitSystem = "metric" | "imperial"

type SetRowProps = {
  set: SetRowSet
  unitSystem: UnitSystem
  /** Displayed when the set itself has no value yet (target/last-performance). */
  prefill?: { reps: number | null; weightKg: number | null } | null
  onChange: (patch: SessionSetPatch) => void
  onComplete: (completed: boolean) => void
}

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Display string for the canonical kg value, or `""` when unset. */
function weightToDraft(weightKg: number | null, unitSystem: UnitSystem): string {
  return weightKg == null ? "" : String(displayWeight(weightKg, unitSystem))
}

export function SetRow({
  set,
  unitSystem,
  prefill,
  onChange,
  onComplete,
}: SetRowProps) {
  const t = useTranslations("runner")
  const completed = set.completedAt !== null
  const warmup = set.type === "warmup"
  const repsId = `set-${set.setNumber}-reps`
  const weightId = `set-${set.setNumber}-weight`
  const rpeId = `set-${set.setNumber}-rpe`

  // Show the target/last-performance value only until the user records one.
  const repsValue = set.reps ?? prefill?.reps ?? null
  const weightValue = set.weightKg ?? prefill?.weightKg ?? null

  // The weight field keeps its own string draft while the user types so the
  // unit conversion (display <-> kg) never rewrites the focused input. Without
  // this, imperial entry is unusable: `100` would round-trip through kg on every
  // keystroke and redisplay as `100.1`, making `100` unreachable.
  const [weightDraft, setWeightDraft] = useState(() =>
    weightToDraft(weightValue, unitSystem),
  )
  const weightFocused = useRef(false)

  useEffect(() => {
    if (weightFocused.current) return
    setWeightDraft(weightToDraft(weightValue, unitSystem))
  }, [weightValue, unitSystem])

  return (
    <li
      className={cn(
        "border-border bg-card flex flex-col gap-3 rounded-lg border p-3",
        completed && "bg-muted/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {t("sets.number", { number: set.setNumber })}
        </span>
        <div className="flex items-center gap-1">
          <label
            className={cn(
              "text-muted-foreground flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm",
              warmup && "text-foreground bg-secondary",
            )}
          >
            <input
              type="checkbox"
              className="accent-primary size-5"
              checked={warmup}
              onChange={(event) =>
                onChange({ type: event.target.checked ? "warmup" : "working" })
              }
              aria-label={t("sets.warmup")}
            />
            <Flame className="size-4" aria-hidden="true" />
          </label>
          <label className="flex size-11 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className="accent-primary size-7"
              checked={completed}
              onChange={(event) => onComplete(event.target.checked)}
              aria-label={t("sets.complete")}
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={repsId} className="text-muted-foreground text-xs">
            {t("sets.reps")}
          </Label>
          <Input
            id={repsId}
            type="number"
            inputMode="numeric"
            min={0}
            value={repsValue ?? ""}
            onChange={(event) => onChange({ reps: toNumberOrNull(event.target.value) })}
            className={cn("h-11 text-center", completed && "text-muted-foreground")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={weightId} className="text-muted-foreground text-xs">
            {t("sets.weight")}
          </Label>
          <Input
            id={weightId}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.5"
            value={weightDraft}
            onFocus={() => {
              weightFocused.current = true
            }}
            onBlur={() => {
              weightFocused.current = false
            }}
            onChange={(event) => {
              const raw = event.target.value
              setWeightDraft(raw)
              const value = toNumberOrNull(raw)
              onChange({
                weightKg: value == null ? null : parseWeightToKg(value, unitSystem),
              })
            }}
            className={cn("h-11 text-center", completed && "text-muted-foreground")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={rpeId} className="text-muted-foreground text-xs">
            {t("sets.rpe")}
          </Label>
          <Input
            id={rpeId}
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={set.rpe ?? ""}
            onChange={(event) => onChange({ rpe: toNumberOrNull(event.target.value) })}
            className={cn("h-11 text-center", completed && "text-muted-foreground")}
          />
        </div>
      </div>
    </li>
  )
}
