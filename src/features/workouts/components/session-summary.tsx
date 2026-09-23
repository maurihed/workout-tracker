"use client"

import { Clock, FlagCheckered, Stack, Trophy } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { useProfile } from "@/features/profile/hooks/use-profile"
import { computeSummary, formatDuration, type SummaryInput } from "@/features/workouts/lib/summary"
import { formatWeight } from "@/features/workouts/lib/units"

type StatProps = {
  icon: typeof Clock
  label: string
  value: string
  delay: number
}

function Stat({ icon: Icon, label, value, delay }: StatProps) {
  return (
    <div
      className="animate-rise bg-card flex flex-col gap-2 rounded-3xl border border-border p-4 ring-1 ring-(--surface-ring)"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-2xl">
        <Icon className="size-5" weight="duotone" aria-hidden="true" />
      </span>
      <dd className="font-heading text-3xl font-bold tabular-nums">{value}</dd>
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </dt>
    </div>
  )
}

export function SessionSummary({ session }: { session: SummaryInput }) {
  const t = useTranslations("summary")
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"
  const summary = computeSummary(session)

  return (
    <section className="space-y-5">
      <div className="animate-rise glow-volt bg-primary text-primary-foreground relative flex items-center gap-4 overflow-hidden rounded-3xl p-5 ring-1 ring-inset ring-foreground/10">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-3xl bg-foreground/10">
          <Trophy className="size-7" weight="fill" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="flex items-center gap-1.5 text-sm font-medium opacity-80">
            <FlagCheckered className="size-4" weight="fill" aria-hidden="true" />
            {summary.completedSets} {t("sets")}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          icon={Clock}
          label={t("duration")}
          value={formatDuration(summary.durationSeconds)}
          delay={60}
        />
        <Stat
          icon={Stack}
          label={t("sets")}
          value={String(summary.completedSets)}
          delay={120}
        />
        <Stat
          icon={Trophy}
          label={t("volume")}
          value={formatWeight(summary.totalVolumeKg, unitSystem)}
          delay={180}
        />
      </dl>
    </section>
  )
}
