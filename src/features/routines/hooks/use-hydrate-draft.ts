"use client"

import { useEffect, useState } from "react"

import { useRoutineDraftStore } from "@/features/routines/stores/routine-draft-store"

/**
 * Rehydrates the persisted routine draft from session storage exactly once and
 * reports when it is ready. Both the editor and the picker must wait for this
 * before reading or mutating the store (the store uses `skipHydration`), so the
 * picker never appends to an empty draft on a hard reload.
 */
export function useHydrateDraft(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let active = true
    Promise.resolve(useRoutineDraftStore.persist.rehydrate()).finally(() => {
      if (active) setHydrated(true)
    })
    return () => {
      active = false
    }
  }, [])

  return hydrated
}
