"use client"

import { Plus } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { SetRow, type SetRowSet, type UnitSystem } from "@/features/workouts/components/set-row"
import { formatWeight } from "@/features/workouts/lib/units"
import type { SessionSetPatch } from "@/features/workouts/stores/session-store"
import { exerciseImageUrl } from "@/lib/exercise-images"

export type LastPerformance = {
  reps: number | null
  weightKg: number | null
  date: string
}

export type ExerciseViewExercise = {
  id: string
  nameSnapshot: string
  targetSets: number | null
  targetReps: string | null
  restSeconds: number | null
  notes: string | null
  sets: SetRowSet[]
}

type ExerciseViewProps = {
  exercise: ExerciseViewExercise
  unitSystem: UnitSystem
  imagePath?: string | null
  lastPerformance?: LastPerformance | null
  onSetChange: (setNumber: number, patch: SessionSetPatch) => void
  onSetComplete: (setNumber: number, completed: boolean) => void
  onAddSet: () => void
  onNotesChange: (notes: string | null) => void
}

export function ExerciseView({
  exercise,
  unitSystem,
  imagePath,
  lastPerformance,
  onSetChange,
  onSetComplete,
  onAddSet,
  onNotesChange,
}: ExerciseViewProps) {
  const t = useTranslations("runner")
  const thumbnail = exerciseImageUrl(imagePath ?? undefined)
  const notesId = `exercise-${exercise.id}-notes`

  const target =
    exercise.restSeconds != null
      ? t("targetWithRest", {
          sets: exercise.targetSets ?? 0,
          reps: exercise.targetReps ?? "",
          rest: exercise.restSeconds,
        })
      : t("target", {
          sets: exercise.targetSets ?? 0,
          reps: exercise.targetReps ?? "",
        })

  return (
    <section className="flex flex-col gap-4" aria-label={exercise.nameSnapshot}>
      <div className="flex items-center gap-3">
        <Image
          src={thumbnail}
          alt=""
          width={64}
          height={64}
          unoptimized={thumbnail.endsWith(".svg")}
          className="bg-muted size-16 shrink-0 rounded-lg object-cover"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-heading truncate text-xl font-bold">
            {exercise.nameSnapshot}
          </h2>
          <p className="text-muted-foreground text-sm">{target}</p>
        </div>
      </div>

      {lastPerformance ? (
        <p className="bg-secondary text-secondary-foreground rounded-lg px-3 py-2 text-sm">
          {t("lastPerformance", {
            reps: lastPerformance.reps ?? 0,
            weight:
              lastPerformance.weightKg == null
                ? ""
                : formatWeight(lastPerformance.weightKg, unitSystem),
          })}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {exercise.sets.map((set) => (
          <SetRow
            key={set.setNumber}
            set={set}
            unitSystem={unitSystem}
            onChange={(patch) => onSetChange(set.setNumber, patch)}
            onComplete={(completed) => onSetComplete(set.setNumber, completed)}
          />
        ))}
      </ul>

      <Button type="button" variant="outline" className="h-12 w-full" onClick={onAddSet}>
        <Plus className="size-4" aria-hidden="true" />
        {t("sets.addSet")}
      </Button>

      <div className="flex flex-col gap-1">
        <Label htmlFor={notesId} className="text-muted-foreground text-sm">
          {t("sets.notes")}
        </Label>
        <textarea
          id={notesId}
          value={exercise.notes ?? ""}
          onChange={(event) =>
            onNotesChange(event.target.value === "" ? null : event.target.value)
          }
          rows={2}
          className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 w-full resize-y rounded-lg border px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30"
        />
      </div>
    </section>
  )
}
