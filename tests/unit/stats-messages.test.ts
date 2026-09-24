import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

type Dict = Record<string, unknown>
const dicts: [string, Dict][] = [["en", en as Dict], ["es", es as Dict]]
function at(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Dict)[key] : undefined), dict)
}
const KEYS = [
  "dashboard.stats.streak", "dashboard.stats.longest", "dashboard.stats.level", "dashboard.stats.weeklyGoal", "dashboard.stats.badges", "dashboard.stats.viewHistory",
  "history.title", "history.filters", "history.from", "history.to", "history.routine", "history.allRoutines", "history.loadMore", "history.empty", "history.pr", "history.volume", "history.duration", "history.sets", "history.close",
  "celebration.xpGained", "celebration.levelUp", "celebration.badgeUnlocked", "celebration.continue",
] as const

describe("stats copy", () => {
  it("defines every stats/history/celebration key in both locales", () => {
    for (const [locale, m] of dicts) {
      for (const key of KEYS) {
        const value = at(m, key)
        expect(typeof value === "string" && value.trim().length > 0, `${locale}:${key}`).toBe(true)
      }
    }
  })
})
