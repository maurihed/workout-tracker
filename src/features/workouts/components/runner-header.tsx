"use client"

import { Timer } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { formatElapsed } from "@/features/workouts/lib/format-time"

type RunnerHeaderProps = {
  elapsedSeconds: number
  index: number
  total: number
  completedSets: number
  totalSets: number
}

export function RunnerHeader({
  elapsedSeconds,
  index,
  total,
  completedSets,
  totalSets,
}: RunnerHeaderProps) {
  const t = useTranslations("runner")
  const percent =
    totalSets > 0 ? Math.min(100, Math.round((completedSets / totalSets) * 100)) : 0

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-2xl ring-1 ring-inset ring-foreground/10">
            <Timer className="size-5" weight="fill" aria-hidden="true" />
          </span>
          <span className="font-heading text-3xl font-bold tabular-nums">
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
        <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-semibold">
          {t("exerciseOf", { index: index + 1, total })}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-valuenow={completedSets}
          aria-label={t("progress")}
          className="bg-muted h-3 w-full overflow-hidden rounded-full ring-1 ring-(--surface-ring)"
        >
          <div
            className="bg-primary glow-volt h-full origin-left rounded-full transition-[width] duration-500 ease-spring"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="font-heading shrink-0 text-sm font-bold tabular-nums">
          {percent}%
        </span>
      </div>
    </header>
  )
}
