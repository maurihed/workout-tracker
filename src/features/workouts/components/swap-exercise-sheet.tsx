"use client"

import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useExercises } from "@/features/exercises/hooks/use-exercises"
import {
  EQUIPMENT,
  type ExerciseListInput,
  type ExerciseSummary,
} from "@/features/exercises/schemas/exercise"
import { MUSCLES, muscleLabelKey } from "@/features/routines/lib/muscles"
import type { SwapTarget } from "@/features/workouts/stores/session-store"
import { exerciseImageUrl } from "@/lib/exercise-images"

const LEVELS = ["beginner", "intermediate", "expert"] as const

type Equipment = (typeof EQUIPMENT)[number]
type Level = (typeof LEVELS)[number]

const selectClassName =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-lg border px-2 py-1 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30"

type SwapExerciseSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (target: SwapTarget) => void
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

export function SwapExerciseSheet({
  open,
  onOpenChange,
  onSelect,
}: SwapExerciseSheetProps) {
  const t = useTranslations("runner")
  const tPicker = useTranslations("picker")
  const tCommon = useTranslations("common")
  const locale = useLocale()

  const [query, setQuery] = useState("")
  const [muscle, setMuscle] = useState("")
  const [equipment, setEquipment] = useState<Equipment | "">("")
  const [level, setLevel] = useState<Level | "">("")

  const debouncedQuery = useDebouncedValue(query)

  const params = useMemo<Partial<ExerciseListInput>>(
    () => ({
      q: debouncedQuery.trim() === "" ? undefined : debouncedQuery.trim(),
      muscle: muscle === "" ? undefined : muscle,
      equipment: equipment === "" ? undefined : equipment,
      level: level === "" ? undefined : level,
      limit: 50,
    }),
    [debouncedQuery, muscle, equipment, level],
  )

  const { data, isLoading, isError, refetch } = useExercises(params)

  const items = data?.items ?? []

  function displayName(item: ExerciseSummary): string {
    return locale === "es" && item.nameEs ? item.nameEs : item.name
  }

  function handleSelect(item: ExerciseSummary) {
    onSelect({ exerciseId: item.id, nameSnapshot: displayName(item) })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh]">
        <SheetHeader>
          <SheetTitle>{t("swap.title")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tPicker("search")}
            aria-label={tPicker("search")}
          />

          <div className="grid grid-cols-3 gap-2">
            <select
              className={selectClassName}
              value={muscle}
              aria-label={tPicker("filterMuscle")}
              onChange={(event) => setMuscle(event.target.value)}
            >
              <option value="">{tPicker("allMuscles")}</option>
              {MUSCLES.map((value) => (
                <option key={value} value={value}>
                  {tPicker(muscleLabelKey(value))}
                </option>
              ))}
            </select>

            <select
              className={selectClassName}
              value={equipment}
              aria-label={tPicker("filterEquipment")}
              onChange={(event) =>
                setEquipment(event.target.value as Equipment | "")
              }
            >
              <option value="">{tPicker("allEquipment")}</option>
              {EQUIPMENT.map((value) => (
                <option key={value} value={value}>
                  {tPicker(`equipment.${value}`)}
                </option>
              ))}
            </select>

            <select
              className={selectClassName}
              value={level}
              aria-label={tPicker("filterLevel")}
              onChange={(event) => setLevel(event.target.value as Level | "")}
            >
              <option value="">{tPicker("allLevels")}</option>
              {LEVELS.map((value) => (
                <option key={value} value={value}>
                  {tPicker(`level.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <div className="space-y-3" role="status" aria-busy="true">
              <span className="sr-only">{tCommon("loading")}</span>
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
              <Skeleton className="h-14 w-full rounded-lg" />
            </div>
          ) : null}

          {!isLoading && isError ? (
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
          ) : null}

          {!isLoading && !isError && items.length === 0 ? (
            <EmptyState icon={MagnifyingGlass} title={tPicker("empty")} />
          ) : null}

          {!isLoading && !isError && items.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const name = displayName(item)
                const thumbnail = exerciseImageUrl(item.images[0])
                return (
                  <li key={item.id}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-14 w-full justify-start gap-3 p-2 text-left"
                      onClick={() => handleSelect(item)}
                    >
                      <Image
                        src={thumbnail}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized={thumbnail.endsWith(".svg")}
                        className="bg-muted size-12 shrink-0 rounded-md object-cover"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-medium">{name}</span>
                        <span className="flex flex-wrap gap-1">
                          {item.equipment ? (
                            <Badge variant="secondary">
                              {tPicker(`equipment.${item.equipment}`)}
                            </Badge>
                          ) : null}
                          {item.level ? (
                            <Badge variant="outline">
                              {tPicker(`level.${item.level}`)}
                            </Badge>
                          ) : null}
                        </span>
                      </span>
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
