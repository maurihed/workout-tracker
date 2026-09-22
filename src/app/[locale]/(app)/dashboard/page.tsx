"use client"

import { Barbell, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RoutinePreview } from "@/features/routines/components/routine-preview"
import { useActiveRoutine } from "@/features/routines/hooks/use-active-routine"

function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  )
}

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const tNav = useTranslations("nav")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { data: routine, isLoading, isError, refetch } = useActiveRoutine()

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">{tNav("dashboard")}</h1>

      {isLoading ? <DashboardSkeleton label={tCommon("loading")} /> : null}

      {!isLoading && isError ? (
        <EmptyState
          icon={WarningCircle}
          title={tCommon("error")}
          action={
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => refetch()}
            >
              {tCommon("retry")}
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && routine ? (
        <RoutinePreview routine={routine} />
      ) : null}

      {!isLoading && !isError && !routine ? (
        <EmptyState
          icon={Barbell}
          title={t("noRoutine")}
          description={t("finishSetup")}
          action={
            <Button asChild className="h-12">
              <Link href={`/${locale}/onboarding`}>{t("pickRoutine")}</Link>
            </Button>
          }
        />
      ) : null}
    </div>
  )
}
