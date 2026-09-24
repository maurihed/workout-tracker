"use client"

import { Barbell, SlidersHorizontal, WarningCircle } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useState } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { HistoryFilters } from "@/features/history/components/history-filters"
import { HistoryRow } from "@/features/history/components/history-row"
import {
  useHistory,
  type HistoryFilters as HistoryFilterValues,
} from "@/features/history/hooks/use-history"
import type { UnitSystem } from "@/features/workouts/components/set-row"

type HistoryListProps = {
  unitSystem?: UnitSystem
}

export function HistoryList({ unitSystem = "metric" }: HistoryListProps) {
  const t = useTranslations("history")
  const tCommon = useTranslations("common")
  const [filters, setFilters] = useState<HistoryFilterValues>({})
  const [showFilters, setShowFilters] = useState(false)
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useHistory(filters)

  const items = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section className="flex flex-col gap-4">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-start gap-2"
        onClick={() => setShowFilters((open) => !open)}
        aria-expanded={showFilters}
      >
        <SlidersHorizontal className="size-4" weight="bold" aria-hidden="true" />
        {showFilters ? t("close") : t("filters")}
      </Button>

      {showFilters ? (
        <HistoryFilters value={filters} onChange={setFilters} />
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-3" role="status" aria-busy="true">
          <span className="sr-only">{tCommon("loading")}</span>
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-3xl" />
        </div>
      ) : isError ? (
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
      ) : items.length === 0 ? (
        <EmptyState icon={Barbell} title={t("empty")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="animate-rise"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <HistoryRow item={item} unitSystem={unitSystem} />
            </li>
          ))}
        </ul>
      )}

      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {t("loadMore")}
        </Button>
      ) : null}
    </section>
  )
}
