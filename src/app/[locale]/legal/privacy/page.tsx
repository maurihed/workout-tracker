import { getTranslations, setRequestLocale } from "next-intl/server"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/privacy">) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "legal" })

  return {
    title: t("privacy"),
    description: t("privacyBody"),
  }
}

export default async function PrivacyPage({
  params,
}: PageProps<"/[locale]/legal/privacy">) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("legal")

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <article className="prose text-muted-foreground leading-relaxed">
        <h1 className="font-heading text-foreground mb-4 text-3xl font-bold">
          {t("privacy")}
        </h1>
        <p>{t("privacyBody")}</p>
      </article>
    </main>
  )
}
