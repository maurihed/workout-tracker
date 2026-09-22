export const routineKeys = {
  all: ["routines"] as const,
  templates: () => [...routineKeys.all, "templates"] as const,
  active: () => [...routineKeys.all, "active"] as const,
}
