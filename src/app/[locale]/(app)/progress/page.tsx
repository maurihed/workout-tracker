"use client"

import { useTranslations } from "next-intl"

import { HistoryList } from "@/features/history/components/history-list"
import { useProfile } from "@/features/profile/hooks/use-profile"

export default function ProgressPage() {
  const t = useTranslations("history")
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {t("title")}
      </h1>
      <HistoryList unitSystem={unitSystem} />
    </div>
  )
}
