"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { Plus } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DayCard } from "@/features/routines/components/day-card"
import { WEEKDAYS, weekdayLabel } from "@/features/routines/lib/weekdays"
import type {
  DayPatch,
  DraftDay,
  ExercisePatch,
} from "@/features/routines/stores/routine-draft-store"

const selectClassName =
  "border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-2xl border px-3 py-1 text-base outline-none focus-visible:ring-3 md:text-sm"

type DayListProps = {
  days: DraftDay[]
  routineId: string
  onAddDay: (weekday: number) => void
  onRemoveDay: (dayId: string) => void
  onUpdateDay: (dayId: string, patch: DayPatch) => void
  onMoveDay: (from: number, to: number) => void
  onMoveExercise: (dayId: string, from: number, to: number) => void
  onUpdateExercise: (
    dayId: string,
    exerciseId: string,
    patch: ExercisePatch,
  ) => void
  onRemoveExercise: (dayId: string, exerciseId: string) => void
}

export function DayList({
  days,
  routineId,
  onAddDay,
  onRemoveDay,
  onUpdateDay,
  onMoveDay,
  onMoveExercise,
  onUpdateExercise,
  onRemoveExercise,
}: DayListProps) {
  const t = useTranslations("routineEditor")
  const locale = useLocale()
  const [selected, setSelected] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const available = WEEKDAYS.filter(
    (weekday) => !days.some((day) => day.weekday === weekday),
  )
  const selectedWeekday =
    selected != null && available.includes(selected as (typeof WEEKDAYS)[number])
      ? selected
      : available[0]

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)
    const dayIds = days.map((day) => day.id)

    if (dayIds.includes(activeId)) {
      onMoveDay(dayIds.indexOf(activeId), dayIds.indexOf(overId))
      return
    }

    for (const day of days) {
      const exerciseIds = day.exercises.map((exercise) => exercise.id)
      if (exerciseIds.includes(activeId)) {
        onMoveExercise(
          day.id,
          exerciseIds.indexOf(activeId),
          exerciseIds.indexOf(overId),
        )
        return
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={days.map((day) => day.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-4">
            {days.map((day) => (
              <DayCard
                key={day.id}
                day={day}
                routineId={routineId}
                onUpdate={onUpdateDay}
                onRemove={onRemoveDay}
                onUpdateExercise={onUpdateExercise}
                onRemoveExercise={onRemoveExercise}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {days.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("emptyDays")}</p>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="add-day-weekday">
            {t("weekday")}
          </label>
          <select
            id="add-day-weekday"
            className={selectClassName}
            value={selectedWeekday ?? ""}
            disabled={available.length === 0}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {available.map((weekday) => (
              <option key={weekday} value={weekday}>
                {weekdayLabel(locale, weekday)}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-11"
          disabled={selectedWeekday == null}
          onClick={() => {
            if (selectedWeekday == null) return
            onAddDay(selectedWeekday)
            setSelected(null)
          }}
        >
          <Plus className="size-4" weight="bold" aria-hidden="true" />
          {t("addDay")}
        </Button>
      </div>
    </div>
  )
}
