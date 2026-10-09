import { EventosPantalla } from '../(subcomision)/eventos'

// El Manager crea y cierra los viajes / tercer tiempos de su división.
// Reusa la pantalla de eventos de Subcomisión en modo 'manager'
// (lista filtrada a su división, modal con tipo viaje | tercer tiempo).
export default function EventosManagerScreen() {
  return <EventosPantalla modo="manager" />
}
