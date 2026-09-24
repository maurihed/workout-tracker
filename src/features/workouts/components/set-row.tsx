"use client"

import { Flame } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SessionSetType } from "@/features/workouts/hooks/use-active-session"
import {
  WeightField,
  type UnitSystem,
} from "@/features/workouts/components/weight-field"
import type { SessionSetPatch } from "@/features/workouts/stores/session-store"
import { cn } from "@/lib/utils"

export type { UnitSystem }

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

/** Display string for a reps value, or `""` when unset. */
function repsToDraft(reps: number | null): string {
  return reps == null ? "" : String(reps)
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

  // Reps get a local-draft treatment: once the user has touched the field, the
  // `lastPerformance` prefill is never re-applied over their input, so clearing
  // a prefilled field actually sticks.
  const [repsDraft, setRepsDraft] = useState(() => repsToDraft(repsValue))
  const repsTouched = useRef(false)

  useEffect(() => {
    if (repsTouched.current) return
    setRepsDraft(repsToDraft(repsValue))
  }, [repsValue])

  return (
    <li
      className={cn(
        "border-border bg-card flex flex-col gap-3 rounded-3xl border p-3.5 ring-1 ring-(--surface-ring) transition-colors",
        completed && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-sm font-bold tabular-nums">
          {t("sets.number", { number: set.setNumber })}
        </span>
        <div className="flex items-center gap-1">
          <label
            className={cn(
              "text-muted-foreground flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
              warmup && "bg-warning text-warning-foreground",
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
            <Flame className="size-4" weight="fill" aria-hidden="true" />
          </label>
          <label className="flex size-11 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              className="accent-primary size-7 cursor-pointer"
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
            value={repsDraft}
            onChange={(event) => {
              repsTouched.current = true
              setRepsDraft(event.target.value)
              onChange({ reps: toNumberOrNull(event.target.value) })
            }}
            className={cn("h-11 text-center", completed && "text-muted-foreground")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={weightId} className="text-muted-foreground text-xs">
            {t("sets.weight")}
          </Label>
          <WeightField
            id={weightId}
            ariaLabel={t("sets.weight")}
            unitSystem={unitSystem}
            weightKg={weightValue}
            onCommit={(weightKg) => onChange({ weightKg })}
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
