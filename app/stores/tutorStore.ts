import { create } from 'zustand'

// Minor linked to the logged-in tutor (tutores_menores, migration
// 20261010000000_tutor_menores). A tutor has no socios row of their own:
// every socio screen they see shows the data of `socioSeleccionadoId`.
export interface MenorTutor {
  id:           string
  nombre:       string
  numero_socio: string
  relacion:     string
}

interface TutorState {
  menores:            MenorTutor[]
  socioSeleccionadoId: string | null
  setMenores:         (menores: MenorTutor[]) => void
  setSocioSeleccionado: (socioId: string) => void
  clearTutor:         () => void
}

export const useTutorStore = create<TutorState>((set) => ({
  menores: [],
  socioSeleccionadoId: null,
  // Keeps the current selection when it is still linked; otherwise falls
  // back to the first minor so the screens always have a target.
  setMenores: (menores) => set((state) => ({
    menores,
    socioSeleccionadoId: menores.some(m => m.id === state.socioSeleccionadoId)
      ? state.socioSeleccionadoId
      : menores[0]?.id ?? null,
  })),
  setSocioSeleccionado: (socioId) => set({ socioSeleccionadoId: socioId }),
  clearTutor: () => set({ menores: [], socioSeleccionadoId: null }),
}))
