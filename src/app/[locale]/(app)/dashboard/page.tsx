import { Barbell, ChartLineUp, ListChecks } from "@phosphor-icons/react/ssr"
import { getTranslations, setRequestLocale } from "next-intl/server"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const PLACEHOLDERS = [
  { key: "routines", icon: Barbell },
  { key: "workout", icon: ListChecks },
  { key: "progress", icon: ChartLineUp },
] as const

export default async function DashboardPage({
  params,
}: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("nav")
  const tApp = await getTranslations("app")
  const tCommon = await getTranslations("common")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("dashboard")}</h1>
        <p className="text-muted-foreground text-sm">{tApp("tagline")}</p>
      </div>
      <div className="grid gap-3">
        {PLACEHOLDERS.map(({ key, icon: Icon }) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="text-primary size-5" aria-hidden="true" />
                {t(key)}
              </CardTitle>
              <CardDescription>{tCommon("empty")}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  )
}
