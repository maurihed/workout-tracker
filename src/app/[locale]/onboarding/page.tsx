import { setRequestLocale } from "next-intl/server"
import { redirect } from "next/navigation"

import {
  SkipOnboardingButton,
  Wizard,
} from "@/features/onboarding/components/wizard"
import { needsOnboarding } from "@/features/onboarding/lib/onboarding"
import {
  EMPTY_ONBOARDING_PROFILE,
  firstIncompleteStep,
} from "@/features/onboarding/lib/steps"
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

  const initialStep = firstIncompleteStep(profile ?? EMPTY_ONBOARDING_PROFILE)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-4">
      <Wizard initialStep={initialStep} profile={profile} />
      <SkipOnboardingButton />
    </main>
  )
}
