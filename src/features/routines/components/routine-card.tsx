"use client"

import { Copy, Play, Trash } from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useParams } from "next/navigation"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { RoutineSummary } from "@/features/routines/hooks/use-routines"

type RoutineCardProps = {
  routine: RoutineSummary
  onActivate: (id: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

function useLocaleParam(): string {
  const params = useParams()
  const locale = params?.locale
  return typeof locale === "string" ? locale : "en"
}

export function RoutineCard({
  routine,
  onActivate,
  onDuplicate,
  onDelete,
}: RoutineCardProps) {
  const t = useTranslations("routines")
  const tCommon = useTranslations("common")
  const locale = useLocaleParam()

  return (
    <Card>
      <Link
        href={`/${locale}/routines/${routine.id}`}
        className="focus-visible:ring-ring/50 flex flex-col gap-(--card-spacing) rounded-t-xl focus-visible:ring-3 focus-visible:outline-none"
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="truncate">{routine.name}</CardTitle>
            {routine.isActive ? <Badge>{t("active")}</Badge> : null}
          </div>
          {routine.description ? (
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {routine.description}
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <span>
              {routine.dayCount} {t("dayCount")}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {routine.exerciseCount} {t("exerciseCount")}
            </span>
          </p>
        </CardContent>
      </Link>

      <CardFooter className="gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-11 flex-1"
          disabled={routine.isActive}
          onClick={() => onActivate(routine.id)}
        >
          <Play className="size-4" aria-hidden="true" />
          {t("activate")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("duplicate")}
          onClick={() => onDuplicate(routine.id)}
        >
          <Copy className="size-4" aria-hidden="true" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t("delete")}
            >
              <Trash className="size-4" aria-hidden="true" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfirm")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">
                {tCommon("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                className="h-11"
                onClick={() => onDelete(routine.id)}
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  )
}
