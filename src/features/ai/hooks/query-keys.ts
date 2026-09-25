export const aiKeys = {
  all: ["ai"] as const,
  jobs: () => [...aiKeys.all, "jobs"] as const,
  job: (id: string) => [...aiKeys.all, "job", id] as const,
}
