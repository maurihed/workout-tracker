import { describe, expect, it } from "vitest"

import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

type Dict = Record<string, unknown>
const dicts: [string, Dict][] = [["en", en as Dict], ["es", es as Dict]]

function at(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Dict)[key]
    return undefined
  }, dict)
}

const OFFLINE_KEYS = [
  "offline.status.offline", "offline.status.syncing", "offline.status.synced", "offline.status.pending",
  "offline.retry", "offline.install.title", "offline.install.body", "offline.install.action",
  "offline.install.dismiss", "offline.page.title", "offline.page.body",
] as const

describe("offline copy", () => {
  it("defines every offline key in both locales", () => {
    for (const [locale, m] of dicts) {
      for (const key of OFFLINE_KEYS) {
        const value = at(m, key)
        expect(typeof value === "string" && value.trim().length > 0, `${locale}:${key}`).toBe(true)
      }
    }
  })
})
