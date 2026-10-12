import { ArrowRight, Lightning } from "@phosphor-icons/react/dist/ssr"
import { getTranslations, setRequestLocale } from "next-intl/server"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("app")

  return (
    <main className="bg-background relative grid min-h-dvh place-items-center overflow-hidden p-6 text-center">
      <div className="mesh-header pointer-events-none absolute inset-0 opacity-70" />
      <div className="animate-rise relative flex flex-col items-center gap-5">
        <span className="glow-volt bg-primary text-primary-foreground flex size-24 items-center justify-center rounded-[2.25rem] ring-1 ring-inset ring-foreground/10">
          <Lightning className="size-12" weight="fill" aria-hidden="true" />
        </span>
        <h1 className="font-heading text-5xl font-bold tracking-tight text-balance">
          {t("name")}
        </h1>
        <p className="text-muted-foreground max-w-xs text-lg text-balance">
          {t("tagline")}
        </p>
        <Button asChild size="lg">
          <Link href={`/${locale}/dashboard`}>
            {t("continue")}
            <ArrowRight weight="bold" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </main>
  )
}
