import { CloudSlash } from "@phosphor-icons/react/dist/ssr"
import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function OfflinePage({
  params,
}: PageProps<"/[locale]/offline">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("offline.page")
  return (
    <main className="bg-background relative mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 overflow-hidden p-6 text-center">
      <div className="mesh-header pointer-events-none absolute inset-0 opacity-50" />
      <span className="bg-muted text-muted-foreground relative flex size-20 items-center justify-center rounded-[2rem] ring-1 ring-(--surface-ring)">
        <CloudSlash className="size-10" weight="duotone" aria-hidden="true" />
      </span>
      <h1 className="font-heading relative text-3xl font-bold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-muted-foreground relative text-sm">{t("body")}</p>
    </main>
  )
}
