import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native'
import {
  usePartido,
  RolEnMesa,
  PartidoEvento,
  JugadorPartido,
  ConteoMesa,
  Equipo,
} from '@/hooks/usePartido'

const CREAM   = '#F5F0E8'
const GOLD    = '#C9A84C'
const DARK    = '#1A1A1A'
const DIVIDER = '#D1C9B8'
const MUTED   = '#7C7267'
const VERDE   = '#22C55E'
const ROJO    = '#EF4444'
const AZUL    = '#3B82F6'

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ─── Fila asistencia ─────────────────────────────────────────────────────────

function FilaAsistencia({
  jugador,
  onToggle,
}: {
  jugador: JugadorPartido
  onToggle: (id: string) => void
}) {
  return (
    <TouchableOpacity style={styles.fila} onPress={() => onToggle(jugador.id)} activeOpacity={0.7}>
      <View style={[styles.checkbox, jugador.presente && styles.checkboxActivo]}>
        {jugador.presente && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.nombreJugador, !jugador.presente && styles.nombreAusente]}>
        {jugador.nombre_completo}
      </Text>
      <Text style={[styles.estadoTexto, { color: jugador.presente ? VERDE : ROJO }]}>
        {jugador.presente ? 'Presente' : 'Ausente'}
      </Text>
    </TouchableOpacity>
  )
}

// ─── Fila mesa ───────────────────────────────────────────────────────────────

function FilaMesa({
  jugador,
  onAsignar,
  titularLleno,
  suplenteLleno,
}: {
  jugador: JugadorPartido
  onAsignar: (id: string, rol: RolEnMesa) => void
  titularLleno: boolean
  suplenteLleno: boolean
}) {
  const roles: Array<{ rol: RolEnMesa; label: string; color: string; lleno: boolean }> = [
    { rol: 'titular',  label: 'T', color: AZUL,  lleno: titularLleno  && jugador.rolEnMesa !== 'titular'  },
    { rol: 'suplente', label: 'S', color: VERDE, lleno: suplenteLleno && jugador.rolEnMesa !== 'suplente' },
  ]
  return (
    <View style={styles.fila}>
      <Text style={styles.nombreJugador} numberOfLines={1}>{jugador.nombre_completo}</Text>
      <View style={styles.rolesBotones}>
        {roles.map(({ rol, label, color, lleno }) => {
          const activo = jugador.rolEnMesa === rol
          return (
            <TouchableOpacity
              key={rol}
              disabled={lleno}
              style={[
                styles.rolBoton,
                activo
                  ? { backgroundColor: color, borderColor: color }
                  : lleno
                  ? { backgroundColor: 'transparent', borderColor: DIVIDER, opacity: 0.3 }
                  : { backgroundColor: 'transparent', borderColor: DIVIDER },
              ]}
              onPress={() => onAsignar(jugador.id, rol)}
              activeOpacity={0.75}
            >
              <Text style={[styles.rolBotonTexto, { color: activo ? '#fff' : lleno ? DIVIDER : MUTED }]}>
                {label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Conteo bar ──────────────────────────────────────────────────────────────

function ConteoBar({ conteo }: { conteo: ConteoMesa }) {
  return (
    <View style={styles.conteoRow}>
      <View style={[styles.conteoChip, { borderColor: AZUL }]}>
        <Text style={[styles.conteoLabel, { color: AZUL }]}>Titulares</Text>
        <Text style={[styles.conteoNum, { color: conteo.titular > 15 ? ROJO : AZUL }]}>
          {conteo.titular}/15
        </Text>
      </View>
      <View style={[styles.conteoChip, { borderColor: VERDE }]}>
        <Text style={[styles.conteoLabel, { color: VERDE }]}>Suplentes</Text>
        <Text style={[styles.conteoNum, { color: conteo.suplente > 8 ? ROJO : VERDE }]}>
          {conteo.suplente}/8
        </Text>
      </View>
    </View>
  )
}

// ─── Selector de partidos ────────────────────────────────────────────────────

function SelectorPartidos({
  partidos,
  seleccionado,
  onSelect,
}: {
  partidos: PartidoEvento[]
  seleccionado: PartidoEvento | null
  onSelect: (p: PartidoEvento) => void
}) {
  if (partidos.length === 0) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={styles.emptyTexto}>Sin partidos programados (próximos 14 días).</Text>
        <Text style={styles.emptySubtexto}>El Coordinador debe cargarlos en el calendario.</Text>
      </View>
    )
  }
  return (
    <View style={{ gap: 8 }}>
      {partidos.map(p => {
        const activo = seleccionado?.id === p.id
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.card, activo && styles.cardActivo]}
            onPress={() => onSelect(p)}
            activeOpacity={0.8}
          >
            <View style={styles.cardRow}>
              <View style={[styles.dot, { backgroundColor: activo ? GOLD : DIVIDER }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, activo && { color: GOLD }]}>
                  vs {p.rival ?? 'Rival por confirmar'}
                </Text>
                <Text style={styles.cardSub}>
                  {formatFecha(p.fecha)}{p.lugar ? ` · ${p.lugar}` : ''}
                </Text>
              </View>
              {activo && <Text style={styles.checkVerde}>✓</Text>}
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Selector de equipos ─────────────────────────────────────────────────────

function SelectorEquipos({
  equipos,
  equipoObligatorio,
  seleccionado,
  onSelect,
}: {
  equipos: Equipo[]
  equipoObligatorio: Equipo | null
  seleccionado: Equipo | null
  onSelect: (e: Equipo) => void
}) {
  if (equipos.length === 0) {
    return <Text style={styles.emptyTexto}>Preparando equipos...</Text>
  }
  return (
    <View style={{ gap: 8 }}>
      {equipos.map(e => {
        const activo = seleccionado?.id === e.id
        const esObligatorio = e.id === equipoObligatorio?.id
        return (
          <TouchableOpacity
            key={e.id}
            style={[styles.card, activo && styles.cardActivo]}
            onPress={() => onSelect(e)}
            activeOpacity={0.8}
          >
            <View style={styles.cardRow}>
              <View style={[styles.dot, { backgroundColor: activo ? GOLD : DIVIDER }]} />
              <Text style={[styles.cardTitle, activo && { color: GOLD }]}>{e.nombre}</Text>
              <View style={[styles.badge, esObligatorio ? styles.badgeObligatorio : styles.badgeOpcional]}>
                <Text style={[styles.badgeTexto, { color: esObligatorio ? DARK : MUTED }]}>
                  {esObligatorio ? 'Obligatorio' : 'Opcional'}
                </Text>
              </View>
              {activo && <Text style={styles.checkVerde}>✓</Text>}
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Paso 1 — Equipo y partido ───────────────────────────────────────────────

function PasoEquipo({
  partidos,
  partidoSeleccionado,
  onSeleccionarPartido,
  equipos,
  equipoObligatorio,
  equipoSeleccionado,
  onSeleccionarEquipo,
  onContinuar,
  cargandoTransicion,
}: {
  partidos: PartidoEvento[]
  partidoSeleccionado: PartidoEvento | null
  onSeleccionarPartido: (p: PartidoEvento) => void
  equipos: Equipo[]
  equipoObligatorio: Equipo | null
  equipoSeleccionado: Equipo | null
  onSeleccionarEquipo: (e: Equipo) => void
  onContinuar: () => void
  cargandoTransicion: boolean
}) {
  const puedeAvanzar = equipoSeleccionado !== null && partidoSeleccionado !== null

  return (
    <View style={{ paddingBottom: 8 }}>
      <View style={styles.seccion}>
        <Text style={styles.seccionLabel}>SELECCIONAR PARTIDO</Text>
        <SelectorPartidos
          partidos={partidos}
          seleccionado={partidoSeleccionado}
          onSelect={onSeleccionarPartido}
        />
      </View>

      <View style={styles.seccion}>
        <Text style={styles.seccionLabel}>SELECCIONAR EQUIPO</Text>
        <SelectorEquipos
          equipos={equipos}
          equipoObligatorio={equipoObligatorio}
          seleccionado={equipoSeleccionado}
          onSelect={onSeleccionarEquipo}
        />
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
        <TouchableOpacity
          style={[styles.boton, (!puedeAvanzar || cargandoTransicion) && { opacity: 0.4 }]}
          onPress={onContinuar}
          disabled={!puedeAvanzar || cargandoTransicion}
          activeOpacity={0.85}
        >
          {cargandoTransicion
            ? <ActivityIndicator color={GOLD} size="small" />
            : <Text style={styles.botonTexto}>CONTINUAR A ASISTENCIA</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Paso 2 — Asistencia ─────────────────────────────────────────────────────

function PasoAsistencia({
  jugadores,
  guardandoAsistencia,
  asistenciaGuardada,
  errorAsistencia,
  esInfantil,
  onToggle,
  onGuardar,
  onVolver,
}: {
  jugadores: JugadorPartido[]
  guardandoAsistencia: boolean
  asistenciaGuardada: boolean
  errorAsistencia: string | null
  esInfantil: boolean
  onToggle: (id: string) => void
  onGuardar: () => Promise<void>
  onVolver: () => void
}) {
  const presentes = jugadores.filter(j => j.presente).length
  const puedeGuardar = esInfantil || presentes > 0

  return (
    <View>
      <TouchableOpacity style={styles.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={styles.volverTexto}>← Volver</Text>
      </TouchableOpacity>

      <View style={styles.seccion}>
        <View style={styles.seccionHeader}>
          <Text style={styles.seccionLabel}>PASO 2 · ASISTENCIA</Text>
          {asistenciaGuardada && <Text style={styles.checkVerde}>✓</Text>}
        </View>
        <Text style={styles.seccionSub}>
          {presentes} presentes · {jugadores.length - presentes} ausentes
        </Text>

        {jugadores.map((j, i) => (
          <View key={j.id}>
            {i > 0 && <View style={styles.filaDiv} />}
            <FilaAsistencia jugador={j} onToggle={onToggle} />
          </View>
        ))}

        {errorAsistencia && (
          <View style={styles.bannerError}>
            <Text style={styles.bannerErrorTexto}>{errorAsistencia}</Text>
          </View>
        )}

        {asistenciaGuardada && !guardandoAsistencia && esInfantil && (
          <View style={styles.bannerOk}>
            <Text style={styles.bannerOkTexto}>✓ Asistencia guardada</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.boton, (!puedeGuardar || guardandoAsistencia) && { opacity: 0.4 }]}
          onPress={onGuardar}
          disabled={!puedeGuardar || guardandoAsistencia}
          activeOpacity={0.85}
        >
          {guardandoAsistencia
            ? <ActivityIndicator color={GOLD} size="small" />
            : <Text style={styles.botonTexto}>
                {esInfantil ? 'GUARDAR ASISTENCIA' : 'GUARDAR Y CONTINUAR A MESA'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Paso 3 — Mesa ───────────────────────────────────────────────────────────

function PasoMesa({
  jugadoresPresentes,
  conteoMesa,
  guardandoMesa,
  mesaGuardada,
  errorMesa,
  esInfantil,
  onAsignar,
  onGuardar,
  onVolver,
  onIrAResultado,
}: {
  jugadoresPresentes: JugadorPartido[]
  conteoMesa: ConteoMesa
  guardandoMesa: boolean
  mesaGuardada: boolean
  errorMesa: string | null
  esInfantil: boolean
  onAsignar: (id: string, rol: RolEnMesa) => void
  onGuardar: () => Promise<void>
  onVolver: () => void
  onIrAResultado: () => Promise<void>
}) {
  const titularLleno  = conteoMesa.titular >= 15
  const suplenteLleno = conteoMesa.suplente >= 8

  return (
    <View>
      <TouchableOpacity style={styles.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={styles.volverTexto}>← Volver a asistencia</Text>
      </TouchableOpacity>

      <View style={styles.seccion}>
        <View style={styles.seccionHeader}>
          <Text style={styles.seccionLabel}>PASO 3 · MESA DE PARTIDO</Text>
          {mesaGuardada && <Text style={styles.checkVerde}>✓</Text>}
        </View>

        <ConteoBar conteo={conteoMesa} />

        {jugadoresPresentes.length === 0 ? (
          <Text style={styles.mutedTexto}>No hay jugadores presentes.</Text>
        ) : (
          jugadoresPresentes.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={styles.filaDiv} />}
              <FilaMesa
                jugador={j}
                onAsignar={onAsignar}
                titularLleno={titularLleno}
                suplenteLleno={suplenteLleno}
              />
            </View>
          ))
        )}

        {errorMesa && (
          <View style={styles.bannerError}>
            <Text style={styles.bannerErrorTexto}>{errorMesa}</Text>
          </View>
        )}

        {mesaGuardada && !guardandoMesa && (
          <View style={styles.bannerOk}>
            <Text style={styles.bannerOkTexto}>✓ Mesa guardada</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.boton, guardandoMesa && { opacity: 0.6 }]}
          onPress={onGuardar}
          disabled={guardandoMesa}
          activeOpacity={0.85}
        >
          {guardandoMesa
            ? <ActivityIndicator color={GOLD} size="small" />
            : <Text style={styles.botonTexto}>GUARDAR MESA</Text>}
        </TouchableOpacity>

        {mesaGuardada && !esInfantil && (
          <TouchableOpacity
            style={styles.botonSecundario}
            onPress={onIrAResultado}
            activeOpacity={0.85}
          >
            <Text style={styles.botonSecundarioTexto}>IR AL RESULTADO →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// ─── Paso 4 — Resultado ──────────────────────────────────────────────────────

function PasoResultado({
  puntosPropios,
  puntosRival,
  rivalNombre,
  guardandoResultado,
  resultadoGuardado,
  errorResultado,
  onChangePropios,
  onChangeRival,
  onChangeRivalNombre,
  onGuardar,
  onVolver,
}: {
  puntosPropios: string
  puntosRival: string
  rivalNombre: string
  guardandoResultado: boolean
  resultadoGuardado: boolean
  errorResultado: string | null
  onChangePropios: (v: string) => void
  onChangeRival: (v: string) => void
  onChangeRivalNombre: (v: string) => void
  onGuardar: () => Promise<void>
  onVolver: () => void
}) {
  return (
    <View>
      <TouchableOpacity style={styles.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={styles.volverTexto}>← Volver a mesa</Text>
      </TouchableOpacity>

      <View style={styles.seccion}>
        <View style={styles.seccionHeader}>
          <Text style={styles.seccionLabel}>PASO 4 · RESULTADO</Text>
          {resultadoGuardado && <Text style={styles.checkVerde}>✓</Text>}
        </View>

        <View style={styles.resultadoRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.inputLabel}>NOSOTROS</Text>
            <TextInput
              style={styles.inputNumero}
              value={puntosPropios}
              onChangeText={onChangePropios}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={DIVIDER}
              maxLength={3}
            />
          </View>
          <Text style={styles.vsTexto}>vs</Text>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[styles.inputLabel, { textAlign: 'right' }]}>RIVAL</Text>
            <TextInput
              style={[styles.inputNumero, { textAlign: 'right' }]}
              value={puntosRival}
              onChangeText={onChangeRival}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={DIVIDER}
              maxLength={3}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={styles.inputLabel}>NOMBRE DEL RIVAL</Text>
          <TextInput
            style={styles.inputTexto}
            value={rivalNombre}
            onChangeText={onChangeRivalNombre}
            placeholder="Nombre del rival"
            placeholderTextColor={MUTED}
          />
        </View>

        {errorResultado && (
          <View style={styles.bannerError}>
            <Text style={styles.bannerErrorTexto}>{errorResultado}</Text>
          </View>
        )}

        {resultadoGuardado && !guardandoResultado && (
          <View style={styles.bannerOk}>
            <Text style={styles.bannerOkTexto}>✓ Resultado guardado</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.boton, guardandoResultado && { opacity: 0.6 }]}
          onPress={onGuardar}
          disabled={guardandoResultado}
          activeOpacity={0.85}
        >
          {guardandoResultado
            ? <ActivityIndicator color={GOLD} size="small" />
            : <Text style={styles.botonTexto}>
                {resultadoGuardado ? 'ACTUALIZAR RESULTADO' : 'GUARDAR RESULTADO'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Screen principal ────────────────────────────────────────────────────────

export default function PartidoScreen() {
  const {
    loading, divisionNombre, sinDivision, esInfantil,
    equipos, equipoObligatorio, equipoSeleccionado, seleccionarEquipo,
    partidos, partidoSeleccionado, seleccionarPartido,
    jugadores, paso, cargandoTransicion, irAAsistencia, irAEquipo, irAMesa, irAResultado,
    guardandoAsistencia, asistenciaGuardada, errorAsistencia,
    togglePresente, guardarAsistencia,
    conteoMesa, asignarRol,
    guardandoMesa, mesaGuardada, errorMesa, guardarMesa,
    puntosPropios, puntosRival, rivalNombre,
    setPuntosPropios, setPuntosRival, setRivalNombre,
    guardandoResultado, resultadoGuardado, errorResultado, guardarResultado,
  } = usePartido()

  const pasoLabel: Record<typeof paso, string> = {
    equipo:     'PASO 1 · EQUIPO',
    asistencia: 'PASO 2 · ASISTENCIA',
    mesa:       'PASO 3 · MESA',
    resultado:  'PASO 4 · RESULTADO',
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centrado}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={styles.centrado}>
        <Text style={styles.mutedTexto}>Sin división asignada.</Text>
        <Text style={styles.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  const jugadoresPresentes = jugadores.filter(j => j.presente)

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.labelHeader}>
          ENTRENADOR · {divisionNombre.toUpperCase()} · {pasoLabel[paso]}
        </Text>
        <Text style={styles.titulo}>Partido</Text>
      </View>
      <View style={styles.separador} />

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {paso === 'equipo' && (
          <PasoEquipo
            partidos={partidos}
            partidoSeleccionado={partidoSeleccionado}
            onSeleccionarPartido={seleccionarPartido}
            equipos={equipos}
            equipoObligatorio={equipoObligatorio}
            equipoSeleccionado={equipoSeleccionado}
            onSeleccionarEquipo={seleccionarEquipo}
            onContinuar={irAAsistencia}
            cargandoTransicion={cargandoTransicion}
          />
        )}

        {paso === 'asistencia' && (
          <PasoAsistencia
            jugadores={jugadores}
            guardandoAsistencia={guardandoAsistencia}
            asistenciaGuardada={asistenciaGuardada}
            errorAsistencia={errorAsistencia}
            esInfantil={esInfantil}
            onToggle={togglePresente}
            onGuardar={guardarAsistencia}
            onVolver={irAEquipo}
          />
        )}

        {paso === 'mesa' && (
          <PasoMesa
            jugadoresPresentes={jugadoresPresentes}
            conteoMesa={conteoMesa}
            guardandoMesa={guardandoMesa}
            mesaGuardada={mesaGuardada}
            errorMesa={errorMesa}
            esInfantil={esInfantil}
            onAsignar={asignarRol}
            onGuardar={guardarMesa}
            onVolver={irAAsistencia}
            onIrAResultado={irAResultado}
          />
        )}

        {paso === 'resultado' && (
          <PasoResultado
            puntosPropios={puntosPropios}
            puntosRival={puntosRival}
            rivalNombre={rivalNombre}
            guardandoResultado={guardandoResultado}
            resultadoGuardado={resultadoGuardado}
            errorResultado={errorResultado}
            onChangePropios={setPuntosPropios}
            onChangeRival={setPuntosRival}
            onChangeRivalNombre={setRivalNombre}
            onGuardar={guardarResultado}
            onVolver={irAMesa}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: CREAM },
  centrado:           { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM, gap: 8 },
  mutedTexto:         { color: MUTED, fontSize: 14, fontFamily: 'serif', fontStyle: 'italic', textAlign: 'center' },
  header:             { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  labelHeader:        { fontSize: 10, letterSpacing: 2, color: GOLD, marginBottom: 4 },
  titulo:             { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: DARK, lineHeight: 36 },
  separador:          { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  seccion:            { marginHorizontal: 16, marginTop: 16, gap: 10 },
  seccionHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seccionLabel:       { fontSize: 10, letterSpacing: 2, color: GOLD },
  seccionSub:         { fontSize: 12, color: MUTED },
  checkVerde:         { fontSize: 16, color: VERDE, fontWeight: '700' },

  card:               { borderWidth: 1, borderColor: DIVIDER, borderRadius: 8, padding: 12 },
  cardActivo:         { borderColor: GOLD, backgroundColor: '#FBF6EA' },
  cardRow:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:                { width: 8, height: 8, borderRadius: 4 },
  cardTitle:          { flex: 1, fontSize: 15, color: DARK, fontWeight: '600' },
  cardSub:            { fontSize: 12, color: MUTED, marginTop: 2 },

  emptyTexto:         { color: MUTED, fontSize: 14, fontStyle: 'italic', fontFamily: 'serif' },
  emptySubtexto:      { color: MUTED, fontSize: 12 },

  badge:              { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  badgeObligatorio:   { backgroundColor: '#FBF0D0' },
  badgeOpcional:      { backgroundColor: '#F0EDE8' },
  badgeTexto:         { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  fila:               { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  filaDiv:            { height: 1, backgroundColor: DIVIDER },
  checkbox:           { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: DIVIDER, justifyContent: 'center', alignItems: 'center' },
  checkboxActivo:     { backgroundColor: VERDE, borderColor: VERDE },
  checkmark:          { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  nombreJugador:      { flex: 1, fontSize: 14, color: DARK },
  nombreAusente:      { color: MUTED, textDecorationLine: 'line-through' },
  estadoTexto:        { fontSize: 11, fontWeight: '600', width: 56, textAlign: 'right' },

  rolesBotones:       { flexDirection: 'row', gap: 6 },
  rolBoton:           { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  rolBotonTexto:      { fontSize: 11, fontWeight: '700' },

  conteoRow:          { flexDirection: 'row', gap: 10 },
  conteoChip:         { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  conteoLabel:        { fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  conteoNum:          { fontSize: 18, fontWeight: '700', lineHeight: 22 },

  bannerError:        { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: ROJO, borderRadius: 6, padding: 12 },
  bannerErrorTexto:   { fontSize: 13, color: '#991B1B' },
  bannerOk:           { alignItems: 'center', paddingVertical: 6 },
  bannerOkTexto:      { fontSize: 13, color: VERDE, fontWeight: '600' },

  boton:              { backgroundColor: DARK, paddingVertical: 14, borderRadius: 4, alignItems: 'center', marginTop: 4 },
  botonTexto:         { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '600' },

  botonSecundario:    { borderWidth: 1.5, borderColor: GOLD, paddingVertical: 12, borderRadius: 4, alignItems: 'center', marginTop: 4 },
  botonSecundarioTexto: { color: GOLD, fontSize: 11, letterSpacing: 2.5, fontWeight: '600' },

  volverBtn:          { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  volverTexto:        { color: GOLD, fontSize: 13, fontWeight: '600' },

  resultadoRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vsTexto:            { fontSize: 20, color: MUTED, fontStyle: 'italic', fontFamily: 'serif', alignSelf: 'flex-end', paddingBottom: 8 },
  inputLabel:         { fontSize: 10, letterSpacing: 2, color: GOLD },
  inputNumero:        { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, paddingVertical: 12, paddingHorizontal: 8, fontSize: 32, fontWeight: '700', color: DARK, textAlign: 'center' },
  inputTexto:         { borderWidth: 1.5, borderColor: DIVIDER, borderRadius: 6, padding: 12, fontSize: 15, color: DARK },
})
