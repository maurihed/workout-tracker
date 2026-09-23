"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { listOutbox } from "./db"
import { flushOutbox, onOutboxChange } from "./sync"

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener)
  window.addEventListener("offline", listener)
  return () => {
    window.removeEventListener("online", listener)
    window.removeEventListener("offline", listener)
  }
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine
}

function getOnlineServerSnapshot(): boolean {
  return true
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot)
}

export type SyncStatus = {
  online: boolean
  pending: number
  syncing: boolean
  flush: () => void
}

const pendingListeners = new Set<() => void>()
let pendingCount = 0

async function refreshPending(): Promise<void> {
  pendingCount = (await listOutbox()).length
  for (const listener of pendingListeners) listener()
}

function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener)
  void refreshPending()
  const off = onOutboxChange(() => void refreshPending())
  return () => {
    pendingListeners.delete(listener)
    off()
  }
}

function getPendingSnapshot(): number {
  return pendingCount
}

function getPendingServerSnapshot(): number {
  return 0
}

export function useSyncStatus(): SyncStatus {
  const online = useOnlineStatus()
  const pending = useSyncExternalStore(subscribePending, getPendingSnapshot, getPendingServerSnapshot)
  const [syncing, setSyncing] = useState(false)

  const flush = useCallback(() => {
    setSyncing(true)
    void flushOutbox().finally(() => {
      setSyncing(false)
      void refreshPending()
    })
  }, [])

  useEffect(() => {
    const onOnline = () => flush()
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("online", onOnline)
    }
  }, [flush])

  return { online, pending, syncing, flush }
}
