"use client"

import { ArrowsClockwise, Check, Sparkle, Trash } from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import Image from "next/image"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Disclaimer } from "@/features/ai/components/disclaimer"
import type { AiJobResult } from "@/features/ai/lib/contract"
import { weekdayLabel } from "@/features/routines/lib/weekdays"
import { exerciseImageUrl } from "@/lib/exercise-images"

type RoutinePreviewCardProps = {
  result: AiJobResult
  model?: string | null
  promptVersion?: string | null
  onAccept: () => void
  onRegenerate: () => void
  onDiscard: () => void
  isAccepting?: boolean
  isRegenerating?: boolean
}

export function RoutinePreviewCard({
  result,
  model,
  promptVersion,
  onAccept,
  onRegenerate,
  onDiscard,
  isAccepting = false,
  isRegenerating = false,
}: RoutinePreviewCardProps) {
  const t = useTranslations("ai")
  const tRunner = useTranslations("runner")
  const locale = useLocale()

  return (
    <section
      aria-label={t("title")}
      className="animate-rise flex flex-col gap-4"
    >
      <Card className="bg-card/90 backdrop-blur">
        <CardHeader className="gap-2">
          <CardTitle className="font-heading text-2xl leading-tight font-bold tracking-tight">
            {result.routine.name}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {result.source === "template" ? (
              <span className="bg-warning text-warning-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                <Sparkle
                  className="size-3.5"
                  weight="fill"
                  aria-hidden="true"
                />
                {t("preview.template")}
              </span>
            ) : null}
            {model ? (
              <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                {t("preview.provenance", { model })}
                {promptVersion ? (
                  <span className="tabular-nums">{promptVersion}</span>
                ) : null}
              </span>
            ) : null}
          </div>
          {result.personalized ? (
            <p className="text-primary text-sm font-medium">
              {t("preview.personalized")}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {result.routine.days.map((day, dayIndex) => (
              <li key={`${day.weekday}-${dayIndex}`}>
                <div className="flex items-center gap-3">
                  <span className="bg-foreground text-background font-heading flex size-9 shrink-0 items-center justify-center rounded-2xl text-sm font-bold tabular-nums">
                    {dayIndex + 1}
                  </span>
                  <h3 className="font-heading text-lg font-semibold">
                    {day.label ?? weekdayLabel(locale, day.weekday)}
                  </h3>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {day.exercises.map((exercise, exerciseIndex) => {
                    const name =
                      exercise.customName ??
                      exercise.name ??
                      exercise.sourceId ??
                      ""
                    return (
                      <li
                        key={`${exercise.sourceId ?? name}-${exerciseIndex}`}
                        className="bg-muted/40 flex items-start gap-3 rounded-2xl p-3"
                      >
                        {exercise.exerciseId === null ? (
                          <Image
                            src={exerciseImageUrl(undefined)}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="bg-muted size-12 shrink-0 rounded-xl object-cover"
                          />
                        ) : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-medium">{name}</span>
                            <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                              {tRunner("targetWithRest", {
                                sets: exercise.sets,
                                reps: exercise.reps,
                                rest: exercise.restSeconds,
                              })}
                            </span>
                          </div>
                          {exercise.exerciseId === null ? (
                            <>
                              <span className="text-muted-foreground text-xs">
                                {t("preview.customNote")}
                              </span>
                              {(exercise.instructions?.length ?? 0) > 0 ? (
                                <details>
                                  <summary className="text-primary flex min-h-11 cursor-pointer items-center text-xs font-semibold">
                                    {t("preview.howTo")}
                                  </summary>
                                  <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5 text-xs">
                                    {exercise.instructions?.map(
                                      (step, stepIndex) => (
                                        <li key={`${stepIndex}-${step}`}>
                                          {step}
                                        </li>
                                      ),
                                    )}
                                  </ol>
                                </details>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isAccepting}
          onClick={onAccept}
        >
          <Check className="size-5" weight="bold" aria-hidden="true" />
          {t("preview.accept")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12"
            disabled={isRegenerating}
            onClick={onRegenerate}
          >
            <ArrowsClockwise className="size-4" aria-hidden="true" />
            {t("preview.regenerate")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-12"
            onClick={onDiscard}
          >
            <Trash className="size-4" aria-hidden="true" />
            {t("preview.discard")}
          </Button>
        </div>
      </div>

      <Disclaimer />
    </section>
  )
}
