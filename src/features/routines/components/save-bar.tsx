"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type SaveBarProps = {
  isDirty: boolean
  isPending: boolean
  error: string | null
  onSave: () => void
}

export function SaveBar({ isDirty, isPending, error, onSave }: SaveBarProps) {
  const t = useTranslations("routineEditor")

  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t px-4 py-3 backdrop-blur">
      {error ? (
        <p
          role="alert"
          aria-live="assertive"
          className="text-destructive text-sm"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        {isDirty ? (
          <Badge variant="secondary" aria-live="polite">
            {t("unsaved")}
          </Badge>
        ) : null}
        <Button
          type="button"
          className="h-12 flex-1"
          disabled={!isDirty || isPending}
          aria-busy={isPending}
          onClick={onSave}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  )
}
