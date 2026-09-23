"use client"

import { Sparkle, WarningCircle } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCreateFromTemplate } from "@/features/routines/hooks/use-create-from-template"
import { useRoutineTemplates } from "@/features/routines/hooks/use-routine-templates"
import type { RoutineDTO } from "@/features/routines/hooks/use-active-routine"
import { cn } from "@/lib/utils"

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
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        {t("pick")}
      </h2>
      <div className="flex flex-col gap-3">
        {list.map((tpl, index) => {
          const name = locale === "es" ? (tpl.nameEs || tpl.name) : tpl.name
          const description =
            locale === "es"
              ? tpl.descriptionEs || tpl.description
              : tpl.description
          return (
            <Button
              key={tpl.slug}
              type="button"
              variant="outline"
              className={cn(
                "animate-rise h-auto min-h-20 flex-col items-start gap-1.5 rounded-2xl p-4 text-left whitespace-normal",
                tpl.recommended &&
                  "border-primary bg-primary/10 ring-2 ring-primary/30 hover:bg-primary/15",
              )}
              style={{ animationDelay: `${index * 50}ms` }}
              disabled={create.isPending}
              onClick={() => handlePick(tpl.slug)}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-heading text-lg font-bold">{name}</span>
                {tpl.recommended ? (
                  <Badge>
                    <Sparkle className="size-3" weight="fill" aria-hidden="true" />
                    {t("recommended")}
                  </Badge>
                ) : null}
              </span>
              {description ? (
                <span className="text-muted-foreground text-sm font-normal">
                  {description}
                </span>
              ) : null}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
