"use client"

import { CircleNotch, WarningCircle } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import type { AiJobStatus } from "@/features/ai/schemas/job"

const CANCELLABLE: AiJobStatus[] = ["queued", "running"]
const SPINNING: AiJobStatus[] = ["queued", "running"]
const RETRYABLE: AiJobStatus[] = ["failed", "cancelled"]

type JobProgressProps = {
  status: AiJobStatus
  error?: string | null
  onCancel?: () => void
  isCancelling?: boolean
  onRestart?: () => void
}

export function JobProgress({
  status,
  error,
  onCancel,
  isCancelling = false,
  onRestart,
}: JobProgressProps) {
  const t = useTranslations("ai")
  const tCommon = useTranslations("common")

  const isFailed = status === "failed"
  const errorMessage =
    error && /unavailable/i.test(error)
      ? t("errors.unavailable")
      : t("errors.generic")

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise flex flex-col items-center gap-4 rounded-3xl bg-card/80 p-8 text-center ring-1 ring-(--surface-ring)"
    >
      {SPINNING.includes(status) ? (
        <CircleNotch
          className="text-primary size-9 animate-spin"
          weight="bold"
          aria-hidden="true"
        />
      ) : null}
      {isFailed ? (
        <WarningCircle
          className="text-destructive size-9"
          weight="fill"
          aria-hidden="true"
        />
      ) : null}

      <p className="font-heading text-xl font-bold tracking-tight">
        {t(`status.${status}`)}
      </p>

      {isFailed ? (
        <p className="text-muted-foreground max-w-sm text-sm">{errorMessage}</p>
      ) : null}

      {CANCELLABLE.includes(status) && onCancel ? (
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={isCancelling}
          onClick={onCancel}
        >
          {tCommon("cancel")}
        </Button>
      ) : null}

      {RETRYABLE.includes(status) && onRestart ? (
        <Button type="button" className="h-12" onClick={onRestart}>
          {t("preview.regenerate")}
        </Button>
      ) : null}
    </div>
  )
}
