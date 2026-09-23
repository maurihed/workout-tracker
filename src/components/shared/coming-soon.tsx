"use client"

import { Sparkle } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"

export type ComingSoonTitleKey = "workout" | "progress" | "profile"

type ComingSoonProps = {
  titleKey: ComingSoonTitleKey
}

export function ComingSoon({ titleKey }: ComingSoonProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Sparkle className="text-muted-foreground size-12" aria-hidden="true" />
      <h1 className="font-heading text-xl font-semibold">
        {t(`${titleKey}.title`)}
      </h1>
      <p className="text-muted-foreground text-sm">{t("comingSoon.message")}</p>
    </div>
  )
}
