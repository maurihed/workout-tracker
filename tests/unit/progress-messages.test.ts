import { describe, expect, it } from "vitest"

import { MUSCLE_REGIONS } from "@/features/progress/lib/muscles"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

function nonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function namespaceOf(
  messages: unknown,
  namespace: string,
): Record<string, unknown> {
  const root = messages as Record<string, Record<string, unknown> | undefined>
  return root[namespace] ?? {}
}

const REQUIRED: Record<string, string[]> = {
  analytics: [
    "title",
    "volume",
    "sessions",
    "consistency",
    "weeks",
    "empty",
    "weekOf",
  ],
  heatmap: ["title", "legendLow", "legendHigh", "custom", "empty"],
  pr: ["recentPrs", "empty", "e1rm", "topSet", "viewProgress"],
  metrics: [
    "title",
    "addEntry",
    "date",
    "weight",
    "bodyFat",
    "save",
    "delete",
    "cancel",
    "empty",
    "trend",
    "invalid",
  ],
}

describe("progress dashboard copy", () => {
  it("has the progress namespaces in both locales", () => {
    for (const m of [en, es]) {
      expect(m.analytics).toBeTruthy()
      expect(m.heatmap).toBeTruthy()
      expect(m.pr).toBeTruthy()
      expect(m.metrics).toBeTruthy()
    }
  })

  it("localizes every required key in both locales", () => {
    for (const m of [en, es]) {
      for (const [namespace, keys] of Object.entries(REQUIRED)) {
        const messages = namespaceOf(m, namespace)
        for (const key of keys) {
          expect(nonEmpty(messages[key] as string)).toBe(true)
        }
      }
    }
  })

  it("localizes every muscle region in both locales", () => {
    for (const m of [en, es]) {
      const regions = m.heatmap.regions as Record<string, string | undefined>
      for (const region of MUSCLE_REGIONS) {
        expect(nonEmpty(regions[region.id])).toBe(true)
      }
    }
  })

  it("keeps the progress namespaces at key parity", () => {
    for (const namespace of Object.keys(REQUIRED)) {
      expect(Object.keys(namespaceOf(es, namespace)).sort()).toEqual(
        Object.keys(namespaceOf(en, namespace)).sort(),
      )
    }
  })
})
