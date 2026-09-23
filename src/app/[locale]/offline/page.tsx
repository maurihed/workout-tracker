import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function OfflinePage({
  params,
}: PageProps<"/[locale]/offline">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("offline.page")
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-heading text-xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("body")}</p>
    </main>
  )
}
