"use client"

import { Pause, Play, SkipForward } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { formatClock } from "@/features/workouts/lib/format-time"
import type { TimerState } from "@/features/workouts/lib/timer"

type IntervalTimerProps = {
  timer: TimerState
  onStart: () => void
  onPause: () => void
  onSkipRound: () => void
}

export function IntervalTimer({
  timer,
  onStart,
  onPause,
  onSkipRound,
}: IntervalTimerProps) {
  const t = useTranslations("timers")
  const percent =
    timer.total > 0
      ? Math.min(100, Math.max(0, (timer.remaining / timer.total) * 100))
      : 0

  return (
    <section
      className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3"
      aria-label={t("interval")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-2xl font-bold tabular-nums" role="timer" aria-live="polite">
          {formatClock(timer.remaining)}
        </span>
        <span className="text-muted-foreground text-xs">
          {t("round", { round: timer.round, rounds: timer.rounds })}
        </span>
      </div>

      <span className="text-muted-foreground text-xs">
        {timer.phase === "work" ? t("work") : t("rest")}
      </span>

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
          aria-label={timer.running ? t("pause") : t("start")}
          onClick={() => (timer.running ? onPause() : onStart())}
        >
          {timer.running ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {timer.running ? t("pause") : t("start")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 flex-1"
          aria-label={t("skipRound")}
          onClick={onSkipRound}
        >
          <SkipForward className="size-4" aria-hidden="true" />
          {t("skipRound")}
        </Button>
      </div>
    </section>
  )
}
