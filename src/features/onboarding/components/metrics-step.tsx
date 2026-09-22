"use client"

import {
  GenderFemale,
  GenderMale,
  GenderNeuter,
  User,
} from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSaveOnboardingStep } from "@/features/onboarding/hooks/use-save-onboarding-step"
import { useOnboardingStore } from "@/features/onboarding/stores/onboarding-store"

const GENDERS = [
  { id: "male", icon: GenderMale },
  { id: "female", icon: GenderFemale },
  { id: "other", icon: GenderNeuter },
  { id: "prefer_not_to_say", icon: User },
] as const

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function toInt(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function toFloat(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function MetricsStep() {
  const t = useTranslations("onboarding.metrics")
  const tOnboarding = useTranslations("onboarding")
  const tCommon = useTranslations("common")
  const save = useSaveOnboardingStep()
  const { answers, setAnswer, goNext } = useOnboardingStore()

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {}
    const birthYear = toInt(asString(answers.birthYear))
    if (birthYear !== null) patch.birthYear = birthYear
    const heightCm = toInt(asString(answers.heightCm))
    if (heightCm !== null) patch.heightCm = heightCm
    const weightKg = toFloat(asString(answers.weightKg))
    if (weightKg !== null) patch.weightKg = weightKg
    const gender = asString(answers.gender)
    if (gender !== "") patch.gender = gender
    return patch
  }

  async function handleSave() {
    try {
      const patch = buildPatch()
      if (Object.keys(patch).length > 0) await save.mutateAsync(patch)
      goNext()
    } catch {
      toast.error(tCommon("error"))
    }
  }

  function handleSkip() {
    goNext()
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg">{t("label")}</h2>
        <p className="text-muted-foreground text-sm">{t("optional")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="onboarding-birth-year">{t("birthYear")}</Label>
        <Input
          id="onboarding-birth-year"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear()}
          value={asString(answers.birthYear)}
          onChange={(event) => setAnswer("birthYear", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="onboarding-height">{t("height")}</Label>
        <Input
          id="onboarding-height"
          type="number"
          inputMode="numeric"
          min={50}
          max={300}
          value={asString(answers.heightCm)}
          onChange={(event) => setAnswer("heightCm", event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="onboarding-weight">{t("weight")}</Label>
        <Input
          id="onboarding-weight"
          type="number"
          inputMode="decimal"
          min={1}
          max={500}
          value={asString(answers.weightKg)}
          onChange={(event) => setAnswer("weightKg", event.target.value)}
        />
      </div>

      <div
        role="group"
        aria-label={t("gender")}
        className="flex flex-col gap-2"
      >
        <p className="text-muted-foreground text-sm">{t("gender")}</p>
        <div className="grid grid-cols-2 gap-3">
          {GENDERS.map(({ id, icon: GenderIcon }) => (
            <Button
              key={id}
              type="button"
              variant={
                asString(answers.gender) === id ? "default" : "secondary"
              }
              aria-pressed={asString(answers.gender) === id}
              className="h-12 justify-start gap-2"
              onClick={() => setAnswer("gender", id)}
            >
              <GenderIcon className="size-5" aria-hidden="true" />
              {t(id)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          className="h-12 flex-1"
          disabled={save.isPending}
          onClick={handleSkip}
        >
          {tOnboarding("skip")}
        </Button>
        <Button
          type="button"
          className="h-12 flex-1"
          disabled={save.isPending}
          onClick={handleSave}
        >
          {tCommon("save")}
        </Button>
      </div>
    </section>
  )
}
