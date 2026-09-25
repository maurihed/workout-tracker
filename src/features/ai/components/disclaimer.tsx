"use client"

import { Warning } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

export function Disclaimer() {
  const t = useTranslations("ai")

  return (
    <p
      role="note"
      className="bg-muted/60 text-muted-foreground flex items-start gap-2 rounded-2xl p-3 text-xs leading-relaxed ring-1 ring-(--surface-ring)"
    >
      <Warning
        className="text-warning mt-0.5 size-4 shrink-0"
        weight="fill"
        aria-hidden="true"
      />
      {t("disclaimer")}
    </p>
  )
}
