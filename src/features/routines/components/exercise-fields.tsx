"use client"

import { Minus, Plus } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useProfile } from "@/features/profile/hooks/use-profile"
import { syncSetTargets } from "@/features/routines/lib/set-targets"
import type { RoutineSetTarget } from "@/features/routines/schemas/routine"
import type {
  DraftExercise,
  TimerType,
} from "@/features/routines/stores/routine-draft-store"
import { displayWeight, parseWeightToKg } from "@/features/workouts/lib/units"

const TIMER_TYPES: TimerType[] = ["none", "interval", "emom", "amrap"]

const selectClassName =
  "border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-2xl border px-3 py-1 text-base outline-none focus-visible:ring-3 md:text-sm"

type ExerciseFieldsProps = {
  exercise: DraftExercise
  onChange: (patch: Partial<DraftExercise>) => void
}

type NumberFieldProps = {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  onCommit: (value: number) => void
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        defaultValue={value}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10)
          if (!Number.isNaN(parsed)) onCommit(parsed)
        }}
      />
    </div>
  )
}

export function ExerciseFields({ exercise, onChange }: ExerciseFieldsProps) {
  const t = useTranslations("routineEditor")
  const { data: profile } = useProfile()
  const unitSystem = profile?.unitSystem ?? "metric"

  const restId = `${exercise.id}-rest`
  const timerId = `${exercise.id}-timer`
  const workId = `${exercise.id}-work`
  const roundsId = `${exercise.id}-rounds`
  const notesId = `${exercise.id}-notes`

  function commit(next: RoutineSetTarget[]) {
    onChange(syncSetTargets(next))
  }

  function updateSet(index: number, patch: Partial<RoutineSetTarget>) {
    commit(
      exercise.setTargets.map((target, i) => (i === index ? { ...target, ...patch } : target)),
    )
  }

  function addSet() {
    const last = exercise.setTargets.at(-1)
    commit([...exercise.setTargets, last ? { ...last } : { reps: 10, weightKg: null, rpe: null }])
  }

  function removeSet(index: number) {
    if (exercise.setTargets.length <= 1) return
    commit(exercise.setTargets.filter((_, i) => i !== index))
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-2">
        {exercise.setTargets.map((target, index) => {
          const setNumber = index + 1
          const repsId = `sets.${setNumber}.reps`
          const weightId = `sets.${setNumber}.weight`
          const rpeId = `sets.${setNumber}.rpe`
          return (
            <div key={setNumber} className="flex items-end gap-2">
              <span className="text-muted-foreground w-14 shrink-0 pb-2 text-sm font-semibold">
                {t("setNumber", { number: setNumber })}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={repsId}>{t("reps")}</Label>
                <Input
                  id={repsId}
                  aria-label={repsId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={target.reps ?? ""}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    updateSet(index, { reps: Number.isNaN(parsed) ? null : parsed })
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={weightId}>{t("weight")}</Label>
                <Input
                  id={weightId}
                  aria-label={weightId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  value={target.weightKg == null ? "" : displayWeight(target.weightKg, unitSystem)}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value)
                    updateSet(index, {
                      weightKg: Number.isNaN(parsed) ? null : parseWeightToKg(parsed, unitSystem),
                    })
                  }}
                />
              </div>
              <div className="flex w-20 flex-col gap-1">
                <Label htmlFor={rpeId}>{t("rpe")}</Label>
                <Input
                  id={rpeId}
                  aria-label={rpeId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={10}
                  value={target.rpe ?? ""}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    updateSet(index, { rpe: Number.isNaN(parsed) ? null : parsed })
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`sets.${setNumber}.remove`}
                disabled={exercise.setTargets.length <= 1}
                onClick={() => removeSet(index)}
              >
                <Minus className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )
        })}
        <Button type="button" variant="outline" className="h-11" onClick={addSet}>
          <Plus className="size-4" weight="bold" aria-hidden="true" />
          {t("addSet")}
        </Button>
      </div>

      <NumberField
        id={restId}
        label={t("rest")}
        value={exercise.restSeconds}
        min={0}
        max={3600}
        onCommit={(restSeconds) => onChange({ restSeconds })}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={timerId}>{t("timer")}</Label>
        <select
          id={timerId}
          className={selectClassName}
          value={exercise.timerType}
          onChange={(event) => {
            const timerType = event.target.value as TimerType
            if (timerType === "none") {
              onChange({ timerType })
              return
            }
            onChange({
              timerType,
              workSeconds: exercise.workSeconds ?? 30,
              rounds: exercise.rounds ?? 3,
            })
          }}
        >
          {TIMER_TYPES.map((timerType) => (
            <option key={timerType} value={timerType}>
              {t(`timer${timerType.charAt(0).toUpperCase()}${timerType.slice(1)}`)}
            </option>
          ))}
        </select>
      </div>

      {exercise.timerType !== "none" ? (
        <>
          <NumberField
            id={workId}
            label={t("workSeconds")}
            value={exercise.workSeconds ?? 0}
            min={1}
            max={3600}
            onCommit={(workSeconds) => onChange({ workSeconds })}
          />
          <NumberField
            id={roundsId}
            label={t("rounds")}
            value={exercise.rounds ?? 0}
            min={1}
            max={50}
            onCommit={(rounds) => onChange({ rounds })}
          />
        </>
      ) : null}

      <div className="col-span-2 flex flex-col gap-1.5">
        <Label htmlFor={notesId}>{t("notes")}</Label>
        <Input
          id={notesId}
          value={exercise.notes ?? ""}
          onChange={(event) =>
            onChange({ notes: event.target.value === "" ? null : event.target.value })
          }
        />
      </div>
    </div>
  )
}
