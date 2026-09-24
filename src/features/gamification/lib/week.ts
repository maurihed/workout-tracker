export function weekStart(date: string, weekStartsOn: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function weeksGoalMet(dates: string[], goal: number, weekStartsOn: number): string[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const key = weekStart(date, weekStartsOn)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= Math.max(1, goal))
    .map(([key]) => key)
    .sort()
}
