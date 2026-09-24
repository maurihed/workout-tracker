"use client"

import { Clock, Stack, Trophy } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { HistoryItemDTO } from "@/server/services/history.service"
import { formatDuration } from "@/features/workouts/lib/summary"
import { formatWeight } from "@/features/workouts/lib/units"
import type { UnitSystem } from "@/features/workouts/components/set-row"

type HistoryRowProps = {
  item: HistoryItemDTO
  unitSystem: UnitSystem
}

export function HistoryRow({ item, unitSystem }: HistoryRowProps) {
  const t = useTranslations("history")
  const locale = useLocale()
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(item.completedAt),
  )

  return (
    <Link
      href={`/${locale}/progress/${item.id}`}
      className="bg-card focus-visible:ring-ring/50 flex min-h-11 flex-col gap-3 rounded-3xl border border-border p-4 ring-1 ring-(--surface-ring) outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-heading truncate text-lg font-bold tracking-tight">
            {item.name}
          </span>
          <span className="text-muted-foreground text-xs font-medium">
            {date}
          </span>
        </div>
        {item.prCount > 0 ? (
          <Badge variant="success">
            <Trophy className="size-3" weight="fill" aria-hidden="true" />
            {t("pr")}
          </Badge>
        ) : null}
      </div>
      <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium">
        <div className="flex items-center gap-1.5">
          <Clock className="size-4" weight="duotone" aria-hidden="true" />
          <dt className="sr-only">{t("duration")}</dt>
          <dd className="tabular-nums">
            {formatDuration(item.activeSeconds)}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Stack className="size-4" weight="duotone" aria-hidden="true" />
          <dt className="sr-only">{t("sets")}</dt>
          <dd className="tabular-nums">{item.setCount}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Trophy className="size-4" weight="duotone" aria-hidden="true" />
          <dt className="sr-only">{t("volume")}</dt>
          <dd className="tabular-nums">
            {formatWeight(item.totalVolumeKg, unitSystem)}
          </dd>
        </div>
      </dl>
    </Link>
  )
}
