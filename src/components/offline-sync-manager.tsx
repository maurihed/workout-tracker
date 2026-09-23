"use client"

import { useEffect } from "react"

import { flushOutbox } from "@/lib/offline/sync"

export function OfflineSyncManager() {
  useEffect(() => {
    const flush = () => void flushOutbox()
    const onVisibility = () => {
      if (document.visibilityState === "visible") flush()
    }
    flush()
    window.addEventListener("online", flush)
    window.addEventListener("focus", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("online", flush)
      window.removeEventListener("focus", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])
  return null
}
