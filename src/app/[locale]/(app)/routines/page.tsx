"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RoutineList } from "@/features/routines/components/routine-list"
import { useActivateRoutine } from "@/features/routines/hooks/use-activate-routine"
import { useDeleteRoutine } from "@/features/routines/hooks/use-delete-routine"
import { useDuplicateRoutine } from "@/features/routines/hooks/use-duplicate-routine"
import { useRoutines } from "@/features/routines/hooks/use-routines"

function RoutinesSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}

export default function RoutinesPage() {
  const t = useTranslations("routines")
  const tNav = useTranslations("nav")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { data: routines, isLoading, isError, refetch } = useRoutines()
  const activate = useActivateRoutine()
  const duplicate = useDuplicateRoutine()
  const remove = useDeleteRoutine()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold">{tNav("routines")}</h1>
        <Button asChild className="h-12">
          <Link href={`/${locale}/routines/new`}>{t("new")}</Link>
        </Button>
      </div>

      {isLoading ? <RoutinesSkeleton label={tCommon("loading")} /> : null}

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

      {!isLoading && !isError ? (
        <RoutineList
          routines={routines ?? []}
          onActivate={(id) => activate.mutate(id)}
          onDuplicate={(id) => duplicate.mutate(id)}
          onDelete={(id) => remove.mutate(id)}
        />
      ) : null}
    </div>
  )
}
