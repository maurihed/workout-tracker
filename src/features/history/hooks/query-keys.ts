export const historyKeys = { all: ["history"] as const, list: (filters: string) => [...historyKeys.all, filters] as const }
