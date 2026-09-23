"use client"

import { useLocale } from "next-intl"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

import { ExercisePicker } from "@/features/routines/components/exercise-picker"

function PickerPageContent() {
  const locale = useLocale()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()

  const routineId =
    typeof params?.routineId === "string" ? params.routineId : ""
  const dayId = searchParams.get("day")

  useEffect(() => {
    if (!dayId) router.replace(`/${locale}/routines/${routineId}`)
  }, [dayId, locale, routineId, router])

  if (!dayId) return null

  return <ExercisePicker routineId={routineId} dayId={dayId} />
}

export default function ExercisePickerPage() {
  return (
    <Suspense fallback={null}>
      <PickerPageContent />
    </Suspense>
  )
}
