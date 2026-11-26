import { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Alert, RefreshControl, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { accionesTenis, useTenisGrilla, type BloqueEditable } from '@/hooks/useTenisGestor'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { CONFIG_DEFECTO, fechaArgentina, type ItemGrilla, type TenisConfig } from '@/lib/tenis'
import { diasVista, reservasPorCancha } from '@/lib/tenisGrilla'
import { GrillaCanchas } from './GrillaCanchas'
import { DetalleItem } from './DetalleItem'
import { EditorBloque, bloqueDesdeItem, type ModoBloque } from './EditorBloque'
import { FormReserva } from './FormReserva'
import { Boton } from './ui'
import { NavegadorDia, SelectorVista, type VistaTenis } from './NavegadorDia'
import { DisponibilidadSemana } from './DisponibilidadSemana'

// Grilla del gestor: el día elegido con todas las reservas (titular,
// jugadores, cobro) y los bloques. Tocar una celda libre ofrece una reserva
// telefónica o un bloqueo; tocar un ítem abre su detalle.

export function GrillaGestor({ onConfig }: { onConfig?: (c: TenisConfig) => void }) {
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const [fecha, setFecha] = useState(() => fechaArgentina(Date.now()))
  const { grilla, loading, error, refetch } = useTenisGrilla(fecha)
  const [detalle, setDetalle] = useState<ItemGrilla | null>(null)
  const [editor, setEditor] = useState<{ modo: ModoBloque; inicial?: BloqueEditable; cancha?: string | null; hora?: string } | null>(null)
  const [reserva, setReserva] = useState<{ cancha: string | null; hora: string | null } | null>(null)
  const [vista, setVista] = useState<VistaTenis>('dia')

  const recargar = () => { setAhoraMs(Date.now()); refetch() }
  useRefreshOnFocus(refetch)

  const config = grilla?.config ?? CONFIG_DEFECTO
  // Los días que se ven (`dias_vista`, como el socio); el gestor carga en todos.
  const dias = useMemo(() => diasVista(ahoraMs, config.dias_vista), [ahoraMs, config.dias_vista])
  useEffect(() => { if (grilla) onConfig?.(grilla.config) }, [grilla, onConfig])

  function celdaLibre(cancha: string, hora: string) {
    Alert.alert(`Cancha ${grilla?.canchas.find(c => c.id === cancha)?.nombre ?? ''} · ${hora}`, '¿Qué querés cargar?', [
      { text: 'Reserva telefónica', onPress: () => setReserva({ cancha, hora }) },
      { text: 'Bloqueo puntual', onPress: () => setEditor({ modo: 'puntual', cancha, hora }) },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  const canchaNombre = (id: string | null) =>
    id === null ? 'TODAS' : grilla?.canchas.find(c => c.id === id)?.nombre ?? ''

  return (
    <ScrollView
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} tintColor={colors.oro} />}
    >
      <SelectorVista vista={vista} onCambiar={setVista} />
      <View style={s.botones}>
        <Boton texto="RESERVA TELEFÓNICA" variante="secundario" onPress={() => setReserva({ cancha: grilla?.canchas[0]?.id ?? null, hora: null })} disabled={!grilla} />
        <Boton texto="+ BLOQUE FIJO" variante="secundario" onPress={() => setEditor({ modo: 'fijo' })} disabled={!grilla} />
        <Boton texto="+ BLOQUEO PUNTUAL" variante="secundario" onPress={() => setEditor({ modo: 'puntual' })} disabled={!grilla} />
      </View>

      {vista === 'semana' ? (
        <DisponibilidadSemana
          desde={dias[0]}
          dias={dias.length}
          ahoraMs={ahoraMs}
          onElegirDia={f => { setFecha(f); setVista('dia') }}
        />
      ) : (
      <>
      <NavegadorDia
        dias={dias}
        fecha={fecha}
        ahoraMs={ahoraMs}
        reservas={grilla ? reservasPorCancha(grilla.items, grilla.canchas).total : null}
        canchas={grilla?.canchas.length ?? 0}
        cerrado={grilla?.horario?.abierto === false}
        onCambiar={setFecha}
      />
      {loading && !grilla ? (
        <ActivityIndicator color={colors.oro} style={s.cargando} />
      ) : error && !grilla ? (
        <ErrorCarga mensaje={error} onReintentar={recargar} />
      ) : grilla ? (
        <>
          <GrillaCanchas
            fecha={fecha}
            config={config}
            horario={grilla.horario}
            canchas={grilla.canchas}
            items={grilla.items}
            ahoraMs={ahoraMs}
            conDetalle
            onPressItem={setDetalle}
            onPressLibre={celdaLibre}
          />
          {error && <Text style={s.error}>{error}</Text>}
        </>
      ) : null}
      </>
      )}

      {detalle && (
        <DetalleItem
          item={detalle}
          canchaNombre={canchaNombre(detalle.cancha_id)}
          config={config}
          esGestor
          onCerrar={() => setDetalle(null)}
          onCambio={refetch}
          onEditarBloque={it => { setDetalle(null); setEditor({ modo: 'fijo', inicial: bloqueDesdeItem(it, fecha) }) }}
        />
      )}
      {editor && grilla && (
        <EditorBloque
          modo={editor.modo}
          fecha={fecha}
          canchas={grilla.canchas}
          inicial={editor.inicial}
          canchaInicial={editor.cancha ?? null}
          horaInicial={editor.hora}
          onCerrar={() => setEditor(null)}
          onGuardado={() => { setEditor(null); refetch() }}
        />
      )}
      {reserva && grilla && (
        <FormReserva
          visible
          staff
          onCerrar={() => { setReserva(null); refetch() }}
          fecha={fecha}
          canchas={grilla.canchas}
          config={config}
          items={grilla.items}
          ahoraMs={ahoraMs}
          canchaInicial={reserva.cancha}
          horaInicial={reserva.hora}
          onConfirmar={async d => {
            if (!d.titular) return { ok: false, mensaje: 'Elegí al titular.' }
            return accionesTenis.reservarStaff({ ...d, titular: d.titular })
          }}
        />
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  contenido: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 60 },
  botones:   { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 },
  cargando:  { marginVertical: 24 },
  error:     { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.rojoTexto, marginTop: 8 },
})
