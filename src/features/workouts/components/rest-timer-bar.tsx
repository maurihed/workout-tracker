"use client"

import { ArrowCounterClockwise, Minus, Plus } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { formatClock } from "@/features/workouts/lib/format-time"
import type { TimerState } from "@/features/workouts/lib/timer"

type RestTimerBarProps = {
  timer: TimerState
  onAdjust: (deltaSeconds: number) => void
  onSkip: () => void
}

export function RestTimerBar({ timer, onAdjust, onSkip }: RestTimerBarProps) {
  const t = useTranslations("timers")
  const percent =
    timer.total > 0
      ? Math.min(100, Math.max(0, (timer.remaining / timer.total) * 100))
      : 0

  return (
    <section
      className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3"
      aria-label={t("rest")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="font-heading text-2xl font-bold tabular-nums"
          role="timer"
          aria-live="polite"
        >
          {formatClock(timer.remaining)}
        </span>
        <span className="text-muted-foreground text-xs">
          {timer.running ? t("running") : t("paused")}
        </span>
      </div>

      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          aria-label={`${t("adjust")} -15`}
          onClick={() => onAdjust(-15)}
        >
          <Minus className="size-4" aria-hidden="true" />
          15
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          aria-label={`${t("adjust")} +15`}
          onClick={() => onAdjust(15)}
        >
          <Plus className="size-4" aria-hidden="true" />
          15
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 flex-1"
          aria-label={t("skip")}
          onClick={onSkip}
        >
          <ArrowCounterClockwise className="size-4" aria-hidden="true" />
          {t("skip")}
        </Button>
      </div>
    </section>
  )
}
