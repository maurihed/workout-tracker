"use client"

import { useTranslations } from "next-intl"

import { NewRoutineForm } from "@/features/routines/components/new-routine-form"

export default function NewRoutinePage() {
  const t = useTranslations("routines")

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">{t("new")}</h1>
      <NewRoutineForm />
    </div>
  )
}
