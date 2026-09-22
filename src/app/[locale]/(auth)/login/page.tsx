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

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("signIn")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SignInButtons />
        </CardContent>
      </Card>
    </main>
  )
}
