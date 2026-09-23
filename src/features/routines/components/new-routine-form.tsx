"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCreateFromTemplate } from "@/features/routines/hooks/use-create-from-template"
import { useCreateRoutine } from "@/features/routines/hooks/use-create-routine"
import {
  useRoutineTemplates,
  type TemplateWithScore,
} from "@/features/routines/hooks/use-routine-templates"
import { createRoutineSchema } from "@/features/routines/schemas/routine"

const GOALS = [
  "lose_weight",
  "build_muscle",
  "get_stronger",
  "endurance",
  "general_fitness",
] as const

type FormInput = z.input<typeof createRoutineSchema>
type FormOutput = z.output<typeof createRoutineSchema>

type TemplateListProps = {
  templates: TemplateWithScore[]
  isLoading: boolean
  isError: boolean
  isChoosing: boolean
  onRetry: () => void
  onChoose: (slug: string) => void
}

function TemplateList({
  templates,
  isLoading,
  isError,
  isChoosing,
  onRetry,
  onChoose,
}: TemplateListProps) {
  const t = useTranslations("routines.create")
  const tTemplates = useTranslations("onboarding.templates")
  const tCommon = useTranslations("common")
  const locale = useLocale()

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{tTemplates("loading")}</p>
  }

  if (isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={tTemplates("error")}
        description={tTemplates("errorDescription")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={onRetry}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  if (templates.length === 0) {
    return <EmptyState icon={WarningCircle} title={tTemplates("empty")} />
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-bold tracking-tight">
        {t("fromTemplate")}
      </h2>
      <div className="flex flex-col gap-3">
        {templates.map((template, index) => {
          const name =
            locale === "es"
              ? template.nameEs || template.name
              : template.name
          const description =
            locale === "es"
              ? template.descriptionEs || template.description
              : template.description
          return (
            <Button
              key={template.slug}
              type="button"
              variant="outline"
              className="animate-rise h-auto min-h-20 flex-col items-start gap-1.5 rounded-2xl p-4 text-left whitespace-normal"
              style={{ animationDelay: `${index * 50}ms` }}
              disabled={isChoosing}
              onClick={() => onChoose(template.slug)}
            >
              <span className="font-heading text-lg font-bold">{name}</span>
              {description ? (
                <span className="text-muted-foreground text-sm font-normal">
                  {description}
                </span>
              ) : null}
              <span className="text-primary text-xs font-semibold">
                {t("chooseTemplate")}
              </span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}

export function NewRoutineForm() {
  const t = useTranslations("routines.create")
  const tGoals = useTranslations("onboarding.goals")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()

  const createRoutine = useCreateRoutine()
  const createFromTemplate = useCreateFromTemplate()
  const { data: templates, isLoading, isError, refetch } = useRoutineTemplates()

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createRoutineSchema),
    defaultValues: { name: "", description: null, goal: null },
  })

  const isPending = createRoutine.isPending || createFromTemplate.isPending

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const routine = await createRoutine.mutateAsync(values)
      router.push(`/${locale}/routines/${routine.id}`)
    } catch {
      toast.error(tCommon("error"))
    }
  })

  async function handleChooseTemplate(slug: string) {
    try {
      const routine = await createFromTemplate.mutateAsync(slug)
      router.push(`/${locale}/routines/${routine.id}`)
    } catch {
      toast.error(tCommon("error"))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-5" noValidate onSubmit={onSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="routine-name">{t("name")}</Label>
          <Input
            id="routine-name"
            autoComplete="off"
            aria-invalid={form.formState.errors.name ? true : undefined}
            {...form.register("name")}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="routine-description">{t("description")}</Label>
          <Input
            id="routine-description"
            aria-invalid={form.formState.errors.description ? true : undefined}
            {...form.register("description", {
              setValueAs: (value: string | null) => {
                if (value == null || value.trim() === "") return null
                return value
              },
            })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="routine-goal">{t("goal")}</Label>
          <select
            id="routine-goal"
            className="border-input bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-2xl border px-3 py-1 text-base outline-none focus-visible:ring-3 md:text-sm"
            aria-invalid={form.formState.errors.goal ? true : undefined}
            {...form.register("goal", {
              setValueAs: (value: string) => (value === "" ? null : value),
            })}
          >
            <option value="" />
            {GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {tGoals(goal)}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" className="h-13" disabled={isPending}>
          <Plus className="size-5" weight="bold" aria-hidden="true" />
          {t("createBlank")}
        </Button>
      </form>

      <TemplateList
        templates={templates ?? []}
        isLoading={isLoading}
        isError={isError}
        isChoosing={isPending}
        onRetry={() => refetch()}
        onChoose={handleChooseTemplate}
      />
    </div>
  )
}
