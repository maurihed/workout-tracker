import { describe, expect, it } from "vitest"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

describe("legal copy", () => {
  it("has non-empty privacy and terms bodies in both locales", () => {
    for (const messages of [en, es]) {
      expect(messages.legal.privacyBody.length).toBeGreaterThan(40)
      expect(messages.legal.termsBody.length).toBeGreaterThan(40)
    }
  })
})
