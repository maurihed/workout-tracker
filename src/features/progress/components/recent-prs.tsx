"use client"

import { CaretRight, Trophy } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { PrItemDTO } from "@/server/services/progress.service"
import { formatWeight } from "@/features/workouts/lib/units"

type RecentPrsProps = {
  items: PrItemDTO[]
  unitSystem?: "metric" | "imperial"
}

export function RecentPrs({ items, unitSystem = "metric" }: RecentPrsProps) {
  const t = useTranslations("pr")
  const locale = useLocale()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recentPrs")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={Trophy} title={t("empty")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const name =
                locale === "es" ? (item.nameEs ?? item.name) : item.name
              const date = new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeZone: "UTC",
              }).format(new Date(`${item.date}T00:00:00Z`))

              return (
                <li key={`${item.sessionId}-${item.exerciseId}`}>
                  <Link
                    href={`/${locale}/progress/exercise/${item.exerciseId}`}
                    className="bg-muted/40 border-border hover:bg-muted flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-3.5 py-2 transition-colors"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{name}</span>
                      <span className="text-muted-foreground text-xs">
                        {date}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sm font-medium tabular-nums">
                      {`${item.reps} × ${formatWeight(item.weightKg, unitSystem)}`}
                      <CaretRight
                        className="text-muted-foreground size-4"
                        aria-hidden="true"
                      />
                      <span className="sr-only">{t("viewProgress")}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
