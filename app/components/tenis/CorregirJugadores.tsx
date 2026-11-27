import { useEffect, useState } from 'react'
import { View, Text, Modal, ScrollView, Switch, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { accionesTenis, type JugadorCorregido } from '@/hooks/useTenisGestor'
import { entradaJugadorExistente, jugadoresRequeridos, type ItemGrilla } from '@/lib/tenis'
import { esEntradaADesignar } from '@/lib/tenisReserva'
import { BuscadorJugador } from './BuscadorJugador'
import { FilaJugador } from './FormReserva'
import { Aviso, BarraModal, Boton, estilosTenis } from './ui'

// Corregir los jugadores de una reserva antes de entrar (canchero o gestor):
// se cambian los que no son el titular y el servidor recalcula los cargos.
// Opcionalmente queda una infracción "jugadores incorrectos" al titular.

interface Fila { clave: string; nombre: string; entrada: JugadorCorregido }

function filasIniciales(item: ItemGrilla): Fila[] {
  // Los que siguen: socio por socio_id, invitado por DNI o, si se cargó sólo con
  // nombre, por invitado_id; los "Socio a designar" quedan como lugar guardado.
  return (item.jugadores ?? []).filter(j => !j.es_titular).flatMap((j, i): Fila[] => {
    const entrada = entradaJugadorExistente(j)
    if (!entrada) return []
    const clave = j.socio_id ?? (j.dni ? `dni:${j.dni}` : j.invitado_id ? `inv:${j.invitado_id}` : `designar:${i}`)
    return [{ clave, nombre: j.nombre, entrada }]
  })
}

export function CorregirJugadores({ item, onCerrar, onGuardado }: {
  item: ItemGrilla
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [filas, setFilas] = useState<Fila[]>(() => filasIniciales(item))
  const [infraccion, setInfraccion] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setFilas(filasIniciales(item)) }, [item])

  const requeridos = jugadoresRequeridos(item.modalidad ?? 'singles')
  const titular = item.jugadores?.find(j => j.es_titular)
  const excluir = [...filas.map(f => f.clave), ...(titular?.socio_id ? [titular.socio_id] : [])]

  async function guardar() {
    if (!item.reserva_id) return
    setGuardando(true)
    setError(null)
    const r = await accionesTenis.jugadoresCorregir(item.reserva_id, filas.map(f => f.entrada), infraccion)
    setGuardando(false)
    if (r.ok) onGuardado()
    else setError(r.mensaje)
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo="CORREGIR JUGADORES" onCerrar={onCerrar} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo} keyboardShouldPersistTaps="handled">
            {titular && <Text style={estilosTenis.textoCard}>Titular: {titular.nombre}</Text>}
            <Text style={estilosTenis.label}>JUGADORES ({filas.length}/{requeridos})</Text>
            {filas.map(f => (
              <FilaJugador
                key={f.clave}
                nombre={f.nombre}
                aDesignar={esEntradaADesignar(f.entrada)}
                onQuitar={() => setFilas(fs => fs.filter(x => x.clave !== f.clave))}
              />
            ))}
            {filas.length < requeridos && (
              <BuscadorJugador
                excluir={excluir}
                onElegir={j => setFilas(fs => [...fs, { clave: j.clave, nombre: j.nombre, entrada: j.entrada }])}
              />
            )}
            <View style={s.switchFila}>
              <Text style={[estilosTenis.textoCard, { flex: 1 }]}>Registrar infracción al titular (jugadores incorrectos)</Text>
              <Switch
                value={infraccion}
                onValueChange={setInfraccion}
                trackColor={{ true: colors.oro, false: colors.bordeRealce }}
                thumbColor={colors.blanco}
                accessibilityLabel="Registrar infracción al titular"
              />
            </View>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton texto="GUARDAR JUGADORES" onPress={guardar} cargando={guardando} disabled={filas.length !== requeridos} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const s = StyleSheet.create({
  switchFila:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
})
