import { getTranslations } from "next-intl/server"

import { Skeleton } from "@/components/ui/skeleton"

export default async function AppLoading() {
  const t = await getTranslations("common")

  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{t("loading")}</span>
      <div className="space-y-3">
        <Skeleton className="h-9 w-44 rounded-2xl" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-44 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-3xl" />
      </div>
      <Skeleton className="h-24 w-full rounded-3xl" />
    </div>
  )
}
