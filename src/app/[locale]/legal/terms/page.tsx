import { getTranslations, setRequestLocale } from "next-intl/server"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/terms">) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "legal" })

  return {
    title: t("terms"),
    description: t("termsBody"),
  }
}

export default async function TermsPage({
  params,
}: PageProps<"/[locale]/legal/terms">) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("legal")

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <article className="text-muted-foreground leading-relaxed">
        <h1 className="font-heading text-foreground mb-4 text-3xl font-bold">
          {t("terms")}
        </h1>
        <p>{t("termsBody")}</p>
      </article>
    </main>
  )
}
