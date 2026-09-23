import { afterEach, describe, expect, it, vi } from "vitest"
import {
  notificationPermission, requestNotificationPermission, scheduleTimerNotification,
} from "@/features/workouts/lib/timer-notifications"

afterEach(() => { vi.unstubAllGlobals() })

describe("timer notifications", () => {
  it("reports unsupported when Notification is absent", () => {
    vi.stubGlobal("Notification", undefined)
    expect(notificationPermission()).toBe("unsupported")
  })

  it("requests permission when supported", async () => {
    const requestPermission = vi.fn(async () => "granted")
    vi.stubGlobal("Notification", { permission: "default", requestPermission })
    expect(notificationPermission()).toBe("default")
    expect(await requestNotificationPermission()).toBe("granted")
    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it("fires a notification when the deadline elapses and can be cancelled", async () => {
    const showNotification = vi.fn(async () => undefined)
    vi.stubGlobal("Notification", { permission: "granted" })
    vi.stubGlobal("navigator", { ...navigator, serviceWorker: { ready: Promise.resolve({ showNotification }) } })
    const cancel = scheduleTimerNotification(Date.now() + 20, "Rest", "Go")
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(showNotification).toHaveBeenCalledOnce()
    cancel()
  })
})
