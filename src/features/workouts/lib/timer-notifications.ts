export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported"

const MAX_TIMEOUT_MS = 2_147_483_647

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported"
  return Notification.permission as NotificationPermissionState
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === "undefined") return "unsupported"
  if (Notification.permission !== "default") return Notification.permission as NotificationPermissionState
  return (await Notification.requestPermission()) as NotificationPermissionState
}

export async function notifyTimerEnd(title: string, body: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return
  try {
    const registration = await navigator.serviceWorker?.ready
    await registration?.showNotification(title, { body, tag: "gym-timer" })
  } catch {
    // Notifications are a progressive enhancement.
  }
}

export function scheduleTimerNotification(
  deadlineMs: number | null,
  title: string,
  body: string,
): () => void {
  if (deadlineMs === null) return () => undefined
  const delay = Math.min(Math.max(0, deadlineMs - Date.now()), MAX_TIMEOUT_MS)
  const id = setTimeout(() => {
    void notifyTimerEnd(title, body)
  }, delay)
  return () => clearTimeout(id)
}
