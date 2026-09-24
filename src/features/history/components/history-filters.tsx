"use client"

import { useTranslations } from "next-intl"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRoutines } from "@/features/routines/hooks/use-routines"
import type { HistoryFilters as HistoryFilterValues } from "@/features/history/hooks/use-history"

type HistoryFiltersProps = {
  value: HistoryFilterValues
  onChange: (next: HistoryFilterValues) => void
}

type FilterKey = keyof HistoryFilterValues

function withFilter(
  value: HistoryFilterValues,
  key: FilterKey,
  next: string,
): HistoryFilterValues {
  const result = { ...value }
  if (next === "") {
    delete result[key]
  } else {
    result[key] = next
  }
  return result
}

export function HistoryFilters({ value, onChange }: HistoryFiltersProps) {
  const t = useTranslations("history")
  const routines = useRoutines()

  return (
    <div className="bg-muted/40 flex flex-col gap-3 rounded-3xl border border-border p-4 ring-1 ring-(--surface-ring)">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-from" className="text-muted-foreground text-xs">
            {t("from")}
          </Label>
          <Input
            id="history-from"
            type="date"
            value={value.from ?? ""}
            onChange={(event) =>
              onChange(withFilter(value, "from", event.target.value))
            }
            className="h-11"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-to" className="text-muted-foreground text-xs">
            {t("to")}
          </Label>
          <Input
            id="history-to"
            type="date"
            value={value.to ?? ""}
            onChange={(event) =>
              onChange(withFilter(value, "to", event.target.value))
            }
            className="h-11"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="history-routine" className="text-muted-foreground text-xs">
          {t("routine")}
        </Label>
        <select
          id="history-routine"
          value={value.routineId ?? ""}
          onChange={(event) =>
            onChange(withFilter(value, "routineId", event.target.value))
          }
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-2xl border px-3.5 text-base outline-none focus-visible:ring-3 md:text-sm"
        >
          <option value="">{t("allRoutines")}</option>
          {(routines.data ?? []).map((routine) => (
            <option key={routine.id} value={routine.id}>
              {routine.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
