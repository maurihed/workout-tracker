"use client"

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "gym.runner.sound"

const listeners = new Set<() => void>()

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off"
  } catch {
    // Storage can be unavailable (private mode); keep the default.
    return true
  }
}

function getServerSnapshot(): boolean {
  return true
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setSoundPreference(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off")
  } catch {
    // Ignore storage failures; notify so the in-memory toggle still applies.
  }
  for (const listener of listeners) listener()
}

/**
 * Persisted client-only toggle for the timer alert (beep + vibration). Reads
 * through `useSyncExternalStore` so the server render defaults to on without a
 * hydration mismatch and no state-setting effect.
 */
export function useSoundPreference(): [boolean, (next: boolean) => void] {
  const soundOn = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return [soundOn, setSoundPreference]
}
