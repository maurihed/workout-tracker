"use client"

import { Barbell } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { RoutineCard } from "@/features/routines/components/routine-card"
import type { RoutineSummary } from "@/features/routines/hooks/use-routines"

type RoutineListProps = {
  routines: RoutineSummary[]
  onActivate: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

export function RoutineList({
  routines,
  onActivate,
  onDuplicate,
  onDelete,
}: RoutineListProps) {
  const t = useTranslations("routines")
  const locale = useLocale()

  if (routines.length === 0) {
    return (
      <EmptyState
        icon={Barbell}
        title={t("empty")}
        action={
          <Button asChild className="h-12">
            <Link href={`/${locale}/routines/new`}>{t("new")}</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {routines.map((routine) => (
        <li key={routine.id}>
          <RoutineCard
            routine={routine}
            onActivate={onActivate}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </li>
      ))}
    </ul>
  )
}
