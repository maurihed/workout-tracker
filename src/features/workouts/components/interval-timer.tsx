"use client"

import { Pause, Play, SkipForward } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { formatClock } from "@/features/workouts/lib/format-time"
import type { TimerState } from "@/features/workouts/lib/timer"
import { cn } from "@/lib/utils"

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
  const isWork = timer.phase === "work"
  const fg = isWork ? "text-accent-foreground" : "text-secondary-foreground"

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-3xl p-4 ring-1 ring-inset ring-foreground/10",
        isWork ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground",
      )}
      aria-label={t("interval")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="font-heading text-3xl font-bold tabular-nums"
          role="timer"
          aria-live="polite"
        >
          {formatClock(timer.remaining)}
        </span>
        <span className="rounded-full bg-foreground/15 px-2.5 py-0.5 text-xs font-semibold">
          {t("round", { round: timer.round, rounds: timer.rounds })}
        </span>
      </div>

      <span className="text-sm font-semibold tracking-wide uppercase opacity-90">
        {isWork ? t("work") : t("rest")}
      </span>

      <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/20">
        <div
          className="bg-primary h-full origin-left rounded-full transition-[width] duration-500 ease-spring"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-11 flex-1 bg-foreground/10 hover:bg-foreground/20",
            fg,
          )}
          aria-label={timer.running ? t("pause") : t("start")}
          onClick={() => (timer.running ? onPause() : onStart())}
        >
          {timer.running ? (
            <Pause className="size-4" weight="fill" aria-hidden="true" />
          ) : (
            <Play className="size-4" weight="fill" aria-hidden="true" />
          )}
          {timer.running ? t("pause") : t("start")}
        </Button>
        <Button
          type="button"
          className="h-11 flex-1"
          aria-label={t("skipRound")}
          onClick={onSkipRound}
        >
          <SkipForward className="size-4" weight="fill" aria-hidden="true" />
          {t("skipRound")}
        </Button>
      </div>
    </section>
  )
}
