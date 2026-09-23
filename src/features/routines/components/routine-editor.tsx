"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { DayList } from "@/features/routines/components/day-list"
import { SaveBar } from "@/features/routines/components/save-bar"
import { useHydrateDraft } from "@/features/routines/hooks/use-hydrate-draft"
import { useRoutine } from "@/features/routines/hooks/use-routine"
import { useUpdateRoutine } from "@/features/routines/hooks/use-update-routine"
import {
  routineInputSchema,
  type RoutineInput,
} from "@/features/routines/schemas/routine"
import {
  OrphanedExerciseError,
  useRoutineDraftStore,
  type Goal,
} from "@/features/routines/stores/routine-draft-store"

const GOALS: Goal[] = [
  "lose_weight",
  "build_muscle",
  "get_stronger",
  "endurance",
  "general_fitness",
]

const selectClassName =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30"

type RoutineEditorProps = {
  routineId: string
}

export function RoutineEditor({ routineId }: RoutineEditorProps) {
  const t = useTranslations("routineEditor")
  const tGoals = useTranslations("onboarding.goals")
  const tCommon = useTranslations("common")

  const { data, isLoading, isError, refetch } = useRoutine(routineId)
  const update = useUpdateRoutine()

  const name = useRoutineDraftStore((state) => state.name)
  const description = useRoutineDraftStore((state) => state.description)
  const goal = useRoutineDraftStore((state) => state.goal)
  const days = useRoutineDraftStore((state) => state.days)
  const isDirty = useRoutineDraftStore((state) => state.isDirty)

  const hydrate = useRoutineDraftStore((state) => state.hydrate)
  const setHeader = useRoutineDraftStore((state) => state.setHeader)
  const addDay = useRoutineDraftStore((state) => state.addDay)
  const removeDay = useRoutineDraftStore((state) => state.removeDay)
  const updateDay = useRoutineDraftStore((state) => state.updateDay)
  const updateExercise = useRoutineDraftStore((state) => state.updateExercise)
  const removeExercise = useRoutineDraftStore((state) => state.removeExercise)
  const moveDay = useRoutineDraftStore((state) => state.moveDay)
  const moveExercise = useRoutineDraftStore((state) => state.moveExercise)
  const toRoutineInput = useRoutineDraftStore((state) => state.toRoutineInput)
  const clearDraft = useRoutineDraftStore((state) => state.clearDraft)

  const hydrated = useHydrateDraft()
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (hydrated && data) hydrate(data)
  }, [hydrated, data, hydrate])

  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  async function handleSave() {
    setValidationError(null)
    let input: RoutineInput
    try {
      input = toRoutineInput()
    } catch (error) {
      if (error instanceof OrphanedExerciseError) {
        setValidationError(t("orphanExercise"))
        return
      }
      throw error
    }
    const parsed = routineInputSchema.safeParse(input)
    if (!parsed.success) {
      setValidationError(t("validationError"))
      return
    }
    try {
      await update.mutateAsync({ id: routineId, input: parsed.data })
      clearDraft()
      toast.success(t("saved"))
    } catch {
      // The mutation error is surfaced through the SaveBar below.
    }
  }

  if (!hydrated || isLoading) {
    return (
      <div className="space-y-3" role="status" aria-busy="true">
        <span className="sr-only">{tCommon("loading")}</span>
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tCommon("error")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => refetch()}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  const error = update.isError ? tCommon("error") : validationError

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="routine-name">{t("name")}</Label>
          <Input
            id="routine-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setHeader({ name: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="routine-description">{t("description")}</Label>
          <Input
            id="routine-description"
            value={description ?? ""}
            onChange={(event) =>
              setHeader({
                description:
                  event.target.value === "" ? null : event.target.value,
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="routine-goal">{t("goal")}</Label>
          <select
            id="routine-goal"
            className={selectClassName}
            value={goal ?? ""}
            onChange={(event) =>
              setHeader({
                goal: event.target.value === "" ? null : (event.target.value as Goal),
              })
            }
          >
            <option value="" />
            {GOALS.map((value) => (
              <option key={value} value={value}>
                {tGoals(value)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-lg">{t("days")}</h2>
        <DayList
          days={days}
          routineId={routineId}
          onAddDay={addDay}
          onRemoveDay={removeDay}
          onUpdateDay={updateDay}
          onMoveDay={moveDay}
          onMoveExercise={moveExercise}
          onUpdateExercise={updateExercise}
          onRemoveExercise={removeExercise}
        />
      </section>

      <SaveBar
        isDirty={isDirty}
        isPending={update.isPending}
        error={error}
        onSave={handleSave}
      />
    </div>
  )
}
