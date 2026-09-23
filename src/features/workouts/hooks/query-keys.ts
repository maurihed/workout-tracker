export const sessionKeys = {
  all: ["sessions"] as const,
  active: () => [...sessionKeys.all, "active"] as const,
  detail: (id: string) => [...sessionKeys.all, "detail", id] as const,
}
