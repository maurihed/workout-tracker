"use client"

import { ChartLine } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { HistoryList } from "@/features/history/components/history-list"
import { useProfile } from "@/features/profile/hooks/use-profile"

export default function ProgressPage() {
  const t = useTranslations("history")
  const tMetrics = useTranslations("metrics")
  const locale = useLocale()
  const profile = useProfile()
  const unitSystem = profile.data?.unitSystem ?? "metric"

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href={`/${locale}/progress/metrics`}>
            <ChartLine className="size-4" aria-hidden="true" />
            {tMetrics("title")}
          </Link>
        </Button>
      </div>
      <HistoryList unitSystem={unitSystem} />
    </div>
  )
}
