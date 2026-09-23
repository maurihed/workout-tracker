import { Lightning } from "@phosphor-icons/react/dist/ssr"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { redirect } from "next/navigation"

import { SignInButtons } from "@/components/auth/sign-in-buttons"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth"

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params
  setRequestLocale(locale)

  const session = await auth()
  if (session?.user) redirect("/")

  const t = await getTranslations("auth")
  const tApp = await getTranslations("app")

  return (
    <main className="bg-background relative grid min-h-dvh place-items-center overflow-hidden p-6">
      <div className="mesh-header pointer-events-none absolute inset-0 opacity-70" />
      <Card className="animate-rise relative w-full max-w-sm">
        <CardHeader className="items-center gap-3 pt-2 text-center">
          <span className="glow-volt bg-primary text-primary-foreground mx-auto flex size-16 items-center justify-center rounded-3xl ring-1 ring-inset ring-foreground/10">
            <Lightning className="size-8" weight="fill" aria-hidden="true" />
          </span>
          <CardTitle className="text-2xl">{t("signIn")}</CardTitle>
          <p className="text-muted-foreground text-sm">{tApp("tagline")}</p>
        </CardHeader>
        <CardContent>
          <SignInButtons />
        </CardContent>
      </Card>
    </main>
  )
}
