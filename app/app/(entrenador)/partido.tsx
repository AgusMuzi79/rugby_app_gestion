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
import { colors, fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

// ─── Tokens ───────────────────────────────────────────────────────────────────

const VERDE = '#4A7C59'
const ROJO  = colors.rojoUrgente

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ─── Conteo bar (Mesa) ────────────────────────────────────────────────────────

function ConteoBar({ conteo }: { conteo: ConteoMesa }) {
  return (
    <View style={s.conteoRow}>
      <View style={[s.conteoBox, { borderColor: colors.oro }]}>
        <Text style={[s.conteoNum, { color: conteo.titular > 15 ? ROJO : colors.oro }]}>
          {conteo.titular}/15
        </Text>
        <Text style={s.conteoLabel}>TITULARES</Text>
      </View>
      <View style={[s.conteoBox, { borderColor: colors.oro }]}>
        <Text style={[s.conteoNum, { color: conteo.suplente > 8 ? ROJO : colors.oro }]}>
          {conteo.suplente}/8
        </Text>
        <Text style={s.conteoLabel}>SUPLENTES</Text>
      </View>
    </View>
  )
}

// ─── Fila asistencia (partido) ────────────────────────────────────────────────

function FilaAsistencia({
  jugador,
  index,
  onToggle,
}: {
  jugador: JugadorPartido
  index: number
  onToggle: (id: string) => void
}) {
  const numero = String(index + 1).padStart(2, '0')
  return (
    <View style={s.fila}>
      <Text style={s.numero}>{numero}</Text>
      <Text style={s.nombre} numberOfLines={1}>{jugador.nombre_completo}</Text>
      <View style={s.badgesRow}>
        <TouchableOpacity
          style={[s.badge, jugador.presente ? s.badgePres : s.badgeInactivo]}
          onPress={() => { if (!jugador.presente) onToggle(jugador.id) }}
          activeOpacity={0.75}
        >
          <Text style={[s.badgeTexto, { color: jugador.presente ? '#fff' : '#A09880' }]}>
            PRES
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.badge, !jugador.presente ? s.badgeAus : s.badgeInactivo]}
          onPress={() => { if (jugador.presente) onToggle(jugador.id) }}
          activeOpacity={0.75}
        >
          <Text style={[s.badgeTexto, { color: !jugador.presente ? '#fff' : '#A09880' }]}>
            AUS
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Fila mesa ────────────────────────────────────────────────────────────────

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
  if (jugador.rolEnMesa !== null) {
    return (
      <TouchableOpacity
        style={s.mesaCardDark}
        onPress={() => onAsignar(jugador.id, jugador.rolEnMesa!)}
        activeOpacity={0.75}
      >
        <Text style={s.mesaNombreDark} numberOfLines={1}>{jugador.nombre_completo}</Text>
        <Text style={s.mesaQuitarTexto}>✕</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.mesaCardLight}>
      <Text style={s.mesaNombreLight} numberOfLines={1}>{jugador.nombre_completo}</Text>
      <View style={s.mesaBotones}>
        <TouchableOpacity
          style={[s.mesaRolBtn, titularLleno && s.mesaRolBtnOff]}
          onPress={() => onAsignar(jugador.id, 'titular')}
          disabled={titularLleno}
          activeOpacity={0.75}
        >
          <Text style={[s.mesaRolBtnTxt, titularLleno && { color: '#C5BEA8' }]}>T</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.mesaRolBtn, suplenteLleno && s.mesaRolBtnOff]}
          onPress={() => onAsignar(jugador.id, 'suplente')}
          disabled={suplenteLleno}
          activeOpacity={0.75}
        >
          <Text style={[s.mesaRolBtnTxt, suplenteLleno && { color: '#C5BEA8' }]}>S</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Selector de partidos ─────────────────────────────────────────────────────

function SelectorPartidos({
  partidos,
  seleccionado,
  onSelect,
}: {
  partidos: PartidoEvento[]
  seleccionado: PartidoEvento | null
  onSelect: (p: PartidoEvento) => void
}) {
  const { colors: tc } = useTheme()
  if (partidos.length === 0) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={s.emptyTexto}>Sin partidos programados en los próximos 14 días.</Text>
        <Text style={s.emptySubtexto}>El Coordinador debe cargarlos en el calendario.</Text>
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
            style={[s.card, activo && s.cardActivo, { borderColor: tc.tinta, backgroundColor: tc.fondo }]}
            onPress={() => onSelect(p)}
            activeOpacity={0.8}
          >
            <View style={s.cardRow}>
              <View style={s.cardInfo}>
                <Text style={[s.cardTitle, { color: tc.tinta }, activo && { color: colors.oro }]}>
                  vs {p.rival ?? 'Rival por confirmar'}
                </Text>
                <Text style={s.cardSub}>
                  {formatFecha(p.fecha)}{p.lugar ? ` · ${p.lugar}` : ''}
                </Text>
              </View>
              {activo && <Text style={s.checkOro}>✓</Text>}
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Selector de equipos ──────────────────────────────────────────────────────

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
    return <Text style={s.emptyTexto}>Preparando equipos...</Text>
  }
  return (
    <View style={{ gap: 8 }}>
      {equipos.map(e => {
        const activo       = seleccionado?.id === e.id
        const esObligatorio = e.id === equipoObligatorio?.id
        return (
          <TouchableOpacity
            key={e.id}
            style={[s.card, activo && s.cardActivo]}
            onPress={() => onSelect(e)}
            activeOpacity={0.8}
          >
            <View style={s.cardRow}>
              <Text style={[s.cardTitle, { flex: 1 }, activo && { color: colors.oro }]}>
                {e.nombre}
              </Text>
              <View style={[s.equipoBadge, esObligatorio ? s.equipoBadgeOblig : s.equipoBadgeOpc]}>
                <Text style={[s.equipoBadgeTexto, { color: esObligatorio ? colors.blanco : colors.oroHondo }]}>
                  {esObligatorio ? 'OBLIGATORIO' : 'OPCIONAL'}
                </Text>
              </View>
              {activo && <Text style={[s.checkOro, { marginLeft: 8 }]}>✓</Text>}
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Paso 1 — Equipo y partido ────────────────────────────────────────────────

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
    <View style={{ paddingBottom: 16 }}>
      <View style={s.bloque}>
        <Text style={s.seccionLabel}>SELECCIONAR PARTIDO</Text>
        <SelectorPartidos
          partidos={partidos}
          seleccionado={partidoSeleccionado}
          onSelect={onSeleccionarPartido}
        />
      </View>

      <View style={s.seccionDivider} />

      <View style={s.bloque}>
        <Text style={s.seccionLabel}>SELECCIONAR EQUIPO</Text>
        <SelectorEquipos
          equipos={equipos}
          equipoObligatorio={equipoObligatorio}
          seleccionado={equipoSeleccionado}
          onSelect={onSeleccionarEquipo}
        />
      </View>

      <View style={[s.bloque, { marginTop: 8 }]}>
        <TouchableOpacity
          style={[s.botonPrimario, (!puedeAvanzar || cargandoTransicion) && { opacity: 0.4 }]}
          onPress={onContinuar}
          disabled={!puedeAvanzar || cargandoTransicion}
          activeOpacity={0.85}
        >
          {cargandoTransicion
            ? <ActivityIndicator color={colors.oro} size="small" />
            : <Text style={s.botonPrimarioTexto}>CONTINUAR A ASISTENCIA</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Paso 2 — Asistencia ──────────────────────────────────────────────────────

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
  const { colors: tc } = useTheme()
  const presentes  = jugadores.filter(j => j.presente).length
  const ausentes   = jugadores.length - presentes
  const puedeGuardar = esInfantil || presentes > 0

  return (
    <View>
      <TouchableOpacity style={s.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={s.volverTexto}>← VOLVER</Text>
      </TouchableOpacity>

      {/* Contadores */}
      <View style={s.contadores}>
        <View style={[s.contadorBox, { borderColor: VERDE }]}>
          <Text style={[s.contadorNum, { color: VERDE }]}>{presentes}</Text>
          <Text style={s.contadorLabel}>PRESENTES</Text>
        </View>
        <View style={[s.contadorBox, { borderColor: ROJO }]}>
          <Text style={[s.contadorNum, { color: ROJO }]}>{ausentes}</Text>
          <Text style={s.contadorLabel}>AUSENTES</Text>
        </View>
      </View>

      <View style={s.divider} />

      {/* Lista numerada */}
      {jugadores.map((j, i) => (
        <View key={j.id}>
          {i > 0 && <View style={[s.separator, { backgroundColor: tc.grisClaro }]} />}
          <FilaAsistencia jugador={j} index={i} onToggle={onToggle} />
        </View>
      ))}

      <View style={[s.bloque, { marginTop: 16 }]}>
        {errorAsistencia && (
          <View style={s.bannerError}>
            <Text style={s.bannerErrorTexto}>{errorAsistencia}</Text>
          </View>
        )}
        {asistenciaGuardada && !guardandoAsistencia && esInfantil && (
          <Text style={s.bannerOkTexto}>✓ Asistencia guardada</Text>
        )}
        <TouchableOpacity
          style={[s.botonPrimario, (!puedeGuardar || guardandoAsistencia) && { opacity: 0.4 }]}
          onPress={onGuardar}
          disabled={!puedeGuardar || guardandoAsistencia}
          activeOpacity={0.85}
        >
          {guardandoAsistencia
            ? <ActivityIndicator color={colors.oro} size="small" />
            : <Text style={s.botonPrimarioTexto}>
                {esInfantil ? 'GUARDAR ASISTENCIA' : 'GUARDAR Y CONTINUAR A MESA'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Paso 3 — Mesa ────────────────────────────────────────────────────────────

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
  const titularLleno  = conteoMesa.titular  >= 15
  const suplenteLleno = conteoMesa.suplente >= 8

  const titulares   = jugadoresPresentes.filter(j => j.rolEnMesa === 'titular')
  const suplentes   = jugadoresPresentes.filter(j => j.rolEnMesa === 'suplente')
  const disponibles = jugadoresPresentes.filter(j => j.rolEnMesa === null)

  return (
    <View>
      <TouchableOpacity style={s.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={s.volverTexto}>← VOLVER A ASISTENCIA</Text>
      </TouchableOpacity>

      {/* Contadores */}
      <View style={s.conteoRow}>
        <ConteoBar conteo={conteoMesa} />
      </View>

      <View style={s.divider} />

      {jugadoresPresentes.length === 0 && (
        <Text style={[s.emptyTexto, { marginHorizontal: 20, marginTop: 16 }]}>
          No hay jugadores presentes.
        </Text>
      )}

      {/* ── Titulares ── */}
      {titulares.length > 0 && (
        <>
          <Text style={[s.seccionLabel, { marginHorizontal: 20, marginTop: 20, marginBottom: 8 }]}>
            TITULARES
          </Text>
          {titulares.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={s.separator} />}
              <View style={{ paddingHorizontal: 20 }}>
                <FilaMesa
                  jugador={j}
                  onAsignar={onAsignar}
                  titularLleno={titularLleno}
                  suplenteLleno={suplenteLleno}
                />
              </View>
            </View>
          ))}
        </>
      )}

      {/* ── Suplentes ── */}
      {suplentes.length > 0 && (
        <>
          <Text style={[s.seccionLabel, { marginHorizontal: 20, marginTop: 20, marginBottom: 8 }]}>
            SUPLENTES
          </Text>
          {suplentes.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={s.separator} />}
              <View style={{ paddingHorizontal: 20 }}>
                <FilaMesa
                  jugador={j}
                  onAsignar={onAsignar}
                  titularLleno={titularLleno}
                  suplenteLleno={suplenteLleno}
                />
              </View>
            </View>
          ))}
        </>
      )}

      {/* ── Disponibles ── */}
      {disponibles.length > 0 && (
        <>
          <Text style={[s.seccionLabel, { marginHorizontal: 20, marginTop: 20, marginBottom: 8 }]}>
            DISPONIBLES
          </Text>
          {disponibles.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={s.separator} />}
              <View style={{ paddingHorizontal: 20 }}>
                <FilaMesa
                  jugador={j}
                  onAsignar={onAsignar}
                  titularLleno={titularLleno}
                  suplenteLleno={suplenteLleno}
                />
              </View>
            </View>
          ))}
        </>
      )}

      <View style={[s.bloque, { marginTop: 20 }]}>
        {errorMesa && (
          <View style={s.bannerError}>
            <Text style={s.bannerErrorTexto}>{errorMesa}</Text>
          </View>
        )}
        {mesaGuardada && !guardandoMesa && (
          <Text style={s.bannerOkTexto}>✓ Mesa guardada</Text>
        )}
        <TouchableOpacity
          style={[s.botonGuardarMesa, guardandoMesa && { opacity: 0.6 }]}
          onPress={onGuardar}
          disabled={guardandoMesa}
          activeOpacity={0.85}
        >
          {guardandoMesa
            ? <ActivityIndicator color={colors.oro} size="small" />
            : <Text style={s.botonPrimarioTexto}>GUARDAR MESA</Text>}
        </TouchableOpacity>

        {mesaGuardada && !esInfantil && (
          <TouchableOpacity
            style={s.botonSecundario}
            onPress={onIrAResultado}
            activeOpacity={0.85}
          >
            <Text style={s.botonSecundarioTexto}>IR AL RESULTADO →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// ─── Paso 4 — Resultado ───────────────────────────────────────────────────────

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
  const { colors: tc } = useTheme()
  return (
    <View>
      <TouchableOpacity style={s.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={s.volverTexto}>← VOLVER A MESA</Text>
      </TouchableOpacity>

      <View style={s.bloque}>
        <View style={s.resultadoRow}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={s.seccionLabel}>NOSOTROS</Text>
            <TextInput
              style={[s.inputNumero, { color: tc.tinta, backgroundColor: tc.fondo, borderColor: tc.tinta }]}
              value={puntosPropios}
              onChangeText={onChangePropios}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#C5BEA8"
              maxLength={3}
            />
          </View>
          <Text style={s.vsTexto}>vs</Text>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={[s.seccionLabel, { textAlign: 'right' }]}>RIVAL</Text>
            <TextInput
              style={[s.inputNumero, { textAlign: 'right', color: tc.tinta, backgroundColor: tc.fondo, borderColor: tc.tinta }]}
              value={puntosRival}
              onChangeText={onChangeRival}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#C5BEA8"
              maxLength={3}
            />
          </View>
        </View>

        <View style={{ gap: 8, marginTop: 16 }}>
          <Text style={s.seccionLabel}>NOMBRE DEL RIVAL</Text>
          <TextInput
            style={[s.inputTexto, { color: tc.tinta, backgroundColor: tc.fondo, borderColor: tc.tinta }]}
            value={rivalNombre}
            onChangeText={onChangeRivalNombre}
            placeholder="Nombre del rival"
            placeholderTextColor="#A89E8C"
          />
        </View>

        {errorResultado && (
          <View style={s.bannerError}>
            <Text style={s.bannerErrorTexto}>{errorResultado}</Text>
          </View>
        )}
        {resultadoGuardado && !guardandoResultado && (
          <Text style={s.bannerOkTexto}>✓ Resultado guardado</Text>
        )}

        <TouchableOpacity
          style={[s.botonPrimario, { marginTop: 8 }, guardandoResultado && { opacity: 0.6 }]}
          onPress={onGuardar}
          disabled={guardandoResultado}
          activeOpacity={0.85}
        >
          {guardandoResultado
            ? <ActivityIndicator color={colors.oro} size="small" />
            : <Text style={s.botonPrimarioTexto}>
                {resultadoGuardado ? 'ACTUALIZAR RESULTADO' : 'GUARDAR RESULTADO'}
              </Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Screen principal ─────────────────────────────────────────────────────────

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

  const { colors: tc } = useTheme()
  const pasoTitulo: Record<typeof paso, string> = {
    equipo:     'Equipo · Partido',
    asistencia: equipoSeleccionado ? `Asistencia · ${equipoSeleccionado.nombre}` : 'Asistencia',
    mesa:       equipoSeleccionado ? `Mesa · ${equipoSeleccionado.nombre}` : 'Mesa de partido',
    resultado:  'Resultado',
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.centrado, { backgroundColor: tc.fondo }]}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={[s.centrado, { backgroundColor: tc.fondo }]}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  const jugadoresPresentes = jugadores.filter(j => j.presente)

  return (
    <SafeAreaView style={[s.root, { backgroundColor: tc.fondo }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.bloque}>SECCIÓN · CANCHA</Text>
        <Text style={[s.titulo, { color: tc.tinta }]}>{pasoTitulo[paso]}</Text>
        <Text style={s.headerMeta}>{divisionNombre.toUpperCase()}</Text>
      </View>
      <View style={[s.divider, { backgroundColor: tc.grisClaro }]} />

      {/* ── Contenido por paso ─────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.papel },
  centrado:{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.papel, gap: 8 },
  mutedTexto: { fontFamily: fonts.titulo, fontSize: 16, color: '#9A9080', textAlign: 'center' },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  seccion: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.oro,
    marginBottom: 6,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 26,
    color: colors.tinta,
    lineHeight: 32,
  },
  headerMeta: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#7A7060',
    marginTop: 4,
  },
  divider: { height: 1, backgroundColor: '#D4CCBA', marginHorizontal: 20 },

  // Sections inside steps
  bloque: { paddingHorizontal: 20, marginTop: 16, gap: 10 },
  seccionLabel: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.oro,
  },
  seccionDivider: { height: 1, backgroundColor: '#D4CCBA', marginHorizontal: 20, marginVertical: 16 },

  // Cards (paso 1)
  card: {
    borderWidth: 1,
    borderColor: colors.tinta,
    borderRadius: 2,
    padding: 14,
    backgroundColor: colors.papel,
  },
  cardActivo: { borderColor: colors.oro, borderWidth: 2 },
  cardRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardInfo:   { flex: 1 },
  cardTitle:  { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.tinta },
  cardSub:    { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5, color: '#7A7060', marginTop: 3 },
  checkOro:   { fontFamily: fonts.label, fontSize: 14, color: colors.oro },

  emptyTexto:    { fontFamily: fonts.titulo, fontSize: 14, color: '#9A9080', fontStyle: 'italic' },
  emptySubtexto: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5, color: '#9A9080', marginTop: 4 },

  // Equipo badges
  equipoBadge: { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  equipoBadgeOblig: { backgroundColor: colors.tinta },
  equipoBadgeOpc:   { borderWidth: 1, borderColor: colors.oro, backgroundColor: 'transparent' },
  equipoBadgeTexto: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },

  // Fila asistencia
  fila:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  numero:  { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: '#A89E8C', width: 28 },
  nombre:  { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.tinta, flex: 1, marginRight: 10 },
  separator: { height: 1, backgroundColor: '#E0D9C8', marginHorizontal: 20 },

  // Badges asistencia
  badgesRow:   { flexDirection: 'row', gap: 5 },
  badge:       { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 2, borderWidth: 1 },
  badgeInactivo: { borderColor: '#C5BEA8', backgroundColor: 'transparent' },
  badgePres:   { backgroundColor: VERDE, borderColor: VERDE },
  badgeAus:    { backgroundColor: ROJO, borderColor: ROJO },
  badgeTexto:  { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },

  // Contadores (asistencia)
  contadores:   { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  contadorBox:  { flex: 1, borderWidth: 1.5, borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  contadorNum:  { fontFamily: fonts.titulo, fontSize: 28, lineHeight: 34 },
  contadorLabel:{ fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: '#8A8070', marginTop: 2 },

  // Conteo mesa
  conteoRow:  { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  conteoBox:  { flex: 1, borderWidth: 1.5, borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  conteoNum:  { fontFamily: fonts.titulo, fontSize: 24, lineHeight: 30 },
  conteoLabel:{ fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: '#8A8070', marginTop: 2 },

  // Fila mesa — asignada (dark)
  mesaCardDark: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tinta,
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  mesaNombreDark: {
    flex: 1,
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.oro,
  },
  mesaQuitarTexto: {
    fontFamily: fonts.label,
    fontSize: 14,
    color: colors.oroHondo,
  },

  // Fila mesa — disponible (light)
  mesaCardLight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.papel,
    borderWidth: 1,
    borderColor: '#C5BEA8',
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mesaNombreLight: {
    flex: 1,
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.tinta,
    marginRight: 10,
  },
  mesaBotones:   { flexDirection: 'row', gap: 6 },
  mesaRolBtn:    {
    width: 34,
    height: 34,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.tinta,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mesaRolBtnOff: { borderColor: '#C5BEA8', opacity: 0.4 },
  mesaRolBtnTxt: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.tinta },

  // Botones
  botonPrimario: {
    backgroundColor: colors.tinta,
    paddingVertical: 16,
    borderRadius: 2,
    alignItems: 'center',
  },
  botonPrimarioTexto: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2.5,
    color: colors.oro,
  },
  botonGuardarMesa: {
    backgroundColor: colors.tinta,
    paddingVertical: 18,
    borderRadius: 2,
    alignItems: 'center',
  },
  botonSecundario: {
    borderWidth: 1,
    borderColor: colors.oro,
    paddingVertical: 14,
    borderRadius: 2,
    alignItems: 'center',
    marginTop: 8,
  },
  botonSecundarioTexto: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.oro,
  },

  volverBtn:   { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  volverTexto: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.oroHondo },

  // Banners
  bannerError: {
    borderLeftWidth: 3,
    borderLeftColor: ROJO,
    backgroundColor: '#FEF2F2',
    borderRadius: 2,
    padding: 12,
    marginBottom: 8,
  },
  bannerErrorTexto: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5, color: '#991B1B' },
  bannerOkTexto:    { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, color: VERDE, marginBottom: 8 },

  // Resultado
  resultadoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vsTexto: {
    fontFamily: fonts.titulo,
    fontSize: 24,
    color: '#9A9080',
    alignSelf: 'flex-end',
    paddingBottom: 12,
  },
  inputNumero: {
    borderWidth: 1.5,
    borderColor: colors.tinta,
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 8,
    fontFamily: fonts.titulo,
    fontSize: 40,
    color: colors.tinta,
    textAlign: 'center',
    backgroundColor: colors.papel,
  },
  inputTexto: {
    borderWidth: 1.5,
    borderColor: colors.tinta,
    borderRadius: 2,
    padding: 14,
    fontFamily: fonts.cuerpo,
    fontSize: 15,
    color: colors.tinta,
    backgroundColor: colors.papel,
  },
})
