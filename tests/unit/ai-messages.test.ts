import { describe, expect, it } from "vitest"

import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  return Object.entries(obj).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const path = `${prefix}${key}`
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(acc, flatten(value as Record<string, unknown>, `${path}.`))
    } else {
      acc[path] = value
    }
    return acc
  }, {})
}

const REQUIRED = [
  "ai.title",
  "ai.form.goal",
  "ai.form.experience",
  "ai.form.location",
  "ai.form.locations.home",
  "ai.form.locations.gym",
  "ai.form.equipment",
  "ai.form.equipmentHint",
  "ai.form.gymProfile",
  "ai.form.gymProfiles.basic",
  "ai.form.gymProfiles.basicHint",
  "ai.form.gymProfiles.intermediate",
  "ai.form.gymProfiles.intermediateHint",
  "ai.form.gymProfiles.fully_equipped",
  "ai.form.gymProfiles.fully_equippedHint",
  "ai.form.daysPerWeek",
  "ai.form.focus",
  "ai.form.submit",
  "ai.form.personalize",
  "ai.form.personalizeHint",
  "ai.status.queued",
  "ai.status.running",
  "ai.status.succeeded",
  "ai.status.failed",
  "ai.status.cancelled",
  "ai.preview.accept",
  "ai.preview.regenerate",
  "ai.preview.discard",
  "ai.preview.customNote",
  "ai.preview.howTo",
  "ai.preview.provenance",
  "ai.preview.template",
  "ai.preview.personalized",
  "ai.disclaimer",
  "ai.disclaimerData",
  "ai.errors.generic",
  "ai.errors.rateLimited",
  "ai.errors.notFound",
  "ai.errors.unavailable",
]

const locales = { en, es }

describe("ai routine generation copy", () => {
  it("has the ai namespace in both locales", () => {
    for (const m of Object.values(locales)) {
      expect(m.ai).toBeTruthy()
    }
  })

  it("localizes every required key in both locales", () => {
    for (const m of Object.values(locales)) {
      const messages = flatten(m.ai as Record<string, unknown>, "ai.")
      for (const key of REQUIRED) {
        expect(nonEmpty(messages[key]), `${key} should be non-empty`).toBe(true)
      }
    }
  })

  it("keeps the ai namespace at key parity between locales", () => {
    const enKeys = Object.keys(flatten(en.ai as Record<string, unknown>)).sort()
    const esKeys = Object.keys(flatten(es.ai as Record<string, unknown>)).sort()
    expect(esKeys).toEqual(enKeys)
  })
})
