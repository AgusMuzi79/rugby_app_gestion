import { useAuthStore } from '@/stores/authStore'
import { useTutorStore } from '@/stores/tutorStore'

// Which socio the shared socio screens show.
//   - socio (and every other role): socioId undefined -> each hook resolves
//     the socio by profile_id = auth.uid(), exactly as before.
//   - tutor: the minor selected in useTutorStore. Read-only view: screens use
//     `esTutor` to hide write actions (photo, comprobantes, profile edits).
export function useSocioObjetivo(): { esTutor: boolean; socioId: string | undefined } {
  const esTutor     = useAuthStore(s => s.rol === 'tutor')
  const seleccionado = useTutorStore(s => s.socioSeleccionadoId)
  return { esTutor, socioId: esTutor ? seleccionado ?? undefined : undefined }
}
