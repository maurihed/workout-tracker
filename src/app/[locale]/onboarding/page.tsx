import { setRequestLocale } from "next-intl/server"
import { redirect } from "next/navigation"

import {
  SkipOnboardingButton,
  Wizard,
} from "@/features/onboarding/components/wizard"
import { shouldLeaveOnboarding } from "@/features/onboarding/lib/onboarding"
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
  if (shouldLeaveOnboarding(profile)) redirect(`/${locale}/dashboard`)

  const initialStep = firstIncompleteStep(profile ?? EMPTY_ONBOARDING_PROFILE)

  return (
    <main className="bg-background relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 overflow-hidden p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="mesh-header pointer-events-none absolute inset-x-0 top-0 h-56 opacity-60" />
      <div className="relative flex flex-1 flex-col gap-6">
        <Wizard initialStep={initialStep} profile={profile} />
        <SkipOnboardingButton />
      </div>
    </main>
  )
}
