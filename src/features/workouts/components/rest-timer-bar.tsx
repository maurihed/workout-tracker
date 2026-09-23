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
      className="bg-secondary text-secondary-foreground flex flex-col gap-3 rounded-3xl p-4 ring-1 ring-inset ring-foreground/10"
      aria-label={t("rest")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="font-heading text-3xl font-bold tabular-nums"
          role="timer"
          aria-live="polite"
        >
          {formatClock(timer.remaining)}
        </span>
        <span className="rounded-full bg-secondary-foreground/15 px-2.5 py-0.5 text-xs font-semibold">
          {timer.running ? t("running") : t("paused")}
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary-foreground/20">
        <div
          className="bg-primary h-full origin-left rounded-full transition-[width] duration-500 ease-spring"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 bg-secondary-foreground/10 text-secondary-foreground hover:bg-secondary-foreground/20"
          aria-label={`${t("adjust")} -15`}
          onClick={() => onAdjust(-15)}
        >
          <Minus className="size-4" weight="bold" aria-hidden="true" />
          15
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 bg-secondary-foreground/10 text-secondary-foreground hover:bg-secondary-foreground/20"
          aria-label={`${t("adjust")} +15`}
          onClick={() => onAdjust(15)}
        >
          <Plus className="size-4" weight="bold" aria-hidden="true" />
          15
        </Button>
        <Button
          type="button"
          className="h-11 flex-1"
          aria-label={t("skip")}
          onClick={onSkip}
        >
          <ArrowCounterClockwise className="size-4" weight="bold" aria-hidden="true" />
          {t("skip")}
        </Button>
      </div>
    </section>
  )
}
