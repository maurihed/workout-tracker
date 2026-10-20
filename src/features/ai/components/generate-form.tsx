"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Barbell, Check, House, Sparkle } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useForm, useWatch } from "react-hook-form"
import type { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  EXPERIENCES,
  GOALS,
  GYM_PROFILES,
  TRAINING_LOCATIONS,
  aiJobInputSchema,
  type AiJobInput,
} from "@/features/ai/lib/contract"
import { EQUIPMENT } from "@/features/exercises/schemas/exercise"
import { cn } from "@/lib/utils"

type FormInput = z.input<typeof aiJobInputSchema>
type FormOutput = z.output<typeof aiJobInputSchema>

const DAYS_PER_WEEK = [1, 2, 3, 4, 5, 6, 7] as const

const LOCATION_ICONS = {
  home: House,
  gym: Barbell,
} as const

const selectClass =
  "border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-2xl border px-3 py-1 text-base outline-none focus-visible:ring-3 md:text-sm"

export function GenerateForm({
  onSubmit,
  isPending = false,
}: {
  onSubmit: (input: AiJobInput) => void
  isPending?: boolean
}) {
  const t = useTranslations("ai.form")
  const tGoals = useTranslations("onboarding.goals")
  const tExperience = useTranslations("onboarding.experience")
  const tEquipment = useTranslations("onboarding.equipment.items")
  const tLocations = useTranslations("ai.form.locations")
  const tGymProfiles = useTranslations("ai.form.gymProfiles")

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(aiJobInputSchema),
    defaultValues: {
      location: "gym",
      gymProfile: "intermediate",
      equipment: [],
      daysPerWeek: 3,
      focus: null,
      personalize: true,
    },
  })

  const location =
    useWatch({ control: form.control, name: "location" }) ?? "gym"
  const gymProfile =
    useWatch({ control: form.control, name: "gymProfile" }) ?? "intermediate"
  const equipment = useWatch({ control: form.control, name: "equipment" }) ?? []

  function chooseLocation(next: (typeof TRAINING_LOCATIONS)[number]) {
    form.setValue("location", next, { shouldValidate: true, shouldDirty: true })
  }

  function chooseGymProfile(next: (typeof GYM_PROFILES)[number]) {
    form.setValue("gymProfile", next, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  function toggleEquipment(item: (typeof EQUIPMENT)[number]) {
    const next = equipment.includes(item)
      ? equipment.filter((value) => value !== item)
      : [...equipment, item]
    form.setValue("equipment", next, {
      shouldValidate: true,
      shouldDirty: true,
    })
  }

  const submit = form.handleSubmit((values) => onSubmit(values))

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-goal">{t("goal")}</Label>
        <select
          id="ai-goal"
          className={selectClass}
          aria-invalid={form.formState.errors.goal ? true : undefined}
          {...form.register("goal")}
        >
          <option value="" />
          {GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {tGoals(goal)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-experience">{t("experience")}</Label>
        <select
          id="ai-experience"
          className={selectClass}
          aria-invalid={form.formState.errors.experience ? true : undefined}
          {...form.register("experience")}
        >
          <option value="" />
          {EXPERIENCES.map((experience) => (
            <option key={experience} value={experience}>
              {tExperience(experience)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("location")}</Label>
        <div
          role="group"
          aria-label={t("location")}
          className="grid grid-cols-2 gap-2"
        >
          {TRAINING_LOCATIONS.map((value) => {
            const selected = location === value
            const Icon = LOCATION_ICONS[value]
            return (
              <Button
                key={value}
                type="button"
                variant="outline"
                aria-pressed={selected}
                className={cn(
                  "h-14 justify-start gap-2 rounded-2xl px-3",
                  selected &&
                    "border-primary bg-primary/15 ring-primary/40 hover:bg-primary/20 ring-2",
                )}
                onClick={() => chooseLocation(value)}
              >
                <Icon
                  className="size-5 shrink-0"
                  weight={selected ? "fill" : "regular"}
                  aria-hidden="true"
                />
                <span className="text-left text-sm font-medium">
                  {tLocations(value)}
                </span>
              </Button>
            )
          })}
        </div>
      </div>

      {location === "home" ? (
        <div className="flex flex-col gap-2">
          <Label>{t("equipment")}</Label>
          <p className="text-muted-foreground text-sm">{t("equipmentHint")}</p>
          <div
            role="group"
            aria-label={t("equipment")}
            className="grid grid-cols-2 gap-2"
          >
            {EQUIPMENT.map((item) => {
              const selected = equipment.includes(item)
              return (
                <Button
                  key={item}
                  type="button"
                  variant="outline"
                  aria-pressed={selected}
                  className={cn(
                    "h-14 justify-start gap-2 rounded-2xl px-3",
                    selected &&
                      "border-primary bg-primary/15 ring-primary/40 hover:bg-primary/20 ring-2",
                  )}
                  onClick={() => toggleEquipment(item)}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {selected ? (
                      <Check
                        className="size-3.5"
                        weight="bold"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="text-left text-sm font-medium">
                    {tEquipment(item)}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label>{t("gymProfile")}</Label>
          <div
            role="group"
            aria-label={t("gymProfile")}
            className="flex flex-col gap-2"
          >
            {GYM_PROFILES.map((value) => {
              const selected = gymProfile === value
              return (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  aria-pressed={selected}
                  className={cn(
                    "h-auto min-h-16 justify-start gap-3 rounded-2xl px-3 py-3",
                    selected &&
                      "border-primary bg-primary/15 ring-primary/40 hover:bg-primary/20 ring-2",
                  )}
                  onClick={() => chooseGymProfile(value)}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                  >
                    {selected ? (
                      <Check
                        className="size-3.5"
                        weight="bold"
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-col text-left">
                    <span className="text-sm font-semibold">
                      {tGymProfiles(value)}
                    </span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {tGymProfiles(`${value}Hint`)}
                    </span>
                  </span>
                </Button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-days">{t("daysPerWeek")}</Label>
        <select
          id="ai-days"
          className={selectClass}
          aria-invalid={form.formState.errors.daysPerWeek ? true : undefined}
          {...form.register("daysPerWeek", { valueAsNumber: true })}
        >
          {DAYS_PER_WEEK.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-focus">{t("focus")}</Label>
        <Input
          id="ai-focus"
          autoComplete="off"
          aria-invalid={form.formState.errors.focus ? true : undefined}
          {...form.register("focus", {
            setValueAs: (value: string | null) => {
              if (value == null) return null
              return value.trim() === "" ? null : value
            },
          })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="ai-personalize"
          className="flex min-h-11 cursor-pointer items-center gap-3"
        >
          <input
            id="ai-personalize"
            type="checkbox"
            className="size-5"
            aria-describedby="ai-personalize-hint"
            {...form.register("personalize")}
          />
          <span className="font-medium">{t("personalize")}</span>
        </label>
        <p id="ai-personalize-hint" className="text-muted-foreground text-sm">
          {t("personalizeHint")}
        </p>
      </div>

      <Button type="submit" className="h-13" disabled={isPending}>
        <Sparkle className="size-5" weight="fill" aria-hidden="true" />
        {t("submit")}
      </Button>
    </form>
  )
}
