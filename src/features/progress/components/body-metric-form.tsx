"use client"

import { Scales, Trash } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { BodyMetricDTO } from "@/features/profile/schemas/body-metric"
import {
  displayWeight,
  formatWeight,
  parseWeightToKg,
} from "@/features/workouts/lib/units"

type UnitSystem = "metric" | "imperial"

export type BodyMetricDraft = {
  recordedOn: string
  weightKg: number | null
  bodyFatPct: number | null
}

type BodyMetricFormProps = {
  defaultDate: string
  entries?: BodyMetricDTO[]
  unitSystem?: UnitSystem
  isPending?: boolean
  onSubmit: (draft: BodyMetricDraft) => void
}

export function BodyMetricForm({
  defaultDate,
  entries = [],
  unitSystem = "metric",
  isPending = false,
  onSubmit,
}: BodyMetricFormProps) {
  const t = useTranslations("metrics")
  const unitLabel = unitSystem === "imperial" ? "lb" : "kg"

  function entryFor(value: string): BodyMetricDTO | null {
    return (
      entries.find((entry) => entry.recordedOn.slice(0, 10) === value) ?? null
    )
  }

  function displayFor(entry: BodyMetricDTO | null): [string, string] {
    return [
      entry?.weightKg == null
        ? ""
        : String(displayWeight(entry.weightKg, unitSystem)),
      entry?.bodyFatPct == null ? "" : String(entry.bodyFatPct),
    ]
  }

  const [date, setDate] = useState(defaultDate)
  const [weight, setWeight] = useState(
    () => displayFor(entryFor(defaultDate))[0],
  )
  const [bodyFat, setBodyFat] = useState(
    () => displayFor(entryFor(defaultDate))[1],
  )
  const [error, setError] = useState(false)

  function handleDateChange(value: string) {
    setDate(value)
    const [nextWeight, nextBodyFat] = displayFor(entryFor(value))
    setWeight(nextWeight)
    setBodyFat(nextBodyFat)
    setError(false)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const weightValue = weight.trim() === "" ? null : Number(weight)
    const bodyFatValue = bodyFat.trim() === "" ? null : Number(bodyFat)
    const hasWeight =
      weightValue != null && Number.isFinite(weightValue) && weightValue >= 0
    const hasBodyFat =
      bodyFatValue != null && Number.isFinite(bodyFatValue) && bodyFatValue >= 0

    if (!hasWeight && !hasBodyFat) {
      setError(true)
      return
    }

    const weightKg = hasWeight ? parseWeightToKg(weightValue, unitSystem) : null
    if (
      (weightKg != null && weightKg > 500) ||
      (hasBodyFat && bodyFatValue > 100)
    ) {
      setError(true)
      return
    }

    setError(false)
    onSubmit({
      recordedOn: date,
      weightKg,
      bodyFatPct: hasBodyFat ? bodyFatValue : null,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("addEntry")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body-metric-date">{t("date")}</Label>
            <Input
              id="body-metric-date"
              type="date"
              value={date}
              onChange={(event) => handleDateChange(event.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body-metric-weight">{t("weight")}</Label>
              <div className="relative">
                <Input
                  id="body-metric-weight"
                  inputMode="decimal"
                  className="pr-10"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                />
                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                  {unitLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body-metric-body-fat">{t("bodyFat")}</Label>
              <Input
                id="body-metric-body-fat"
                inputMode="decimal"
                value={bodyFat}
                onChange={(event) => setBodyFat(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm font-medium">
              {t("invalid")}
            </p>
          ) : null}

          <Button type="submit" className="h-12 w-full" disabled={isPending}>
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

type BodyMetricListProps = {
  entries: BodyMetricDTO[]
  unitSystem?: UnitSystem
  onDelete: (id: string) => void
  deletingId?: string | null
}

export function BodyMetricList({
  entries,
  unitSystem = "metric",
  onDelete,
  deletingId = null,
}: BodyMetricListProps) {
  const t = useTranslations("metrics")
  const locale = useLocale()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState icon={Scales} title={t("empty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const date = new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(entry.recordedOn))

              return (
                <li
                  key={entry.id}
                  className="bg-muted/40 border-border flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-3.5 py-2"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{date}</span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
                      <span>
                        {entry.weightKg == null
                          ? "—"
                          : formatWeight(entry.weightKg, unitSystem)}
                      </span>
                      <span>
                        {entry.bodyFatPct == null
                          ? "—"
                          : `${entry.bodyFatPct}%`}
                      </span>
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`${t("delete")} ${date}`}
                    disabled={deletingId === entry.id}
                    onClick={() => onDelete(entry.id)}
                  >
                    <Trash className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
