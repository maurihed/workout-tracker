export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

export type Weekday = (typeof WEEKDAYS)[number]

// 2024-01-07 is a Sunday, so index 0 maps to Sunday … index 6 to Saturday.
const REFERENCE_SUNDAY = Date.UTC(2024, 0, 7)

export function weekdayLabel(locale: string, weekday: number): string {
  const date = new Date(REFERENCE_SUNDAY + weekday * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date)
}
