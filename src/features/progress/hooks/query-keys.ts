export const progressKeys = {
  all: ["progress"] as const,
  bodyMetrics: (filters: string) => [...progressKeys.all, "body-metrics", filters] as const,
  overview: (weeks: number) => [...progressKeys.all, "overview", weeks] as const,
  exerciseProgress: (exerciseId: string) =>
    [...progressKeys.all, "exercise-progress", exerciseId] as const,
}
