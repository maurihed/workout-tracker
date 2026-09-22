import { setRequestLocale } from "next-intl/server"
import { redirect } from "next/navigation"

import { AppHeader } from "@/components/shared/app-header"
import { BottomNav } from "@/components/shared/bottom-nav"
import { auth } from "@/lib/auth"

export default async function AppLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  setRequestLocale(locale)

  const session = await auth()
  if (!session?.user) redirect(`/${locale}/login`)

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
