"use client"

import { Barbell } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatWeight } from "@/features/workouts/lib/units"

import { heatLevel, type RegionId } from "../lib/muscles"
import { BodyMap } from "./body-map"

export type MuscleVolume = { muscle: RegionId; volumeKg: number }

type MuscleHeatmapProps = {
  muscleVolume: MuscleVolume[]
  unitSystem?: "metric" | "imperial"
}

export function MuscleHeatmap({
  muscleVolume,
  unitSystem = "metric",
}: MuscleHeatmapProps) {
  const t = useTranslations("heatmap")
  const [selected, setSelected] = useState<RegionId | null>(null)

  const totals = useMemo(() => {
    const map = new Map<RegionId, number>()
    for (const entry of muscleVolume) {
      map.set(entry.muscle, (map.get(entry.muscle) ?? 0) + entry.volumeKg)
    }
    return map
  }, [muscleVolume])

  const max = useMemo(() => {
    let value = 0
    for (const total of totals.values()) value = Math.max(value, total)
    return value
  }, [totals])

  const labelFor = (region: RegionId) => t(`regions.${region}`)
  const volumeFor = (region: RegionId) =>
    formatWeight(totals.get(region) ?? 0, unitSystem)

  if (max <= 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Barbell} title={t("empty")} />
        </CardContent>
      </Card>
    )
  }

  const levels: Partial<Record<RegionId, number>> = {}
  for (const [region, volume] of totals) {
    levels[region] = heatLevel(volume, max)
  }

  const customVolume = totals.get("custom") ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BodyMap
          levels={levels}
          labelFor={labelFor}
          volumeFor={volumeFor}
          ariaLabel={t("title")}
          selected={selected}
          onSelect={setSelected}
        />

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">{t("legendLow")}</span>
          <span
            className="from-muted to-primary h-2 flex-1 rounded-full bg-gradient-to-r"
            aria-hidden="true"
          />
          <span className="text-muted-foreground text-xs">{t("legendHigh")}</span>
        </div>

        {selected ? (
          <p
            role="status"
            className="bg-muted rounded-xl px-3 py-2 text-sm font-medium"
          >
            {`${labelFor(selected)}: ${volumeFor(selected)}`}
          </p>
        ) : null}

        {customVolume > 0 ? (
          <p className="text-muted-foreground text-xs">
            {`${t("custom")} · ${formatWeight(customVolume, unitSystem)}`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
