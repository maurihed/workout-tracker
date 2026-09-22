import { getTranslations } from "next-intl/server"

import { ThemeToggle } from "@/components/theme-toggle"

export async function AppHeader() {
  const t = await getTranslations("app")

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-lg items-center justify-between gap-2 px-4">
        <span className="font-heading text-lg font-semibold">{t("name")}</span>
        <ThemeToggle />
      </div>
    </header>
  )
}
