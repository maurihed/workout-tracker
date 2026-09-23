"use client"

import { useTranslations } from "next-intl"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  DraftExercise,
  TimerType,
} from "@/features/routines/stores/routine-draft-store"

const TIMER_TYPES: TimerType[] = ["none", "interval", "emom", "amrap"]

const selectClassName =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30"

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

  const setsId = `${exercise.id}-sets`
  const repsId = `${exercise.id}-reps`
  const restId = `${exercise.id}-rest`
  const timerId = `${exercise.id}-timer`
  const workId = `${exercise.id}-work`
  const roundsId = `${exercise.id}-rounds`
  const notesId = `${exercise.id}-notes`

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        id={setsId}
        label={t("sets")}
        value={exercise.targetSets}
        min={1}
        max={20}
        onCommit={(targetSets) => onChange({ targetSets })}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={repsId}>{t("reps")}</Label>
        <Input
          id={repsId}
          value={exercise.targetReps}
          onChange={(event) => onChange({ targetReps: event.target.value })}
        />
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
