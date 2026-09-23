const SUFFIX: Record<string, string> = { en: "copy", es: "copia" }

export function copyRoutineName(name: string, locale: string): string {
  return `${name} (${SUFFIX[locale] ?? SUFFIX.en})`
}
