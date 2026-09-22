"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { useCreateFromTemplate } from "@/features/routines/hooks/use-create-from-template"
import { useRoutineTemplates } from "@/features/routines/hooks/use-routine-templates"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"

export function TemplatePickStep({
  onPicked,
}: {
  onPicked: (routine: RoutineDTO) => void
}) {
  const t = useTranslations("onboarding.templates")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { data: templates, isLoading, isError, refetch } = useRoutineTemplates()
  const create = useCreateFromTemplate()

  async function handlePick(slug: string) {
    try {
      const routine = await create.mutateAsync(slug)
      onPicked(routine)
    } catch {
      toast.error(tCommon("error"))
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground">{t("loading")}</p>
  }

  if (isError) {
    return (
      <EmptyState
        icon={WarningCircle}
        title={t("error")}
        description={t("errorDescription")}
        action={
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => refetch()}
          >
            {tCommon("retry")}
          </Button>
        }
      />
    )
  }

  const list = templates ?? []

  if (list.length === 0) {
    return <EmptyState icon={WarningCircle} title={t("empty")} />
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-heading text-lg">{t("pick")}</h2>
      <div className="flex flex-col gap-3">
        {list.map((tpl) => {
          const name = locale === "es" ? (tpl.nameEs || tpl.name) : tpl.name
          const description =
            locale === "es"
              ? tpl.descriptionEs || tpl.description
              : tpl.description
          return (
            <Button
              key={tpl.slug}
              type="button"
              variant={tpl.recommended ? "default" : "secondary"}
              className="h-auto min-h-12 flex-col items-start gap-1 p-4 text-left"
              disabled={create.isPending}
              onClick={() => handlePick(tpl.slug)}
            >
              <span className="font-heading text-base">{name}</span>
              {description ? (
                <span className="text-xs font-normal">{description}</span>
              ) : null}
              {tpl.recommended ? (
                <span className="text-xs">{t("recommended")}</span>
              ) : null}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
