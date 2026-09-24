export const progressKeys = {
  all: ["progress"] as const,
  bodyMetrics: (filters: string) => [...progressKeys.all, "body-metrics", filters] as const,
}
