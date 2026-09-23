"use client"

import { WarningOctagon } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("common")

  return (
    <div className="animate-rise flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="bg-destructive/15 text-destructive flex size-20 items-center justify-center rounded-[2rem]">
        <WarningOctagon className="size-10" weight="fill" aria-hidden="true" />
      </span>
      <p className="font-heading text-xl font-bold tracking-tight">
        {t("error")}
      </p>
      <Button onClick={reset} className="h-12">
        {t("retry")}
      </Button>
    </div>
  )
}
