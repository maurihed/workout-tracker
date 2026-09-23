"use client"

import { useLocale } from "next-intl"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"

import { ExercisePicker } from "@/features/routines/components/exercise-picker"
import { useHydrateDraft } from "@/features/routines/hooks/use-hydrate-draft"

function PickerPageContent() {
  const locale = useLocale()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const hydrated = useHydrateDraft()

  const routineId =
    typeof params?.routineId === "string" ? params.routineId : ""
  const dayId = searchParams.get("day")

  useEffect(() => {
    if (!dayId) router.replace(`/${locale}/routines/${routineId}`)
  }, [dayId, locale, routineId, router])

  // Wait for the persisted draft before mounting the picker so it can never
  // append to an empty store after a hard reload or direct open.
  if (!dayId || !hydrated) return null

  return <ExercisePicker routineId={routineId} dayId={dayId} />
}

export default function ExercisePickerPage() {
  return (
    <Suspense fallback={null}>
      <PickerPageContent />
    </Suspense>
  )
}
