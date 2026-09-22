import { redirect } from "next/navigation"
import { setRequestLocale } from "next-intl/server"

import { needsOnboarding } from "@/features/onboarding/lib/onboarding"
import { auth } from "@/lib/auth"
import { getProfileOrNull } from "@/server/services/profile.service"

export default async function OnboardingPage({
  params,
}: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params
  setRequestLocale(locale)

  const session = await auth()
  if (!session?.user?.id) redirect(`/${locale}/login`)

  const profile = await getProfileOrNull(session.user.id)
  if (profile && !needsOnboarding(profile)) redirect(`/${locale}/dashboard`)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md p-4">
      {/* wizard mounts in Task 8 */}
    </main>
  )
}
