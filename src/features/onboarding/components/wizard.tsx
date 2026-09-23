"use client"

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useSaveOnboardingStep } from "@/features/onboarding/hooks/use-save-onboarding-step"
import {
  EMPTY_ONBOARDING_PROFILE,
  ONBOARDING_STEPS,
  isStepComplete,
  type StepId,
  type StepProfile,
} from "@/features/onboarding/lib/steps"
import { useOnboardingStore } from "@/features/onboarding/stores/onboarding-store"

import { EquipmentStep } from "./equipment-step"
import { ExperienceStep } from "./experience-step"
import { GoalStep } from "./goal-step"
import { MetricsStep } from "./metrics-step"
import { PreferencesStep } from "./preferences-step"
import { ScheduleStep } from "./schedule-step"
import { TemplatePickStep } from "./template-pick-step"

export type WizardProfile = StepProfile & {
  birthYear: number | null
  heightCm: number | null
  weightKg: number | null
  gender: string | null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null
}

function asStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null
}

function stepPatch(id: StepId, draft: StepProfile): Record<string, unknown> {
  switch (id) {
    case "goal":
      return { goal: draft.goal }
    case "experience":
      return { experience: draft.experience }
    case "equipment":
      return { location: draft.location, equipment: draft.equipment }
    case "schedule":
      return { daysPerWeek: draft.daysPerWeek }
    case "preferences":
      return { unitSystem: draft.unitSystem, timezone: draft.timezone }
    default:
      // `metrics` and `template` own their actions in-step and never reach here.
      return {}
  }
}

export function Wizard({
  initialStep,
  profile,
}: {
  initialStep: StepId
  profile: WizardProfile | null
}) {
  const t = useTranslations("onboarding")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const locale = useLocale()
  const save = useSaveOnboardingStep()
  const { stepIndex, answers, setAnswer, goNext, goBack, reset } =
    useOnboardingStore()

  useEffect(() => {
    reset(initialStep)
  }, [initialStep, reset])

  const current = ONBOARDING_STEPS[stepIndex]?.id ?? initialStep
  const base = profile ?? EMPTY_ONBOARDING_PROFILE
  const draft: StepProfile = {
    goal: asString(answers.goal) ?? base.goal,
    experience: asString(answers.experience) ?? base.experience,
    location: asString(answers.location) ?? base.location,
    equipment: asStringArray(answers.equipment) ?? base.equipment,
    daysPerWeek: asNumber(answers.daysPerWeek) ?? base.daysPerWeek,
    unitSystem: asString(answers.unitSystem) ?? base.unitSystem,
    timezone: asString(answers.timezone) ?? base.timezone,
  }

  const canContinue = isStepComplete(current, draft)
  const firstIndex = ONBOARDING_STEPS.findIndex(
    (step) => step.id === initialStep,
  )
  const canGoBack = stepIndex > Math.max(firstIndex, 0)
  const stepOwnsActions = current === "metrics" || current === "template"

  function handlePicked() {
    router.push(`/${locale}/dashboard`)
  }

  async function handleNext() {
    try {
      const patch = stepPatch(current, draft)
      if (Object.keys(patch).length > 0) await save.mutateAsync(patch)
      goNext()
    } catch {
      toast.error(tCommon("error"))
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
        <div className="bg-muted h-2.5 overflow-hidden rounded-full ring-1 ring-(--surface-ring)">
          <div
            className="bg-primary glow-volt h-full origin-left rounded-full transition-[width] duration-500 ease-spring"
            style={{
              width: `${((stepIndex + 1) / ONBOARDING_STEPS.length) * 100}%`,
            }}
          />
        </div>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {t("progress", {
            current: stepIndex + 1,
            total: ONBOARDING_STEPS.length,
          })}
        </p>
      </div>

      <div className="flex-1">
        {current === "goal" ? (
          <GoalStep
            value={draft.goal}
            onSelect={(goal) => setAnswer("goal", goal)}
          />
        ) : null}
        {current === "experience" ? (
          <ExperienceStep
            value={draft.experience}
            onSelect={(experience) => setAnswer("experience", experience)}
          />
        ) : null}
        {current === "equipment" ? (
          <EquipmentStep
            location={draft.location}
            equipment={draft.equipment}
            onLocationChange={(location) => setAnswer("location", location)}
            onEquipmentChange={(equipment) => setAnswer("equipment", equipment)}
          />
        ) : null}
        {current === "schedule" ? (
          <ScheduleStep
            value={draft.daysPerWeek}
            onSelect={(daysPerWeek) => setAnswer("daysPerWeek", daysPerWeek)}
          />
        ) : null}
        {current === "preferences" ? (
          <PreferencesStep
            unitSystem={draft.unitSystem}
            timezone={draft.timezone}
            onUnitSystemChange={(unitSystem) =>
              setAnswer("unitSystem", unitSystem)
            }
            onTimezoneChange={(timezone) => setAnswer("timezone", timezone)}
          />
        ) : null}
        {current === "metrics" ? <MetricsStep /> : null}
        {current === "template" ? (
          <TemplatePickStep onPicked={handlePicked} />
        ) : null}
      </div>

      <div className="sticky bottom-0 flex gap-3 bg-gradient-to-t from-background via-background to-transparent pt-3">
        {canGoBack ? (
          <Button
            type="button"
            variant="ghost"
            className="h-13 flex-1"
            disabled={save.isPending}
            onClick={goBack}
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            {t("back")}
          </Button>
        ) : null}
        {stepOwnsActions ? null : (
          <Button
            type="button"
            className="h-13 flex-1"
            disabled={!canContinue || save.isPending}
            onClick={handleNext}
          >
            {t("next")}
            <ArrowRight className="size-5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function SkipOnboardingButton() {
  const t = useTranslations("onboarding")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const locale = useLocale()
  const save = useSaveOnboardingStep()

  async function handleSkip() {
    try {
      await save.mutateAsync({ onboardingSkippedAt: new Date().toISOString() })
      router.push(`/${locale}/dashboard`)
    } catch {
      toast.error(tCommon("error"))
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-12 w-full"
      disabled={save.isPending}
      onClick={handleSkip}
    >
      {t("skip")}
    </Button>
  )
}
