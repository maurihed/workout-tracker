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
    <div className="animate-rise flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="glow-volt bg-primary text-primary-foreground flex size-20 items-center justify-center rounded-[2rem] ring-1 ring-inset ring-foreground/10">
        <Sparkle className="size-10" weight="fill" aria-hidden="true" />
      </span>
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {t(`${titleKey}.title`)}
      </h1>
      <p className="text-muted-foreground max-w-xs text-sm">
        {t("comingSoon.message")}
      </p>
    </div>
  )
}
