"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RoutineEditor } from "@/features/routines/components/routine-editor"
import { useRoutine } from "@/features/routines/hooks/use-routine"

function EditorSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-11 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-28 w-full rounded-3xl" />
    </div>
  )
}

export default function RoutineDetailPage() {
  const t = useTranslations("routineEditor")
  const tCommon = useTranslations("common")
  const params = useParams()
  const routineId =
    typeof params?.routineId === "string" ? params.routineId : ""
  const { isLoading, isError, refetch } = useRoutine(routineId)

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {t("title")}
      </h1>

      {isLoading ? <EditorSkeleton label={tCommon("loading")} /> : null}

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
        <RoutineEditor routineId={routineId} />
      ) : null}
    </div>
  )
}
