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

  it("privacy body states self-hosted AI and export/delete options", () => {
    for (const messages of [en, es]) {
      const body = messages.legal.privacyBody.toLowerCase()
      expect(body).toMatch(/(self-hosted|autoalojados)/)
      expect(body).toMatch(/(export|exportar)/)
      expect(body).toMatch(/(delete|eliminar)/)
    }
  })

  it("terms body states it is not medical advice", () => {
    for (const messages of [en, es]) {
      const body = messages.legal.termsBody.toLowerCase()
      expect(body).toMatch(/(not medical advice|consejo m[eé]dico)/)
    }
  })
})
