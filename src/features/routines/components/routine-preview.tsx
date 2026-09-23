"use client"

import {
  Barbell,
  CalendarCheck,
  Flame,
  Lightning,
  Play,
  Stack,
  Trophy,
} from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"
import { useEffect, useState, type CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { weekdayLabel } from "@/features/routines/lib/weekdays"

const RING_RADIUS = 42
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

function ProgressRing({
  value,
  label,
  caption,
}: {
  value: number
  label: string
  caption: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="relative grid size-28 shrink-0 place-items-center">
      <svg
        viewBox="0 0 100 100"
        className="size-28 -rotate-90"
        role="img"
        aria-label={`${label} ${clamped}%`}
      >
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="10"
        />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - clamped / 100)}
          style={
            {
              "--ring-circumference": RING_CIRCUMFERENCE,
            } as CSSProperties
          }
          className="animate-ring"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-heading text-2xl font-bold tabular-nums">
          {clamped}%
        </span>
        <span className="text-muted-foreground max-w-20 text-center text-[0.6rem] leading-tight font-semibold tracking-wide uppercase">
          {caption}
        </span>
      </div>
    </div>
  )
}

function StatTile({
  icon: Icon,
  value,
  label,
  delay,
}: {
  icon: typeof Barbell
  value: number
  label: string
  delay: number
}) {
  const display = useCountUp(value)
  return (
    <Card
      size="sm"
      className="animate-rise bg-card/80 gap-3 py-4 backdrop-blur"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="flex flex-col gap-2">
        <span className="bg-muted text-foreground flex size-9 items-center justify-center rounded-2xl ring-1 ring-(--surface-ring)">
          <Icon className="size-5" weight="duotone" aria-hidden="true" />
        </span>
        <span className="font-heading text-4xl leading-none font-bold tabular-nums">
          {display}
        </span>
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {label}
        </span>
      </CardContent>
    </Card>
  )
}

export function RoutinePreview({ routine }: { routine: RoutineDTO }) {
  const t = useTranslations("dashboard")
  const tGamify = useTranslations("gamify")
  const locale = useLocale()
  const routineName =
    locale === "es" ? (routine.nameEs ?? routine.name) : routine.name
  const exerciseName = (exercise: {
    name: string
    nameEs: string | null
  }): string => (locale === "es" ? (exercise.nameEs ?? exercise.name) : exercise.name)

  const totalDays = routine.days.length
  const totalExercises = routine.days.reduce(
    (sum, day) => sum + day.exercises.length,
    0,
  )
  const totalSets = routine.days.reduce(
    (sum, day) =>
      sum + day.exercises.reduce((acc, item) => acc + item.targetSets, 0),
    0,
  )
  const level = Math.max(1, Math.floor(totalExercises / 4) + 1)
  const xp = totalExercises * 50 + totalDays * 100
  const xpInLevel = xp % 500
  const readiness = Math.round((totalDays / 7) * 100)

  return (
    <section className="flex flex-col gap-3" aria-label={t("activeRoutine")}>
      <Card className="animate-rise glow-volt relative overflow-hidden bg-card/90 backdrop-blur">
        <div className="mesh-header pointer-events-none absolute inset-0 opacity-50" />
        <CardContent className="relative flex items-center gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <Lightning className="size-3.5" weight="fill" aria-hidden="true" />
              {t("activeRoutine")}
            </span>
            <h2 className="font-heading text-3xl leading-tight font-bold tracking-tight text-balance">
              {routineName}
            </h2>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="bg-secondary text-secondary-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-foreground/10">
                <Trophy className="size-3.5" weight="fill" aria-hidden="true" />
                {tGamify("level", { level })}
              </span>
              <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
                {tGamify("xp", { value: xp })}
              </span>
            </div>
          </div>
          <ProgressRing
            value={readiness}
            label={tGamify("readiness")}
            caption={tGamify("readiness")}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={CalendarCheck}
          value={totalDays}
          label={tGamify("days")}
          delay={60}
        />
        <StatTile
          icon={Barbell}
          value={totalExercises}
          label={tGamify("exercises")}
          delay={120}
        />
        <Card
          size="sm"
          className="animate-rise bg-card/80 col-span-2 gap-3 py-4 backdrop-blur"
          style={{ animationDelay: "180ms" }}
        >
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                <Flame
                  className="text-accent size-4"
                  weight="fill"
                  aria-hidden="true"
                />
                {tGamify("streak")}
              </span>
              <span className="font-heading text-sm font-bold tabular-nums">
                {tGamify("week")}
              </span>
            </div>
            <div
              className="bg-muted h-3 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={500}
              aria-valuenow={xpInLevel}
              aria-label={tGamify("progressLabel")}
            >
              <div
                className="animate-bar bg-primary h-full origin-left rounded-full"
                style={{ width: `${(xpInLevel / 500) * 100}%` }}
              />
            </div>
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Stack className="size-4" aria-hidden="true" />
              {tGamify("sets")}: {totalSets}
            </div>
          </CardContent>
        </Card>
      </div>

      <ul className="flex flex-col gap-3">
        {routine.days.map((day, index) => (
          <li
            key={day.id}
            className="animate-rise"
            style={{ animationDelay: `${240 + index * 60}ms` }}
          >
            <Card className="bg-card/80 backdrop-blur">
              <CardHeader className="gap-2">
                <div className="flex items-center gap-3">
                  <span className="bg-foreground text-background font-heading flex size-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold tabular-nums">
                    {index + 1}
                  </span>
                  <CardTitle className="text-lg">
                    {day.label ?? weekdayLabel(locale, day.weekday)}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {day.exercises.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="font-medium">
                        {item.exercise
                          ? exerciseName(item.exercise)
                          : (item.customName ?? "")}
                      </span>
                      <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                        {item.targetSets} × {item.targetReps}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Button asChild size="lg" className="animate-rise w-full">
        <Link href={`/${locale}/workout`}>
          <Play className="size-5" weight="fill" aria-hidden="true" />
          {t("startWorkout")}
        </Link>
      </Button>
    </section>
  )
}
