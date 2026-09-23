"use client"

import { useTranslations } from "next-intl"

import { useProfile } from "@/features/profile/hooks/use-profile"
import { computeSummary, formatDuration, type SummaryInput } from "@/features/workouts/lib/summary"
import { formatWeight } from "@/features/workouts/lib/units"

type StatProps = {
  label: string
  value: string
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="bg-card rounded-xl border p-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-heading text-xl font-bold tabular-nums">{value}</dd>
    </div>
  )
}

export function SessionSummary({ session }: { session: SummaryInput }) {
  const t = useTranslations("summary")
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"
  const summary = computeSummary(session)

  return (
    <section className="space-y-4">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={t("duration")}
          value={formatDuration(summary.durationSeconds)}
        />
        <Stat label={t("sets")} value={String(summary.completedSets)} />
        <Stat
          label={t("volume")}
          value={formatWeight(summary.totalVolumeKg, unitSystem)}
        />
      </dl>
    </section>
  )
}
