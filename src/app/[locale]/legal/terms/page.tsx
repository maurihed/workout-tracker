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
    <main className="bg-background relative min-h-dvh overflow-hidden">
      <div className="mesh-header pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40" />
      <article className="relative mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-balance">
          {t("terms")}
        </h1>
        <p className="text-muted-foreground mt-6 text-base leading-relaxed">
          {t("termsBody")}
        </p>
      </article>
    </main>
  )
}
