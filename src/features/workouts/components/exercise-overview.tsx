"use client"

import { CheckCircle, Prohibit } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type OverviewExercise = {
  id: string
  nameSnapshot: string
  completed: boolean
  skipped: boolean
  setCount: number
}

type ExerciseOverviewProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  exercises: OverviewExercise[]
  currentIndex: number
  onSelect: (index: number) => void
}

export function ExerciseOverview({
  open,
  onOpenChange,
  exercises,
  currentIndex,
  onSelect,
}: ExerciseOverviewProps) {
  const t = useTranslations("runner")

  function handleSelect(index: number) {
    onSelect(index)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-4/5 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{t("overview.title")}</SheetTitle>
          <SheetDescription>{t("overview.description")}</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pb-4">
          {exercises.map((exercise, index) => (
            <li key={exercise.id}>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start gap-3 py-2 text-left",
                  index === currentIndex && "bg-muted",
                )}
                onClick={() => handleSelect(index)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {exercise.nameSnapshot}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("overview.setCount", { count: exercise.setCount })}
                  </span>
                </span>
                {exercise.skipped ? (
                  <Prohibit
                    className="text-muted-foreground size-5 shrink-0"
                    aria-label={t("overview.skipped")}
                  />
                ) : exercise.completed ? (
                  <CheckCircle
                    className="text-primary size-5 shrink-0"
                    aria-label={t("overview.completed")}
                  />
                ) : null}
              </Button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
