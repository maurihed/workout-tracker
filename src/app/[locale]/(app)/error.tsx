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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <WarningOctagon
        className="text-destructive size-10"
        weight="fill"
        aria-hidden="true"
      />
      <p className="font-heading text-lg font-medium">{t("error")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </div>
  )
}
