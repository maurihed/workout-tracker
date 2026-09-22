import { getTranslations, setRequestLocale } from "next-intl/server"

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("app")

  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="font-heading text-4xl font-bold">{t("name")}</h1>
        <p className="text-muted-foreground mt-2">{t("tagline")}</p>
      </div>
    </main>
  )
}
