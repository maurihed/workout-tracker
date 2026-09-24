"use client"

import { Clock, Stack, Trophy } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { computeSummary, formatDuration } from "@/features/workouts/lib/summary"
import { formatWeight } from "@/features/workouts/lib/units"
import type { UnitSystem } from "@/features/workouts/components/set-row"
import type { SessionDTO } from "@/features/workouts/hooks/use-active-session"

type HistoryDetailProps = {
  session: SessionDTO
  unitSystem?: UnitSystem
}

export function HistoryDetail({
  session,
  unitSystem = "metric",
}: HistoryDetailProps) {
  const t = useTranslations("history")
  const locale = useLocale()
  const summary = computeSummary(session)
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.completedAt ?? session.startedAt))

  return (
    <article className="flex flex-col gap-6">
      <header className="bg-card flex flex-col gap-3 rounded-3xl border border-border p-5 ring-1 ring-(--surface-ring)">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {session.name}
          </h1>
          <p className="text-muted-foreground text-sm font-medium">{date}</p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <div className="flex items-center gap-1.5">
            <Clock className="text-muted-foreground size-4" weight="duotone" aria-hidden="true" />
            <dt className="sr-only">{t("duration")}</dt>
            <dd className="tabular-nums">{formatDuration(summary.durationSeconds)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Stack className="text-muted-foreground size-4" weight="duotone" aria-hidden="true" />
            <dt className="sr-only">{t("sets")}</dt>
            <dd className="tabular-nums">{summary.completedSets}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Trophy className="text-muted-foreground size-4" weight="duotone" aria-hidden="true" />
            <dt className="sr-only">{t("volume")}</dt>
            <dd className="tabular-nums">
              {formatWeight(summary.totalVolumeKg, unitSystem)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-col gap-5">
        {session.exercises.map((exercise) => (
          <section key={exercise.id} className="flex flex-col gap-2">
            <h2 className="font-heading text-lg font-bold tracking-tight">
              {exercise.exerciseId ? (
                <Link
                  href={`/${locale}/progress/exercise/${exercise.exerciseId}`}
                  className="focus-visible:ring-ring/50 rounded-md outline-none hover:text-primary focus-visible:ring-3"
                >
                  {exercise.nameSnapshot}
                </Link>
              ) : (
                exercise.nameSnapshot
              )}
            </h2>
            <ul className="flex flex-col gap-2">
              {exercise.sets.map((set) => (
                <li
                  key={set.id}
                  className="bg-muted/40 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border px-3.5 py-2"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums">
                      {set.setNumber}
                    </span>
                    <span className="tabular-nums">
                      {set.durationSeconds != null
                        ? formatDuration(set.durationSeconds)
                        : `${set.reps ?? 0} × ${
                            set.weightKg == null
                              ? "—"
                              : formatWeight(set.weightKg, unitSystem)
                          }`}
                    </span>
                  </span>
                  {set.isPr ? (
                    <Badge variant="success">
                      <Trophy className="size-3" weight="fill" aria-hidden="true" />
                      {t("pr")}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  )
}
