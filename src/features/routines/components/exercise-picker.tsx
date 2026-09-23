"use client"

import {
  ArrowLeft,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useExercises } from "@/features/exercises/hooks/use-exercises"
import {
  EQUIPMENT,
  type ExerciseListInput,
  type ExerciseSummary,
} from "@/features/exercises/schemas/exercise"
import { MUSCLES, muscleLabelKey } from "@/features/routines/lib/muscles"
import { useRoutineDraftStore } from "@/features/routines/stores/routine-draft-store"
import { exerciseImageUrl } from "@/lib/exercise-images"

const LEVELS = ["beginner", "intermediate", "expert"] as const

type Equipment = (typeof EQUIPMENT)[number]
type Level = (typeof LEVELS)[number]

const selectClassName =
  "border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-lg border px-2 py-1 text-base outline-none focus-visible:ring-3 md:text-sm dark:bg-input/30"

type ExercisePickerProps = {
  routineId: string
  dayId: string
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

export function ExercisePicker({ routineId, dayId }: ExercisePickerProps) {
  const t = useTranslations("picker")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()
  const addExercises = useRoutineDraftStore((state) => state.addExercises)

  const [query, setQuery] = useState("")
  const [muscle, setMuscle] = useState("")
  const [equipment, setEquipment] = useState<Equipment | "">("")
  const [level, setLevel] = useState<Level | "">("")
  const [selected, setSelected] = useState<Map<string, ExerciseSummary>>(
    new Map(),
  )

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
  const count = selected.size

  function displayName(item: ExerciseSummary): string {
    return locale === "es" && item.nameEs ? item.nameEs : item.name
  }

  function toggle(item: ExerciseSummary) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) {
        next.delete(item.id)
      } else {
        next.set(item.id, item)
      }
      return next
    })
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.replace(`/${locale}/routines/${routineId}`)
    }
  }

  function handleAdd() {
    if (count === 0) return
    const added = addExercises(
      dayId,
      Array.from(selected.values(), (item) => ({
        exerciseId: item.id,
        name: displayName(item),
      })),
    )
    if (!added) {
      toast.error(t("unknownDay"))
      router.replace(`/${locale}/routines/${routineId}`)
      return
    }
    router.back()
  }

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("back")}
          onClick={handleBack}
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Button>
        <h1 className="font-heading text-xl font-bold">{t("title")}</h1>
      </header>

      <div className="flex flex-col gap-3">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />

        <div className="grid grid-cols-3 gap-2">
          <select
            className={selectClassName}
            value={muscle}
            aria-label={t("filterMuscle")}
            onChange={(event) => setMuscle(event.target.value)}
          >
            <option value="">{t("allMuscles")}</option>
            {MUSCLES.map((value) => (
              <option key={value} value={value}>
                {t(muscleLabelKey(value))}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={equipment}
            aria-label={t("filterEquipment")}
            onChange={(event) =>
              setEquipment(event.target.value as Equipment | "")
            }
          >
            <option value="">{t("allEquipment")}</option>
            {EQUIPMENT.map((value) => (
              <option key={value} value={value}>
                {t(`equipment.${value}`)}
              </option>
            ))}
          </select>

          <select
            className={selectClassName}
            value={level}
            aria-label={t("filterLevel")}
            onChange={(event) => setLevel(event.target.value as Level | "")}
          >
            <option value="">{t("allLevels")}</option>
            {LEVELS.map((value) => (
              <option key={value} value={value}>
                {t(`level.${value}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <span className="sr-only">{tCommon("loading")}</span>
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
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
          <EmptyState
            icon={MagnifyingGlass}
            title={t("empty")}
            description={t("emptyDescription")}
          />
        ) : null}

        {!isLoading && !isError && items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const name = displayName(item)
              const inputId = `picker-${item.id}`
              const thumbnail = exerciseImageUrl(item.images[0])
              return (
                <li key={item.id}>
                  <label
                    htmlFor={inputId}
                    className="border-border bg-card flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-2"
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      className="accent-primary size-5 shrink-0"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item)}
                      aria-label={name}
                    />
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
                            {t(`equipment.${item.equipment}`)}
                          </Badge>
                        ) : null}
                        {item.level ? (
                          <Badge variant="outline">
                            {t(`level.${item.level}`)}
                          </Badge>
                        ) : null}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <div className="bg-background sticky bottom-0 border-t pt-3 pb-[env(safe-area-inset-bottom)]">
        <Button
          type="button"
          className="h-12 w-full"
          disabled={count === 0}
          onClick={handleAdd}
        >
          {count === 0 ? t("add") : t("addCount", { count })}
        </Button>
      </div>
    </div>
  )
}
