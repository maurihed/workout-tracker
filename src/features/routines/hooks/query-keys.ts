export const routineKeys = {
  all: ["routines"] as const,
  templates: () => [...routineKeys.all, "templates"] as const,
  active: () => [...routineKeys.all, "active"] as const,
  list: () => [...routineKeys.all, "list"] as const,
  detail: (id: string) => [...routineKeys.all, "detail", id] as const,
}
