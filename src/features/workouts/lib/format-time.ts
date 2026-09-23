/**
 * Clock formatting for workout timers and the runner header. Pure and
 * locale-independent: digits and `:` only, so it is safe to render directly.
 */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

/** HH:MM-style elapsed label with zero-padded minutes, e.g. `05:03`. */
export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}
