import { getTranslations } from "next-intl/server"

import { Skeleton } from "@/components/ui/skeleton"

export default async function AppLoading() {
  const t = await getTranslations("common")

  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
