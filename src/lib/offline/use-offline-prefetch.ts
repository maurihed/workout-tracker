"use client"

import { useEffect } from "react"

const PREFETCH_DELAY_MS = 3000

export function useOfflinePrefetch(urls: readonly string[]): void {
  const key = urls.join("|")
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return
    const list = key ? key.split("|") : []
    if (list.length === 0) return
    const id = window.setTimeout(() => {
      for (const url of list) {
        void fetch(url, { cache: "force-cache" }).catch(() => undefined)
      }
    }, PREFETCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [key])
}
