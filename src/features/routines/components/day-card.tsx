"use client"

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { DotsSixVertical, Plus, Trash } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ExerciseRow } from "@/features/routines/components/exercise-row"
import { WEEKDAYS, weekdayLabel } from "@/features/routines/lib/weekdays"
import type {
  DayPatch,
  DraftDay,
  DraftExercise,
  ExercisePatch,
} from "@/features/routines/stores/routine-draft-store"
import { cn } from "@/lib/utils"

const selectClassName =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30"

type DayCardProps = {
  day: DraftDay
  routineId: string
  onUpdate: (dayId: string, patch: DayPatch) => void
  onRemove: (dayId: string) => void
  onUpdateExercise: (
    dayId: string,
    exerciseId: string,
    patch: ExercisePatch,
  ) => void
  onRemoveExercise: (dayId: string, exerciseId: string) => void
}

export function DayCard({
  day,
  routineId,
  onUpdate,
  onRemove,
  onUpdateExercise,
  onRemoveExercise,
}: DayCardProps) {
  const t = useTranslations("routineEditor")
  const locale = useLocale()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: day.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const weekdayId = `${day.id}-weekday`
  const labelId = `${day.id}-label`

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border bg-card flex flex-col gap-4 rounded-xl border p-4",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="text-muted-foreground focus-visible:ring-ring/50 mt-1 flex size-11 shrink-0 touch-none items-center justify-center rounded-lg outline-none focus-visible:ring-3"
          aria-label={t("reorderDay")}
          {...attributes}
          {...listeners}
        >
          <DotsSixVertical className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={weekdayId}>{t("weekday")}</Label>
            <select
              id={weekdayId}
              className={selectClassName}
              value={day.weekday}
              onChange={(event) =>
                onUpdate(day.id, { weekday: Number(event.target.value) })
              }
            >
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>
                  {weekdayLabel(locale, weekday)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={labelId}>{t("label")}</Label>
            <Input
              id={labelId}
              value={day.label ?? ""}
              onChange={(event) =>
                onUpdate(day.id, {
                  label: event.target.value === "" ? null : event.target.value,
                })
              }
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("removeDay")}
          onClick={() => onRemove(day.id)}
        >
          <Trash className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <SortableContext
        items={day.exercises.map((exercise) => exercise.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-3">
          {day.exercises.map((exercise: DraftExercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              onChange={(patch) => onUpdateExercise(day.id, exercise.id, patch)}
              onRemove={() => onRemoveExercise(day.id, exercise.id)}
            />
          ))}
        </ul>
      </SortableContext>

      <Button asChild variant="outline" className="h-11">
        <Link href={`/${locale}/routines/${routineId}/picker?day=${day.id}`}>
          <Plus className="size-4" aria-hidden="true" />
          {t("addExercise")}
        </Link>
      </Button>
    </li>
  )
}
