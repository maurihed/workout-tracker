import { create } from "zustand"

type UiState = {
  lastRoutineId: string | null
  setLastRoutineId: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  lastRoutineId: null,
  setLastRoutineId: (lastRoutineId) => set({ lastRoutineId }),
}))
