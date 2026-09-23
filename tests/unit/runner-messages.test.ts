import { describe, expect, it } from "vitest"

import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

type Dict = Record<string, unknown>

const dicts: [string, Dict][] = [
  ["en", en as Dict],
  ["es", es as Dict],
]

function at(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Dict)[key]
    return undefined
  }, dict)
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

// Every `runner.*`/`runner.sets.*`/`timers.*`/`summary.*` key referenced by the
// runner and summary components, verified against the source by grep.
const RUNNER_KEYS = [
  "runner.title",
  "runner.resume",
  "runner.startChooseDay",
  "runner.noActiveRoutine",
  "runner.emptyCta",
  "runner.overview.title",
  "runner.overview.description",
  "runner.overview.setCount",
  "runner.overview.skipped",
  "runner.overview.completed",
  "runner.prev",
  "runner.next",
  "runner.swap.title",
  "runner.skip",
  "runner.unskip",
  "runner.finish",
  "runner.discard",
  "runner.finishConfirm",
  "runner.discardConfirm",
  "runner.pause",
  "runner.resumeSession",
  "runner.progress",
  "runner.lastPerformance",
  "runner.exerciseOf",
  "runner.addSet",
  "runner.target",
  "runner.targetWithRest",
  "runner.unknownDay",
  "runner.error",
  "runner.retry",
  "runner.conflict",
  "runner.save.saving",
  "runner.save.saved",
  "runner.save.offline",
  "runner.save.pending",
  "runner.save.error",
  "runner.save.retry",
  "runner.save.finishError",
  "runner.sets.reps",
  "runner.sets.weight",
  "runner.sets.warmup",
  "runner.sets.working",
  "runner.sets.rpe",
  "runner.sets.notes",
  "runner.sets.complete",
  "runner.sets.completed",
  "runner.sets.setNumber",
  "runner.sets.number",
  "runner.sets.addSet",
  "timers.rest",
  "timers.interval",
  "timers.round",
  "timers.work",
  "timers.running",
  "timers.paused",
  "timers.adjust",
  "timers.skip",
  "timers.skipRound",
  "timers.start",
  "timers.pause",
  "timers.addTime",
  "timers.subtractTime",
  "timers.soundOn",
  "timers.soundOff",
  "timers.notifyOn",
  "timers.notifyOff",
  "timers.notifyBlocked",
  "summary.title",
  "summary.duration",
  "summary.sets",
  "summary.volume",
  "summary.done",
] as const

describe("runner copy", () => {
  it("has the runner namespaces in both locales", () => {
    for (const m of [en, es]) {
      expect(m.runner).toBeTruthy()
      expect(m.runner.sets).toBeTruthy()
      expect(m.timers).toBeTruthy()
      expect(m.summary).toBeTruthy()
      expect(m.runner.finish.length).toBeGreaterThan(0)
      expect(m.summary.volume.length).toBeGreaterThan(0)
    }
  })

  it("defines every runner, timer, and summary key in both locales", () => {
    for (const [locale, m] of dicts) {
      for (const key of RUNNER_KEYS) {
        expect(nonEmpty(at(m, key)), `${locale}:${key}`).toBe(true)
      }
    }
  })
})
