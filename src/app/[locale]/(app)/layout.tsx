import { setRequestLocale } from "next-intl/server"
import { redirect } from "next/navigation"

import { AppHeader } from "@/components/shared/app-header"
import { BottomNav } from "@/components/shared/bottom-nav"
import { needsOnboarding } from "@/features/onboarding/lib/onboarding"
import { auth } from "@/lib/auth"
import { getProfileOrNull } from "@/server/services/profile.service"

export default async function AppLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  setRequestLocale(locale)

  const session = await auth()
  if (!session?.user) redirect(`/${locale}/login`)

  const profile = await getProfileOrNull(session.user.id)
  if (!profile || needsOnboarding(profile)) redirect(`/${locale}/onboarding`)

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
