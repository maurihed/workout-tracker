import { Lightning } from "@phosphor-icons/react/dist/ssr"
import { getTranslations } from "next-intl/server"

import { ThemeToggle } from "@/components/theme-toggle"

export async function AppHeader() {
  const t = await getTranslations("app")

  return (
    <header className="bg-background/80 sticky top-0 z-30 border-b border-border/60 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mesh-header pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto flex min-h-16 w-full max-w-lg items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-2.5">
          <span className="glow-volt bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-2xl ring-1 ring-inset ring-foreground/10">
            <Lightning className="size-5" weight="fill" aria-hidden="true" />
          </span>
          <span className="font-heading text-lg font-bold tracking-tight">
            {t("name")}
          </span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
