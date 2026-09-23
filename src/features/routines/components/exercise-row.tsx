"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { DotsSixVertical, Trash } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { ExerciseFields } from "@/features/routines/components/exercise-fields"
import type { DraftExercise } from "@/features/routines/stores/routine-draft-store"
import { cn } from "@/lib/utils"

type ExerciseRowProps = {
  exercise: DraftExercise
  onChange: (patch: Partial<DraftExercise>) => void
  onRemove: () => void
}

export function ExerciseRow({
  exercise,
  onChange,
  onRemove,
}: ExerciseRowProps) {
  const t = useTranslations("routineEditor")
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-border bg-background flex flex-col gap-3 rounded-lg border p-3",
        isDragging && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-muted-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 touch-none items-center justify-center rounded-lg outline-none focus-visible:ring-3"
          aria-label={t("reorderExercise")}
          {...attributes}
          {...listeners}
        >
          <DotsSixVertical className="size-5" aria-hidden="true" />
        </button>
        <span className="flex-1 truncate font-medium">{exercise.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("removeExercise")}
          onClick={onRemove}
        >
          <Trash className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <ExerciseFields exercise={exercise} onChange={onChange} />
    </li>
  )
}
