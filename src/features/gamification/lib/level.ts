export function xpForLevel(level: number): number {
  const safe = Math.max(1, Math.floor(level))
  return 100 * (safe - 1) ** 2
}

export function levelForXp(xp: number): number {
  const safe = Math.max(0, xp)
  return Math.floor(Math.sqrt(safe / 100)) + 1
}

export function xpToNextLevel(xp: number): number {
  const safe = Math.max(0, xp)
  return xpForLevel(levelForXp(safe) + 1) - safe
}

export function levelProgress(xp: number): number {
  const safe = Math.max(0, xp)
  const level = levelForXp(safe)
  const floor = xpForLevel(level)
  const ceil = xpForLevel(level + 1)
  if (ceil <= floor) return 0
  return (safe - floor) / (ceil - floor)
}
