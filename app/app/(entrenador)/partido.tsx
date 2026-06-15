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

// ─── Tokens ───────────────────────────────────────────────────────────────────

const FONDO     = '#15110A'
const CARD      = '#1C1710'
const TEXTO     = '#F3EFE4'
const MUTED     = '#8E8574'
const DIVIDER   = '#2C2418'
const VERDE     = '#4A7C59'
const ROJO      = colors.rojoUrgente

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
      <View style={s.conteoBox}>
        <Text style={[s.conteoNum, conteo.titular > 15 ? s.conteoNumRojo : s.conteoNumOro]}>
          {conteo.titular}/15
        </Text>
        <Text style={s.conteoLabel}>TITULARES</Text>
      </View>
      <View style={s.conteoBox}>
        <Text style={[s.conteoNum, conteo.suplente > 8 ? s.conteoNumRojo : s.conteoNumOro]}>
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
          <Text style={[s.badgeTexto, jugador.presente ? s.badgeTextoPres : s.badgeTextoInactivo]}>
            PRES
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.badge, !jugador.presente ? s.badgeAus : s.badgeInactivo]}
          onPress={() => { if (jugador.presente) onToggle(jugador.id) }}
          activeOpacity={0.75}
        >
          <Text style={[s.badgeTexto, !jugador.presente ? s.badgeTextoAus : s.badgeTextoInactivo]}>
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
          <Text style={[s.mesaRolBtnTxt, titularLleno && s.mesaRolBtnTxtOff]}>T</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.mesaRolBtn, suplenteLleno && s.mesaRolBtnOff]}
          onPress={() => onAsignar(jugador.id, 'suplente')}
          disabled={suplenteLleno}
          activeOpacity={0.75}
        >
          <Text style={[s.mesaRolBtnTxt, suplenteLleno && s.mesaRolBtnTxtOff]}>S</Text>
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
  if (partidos.length === 0) {
    return (
      <View style={s.emptyGap}>
        <Text style={s.emptyTexto}>Sin partidos programados en los próximos 14 días.</Text>
        <Text style={s.emptySubtexto}>El Coordinador debe cargarlos en el calendario.</Text>
      </View>
    )
  }
  return (
    <View style={s.gap8}>
      {partidos.map(p => {
        const activo = seleccionado?.id === p.id
        return (
          <TouchableOpacity
            key={p.id}
            style={[s.card, activo && s.cardActivo]}
            onPress={() => onSelect(p)}
            activeOpacity={0.8}
          >
            <View style={s.cardRow}>
              <View style={s.cardInfo}>
                <Text style={[s.cardTitle, activo && s.cardTitleActivo]}>
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
    <View style={s.gap8}>
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
              <Text style={[s.cardTitle, s.cardTitleFlex, activo && s.cardTitleActivo]}>
                {e.nombre}
              </Text>
              <View style={[s.equipoBadge, esObligatorio ? s.equipoBadgeOblig : s.equipoBadgeOpc]}>
                <Text style={[s.equipoBadgeTexto, esObligatorio ? s.equipoBadgeTextoOblig : s.equipoBadgeTextoOpc]}>
                  {esObligatorio ? 'OBLIGATORIO' : 'OPCIONAL'}
                </Text>
              </View>
              {activo && <Text style={[s.checkOro, s.checkOroMl]}>✓</Text>}
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
    <View style={s.pasoWrap}>
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

      <View style={s.bloqueMt}>
        <TouchableOpacity
          style={[s.botonPrimario, (!puedeAvanzar || cargandoTransicion) && s.botonOff]}
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
  const presentes  = jugadores.filter(j => j.presente).length
  const ausentes   = jugadores.length - presentes
  const puedeGuardar = esInfantil || presentes > 0

  return (
    <View>
      <TouchableOpacity style={s.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={s.volverTexto}>← VOLVER</Text>
      </TouchableOpacity>

      <View style={s.contadores}>
        <View style={[s.contadorBox, s.contadorBoxVerde]}>
          <Text style={[s.contadorNum, s.contadorNumVerde]}>{presentes}</Text>
          <Text style={s.contadorLabel}>PRESENTES</Text>
        </View>
        <View style={[s.contadorBox, s.contadorBoxRojo]}>
          <Text style={[s.contadorNum, s.contadorNumRojo]}>{ausentes}</Text>
          <Text style={s.contadorLabel}>AUSENTES</Text>
        </View>
      </View>

      <View style={s.divider} />

      {jugadores.map((j, i) => (
        <View key={j.id}>
          {i > 0 && <View style={s.separator} />}
          <FilaAsistencia jugador={j} index={i} onToggle={onToggle} />
        </View>
      ))}

      <View style={s.bloqueMt2}>
        {errorAsistencia && (
          <View style={s.bannerError}>
            <Text style={s.bannerErrorTexto}>{errorAsistencia}</Text>
          </View>
        )}
        {asistenciaGuardada && !guardandoAsistencia && esInfantil && (
          <Text style={s.bannerOkTexto}>✓ Asistencia guardada</Text>
        )}
        <TouchableOpacity
          style={[s.botonPrimario, (!puedeGuardar || guardandoAsistencia) && s.botonOff]}
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

      <View style={s.conteoRow}>
        <ConteoBar conteo={conteoMesa} />
      </View>

      <View style={s.divider} />

      {jugadoresPresentes.length === 0 && (
        <Text style={s.emptyTextoMx}>
          No hay jugadores presentes.
        </Text>
      )}

      {titulares.length > 0 && (
        <>
          <Text style={s.seccionLabelMx}>TITULARES</Text>
          {titulares.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={s.separator} />}
              <View style={s.mesaPadding}>
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

      {suplentes.length > 0 && (
        <>
          <Text style={s.seccionLabelMx}>SUPLENTES</Text>
          {suplentes.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={s.separator} />}
              <View style={s.mesaPadding}>
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

      {disponibles.length > 0 && (
        <>
          <Text style={s.seccionLabelMx}>DISPONIBLES</Text>
          {disponibles.map((j, i) => (
            <View key={j.id}>
              {i > 0 && <View style={s.separator} />}
              <View style={s.mesaPadding}>
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

      <View style={s.bloqueMt3}>
        {errorMesa && (
          <View style={s.bannerError}>
            <Text style={s.bannerErrorTexto}>{errorMesa}</Text>
          </View>
        )}
        {mesaGuardada && !guardandoMesa && (
          <Text style={s.bannerOkTexto}>✓ Mesa guardada</Text>
        )}
        <TouchableOpacity
          style={[s.botonGuardarMesa, guardandoMesa && s.botonOff]}
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
  return (
    <View>
      <TouchableOpacity style={s.volverBtn} onPress={onVolver} activeOpacity={0.7}>
        <Text style={s.volverTexto}>← VOLVER A MESA</Text>
      </TouchableOpacity>

      <View style={s.bloque}>
        <View style={s.resultadoRow}>
          <View style={s.resultadoCol}>
            <Text style={s.seccionLabel}>NOSOTROS</Text>
            <TextInput
              style={s.inputNumero}
              value={puntosPropios}
              onChangeText={onChangePropios}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={MUTED}
              maxLength={3}
            />
          </View>
          <Text style={s.vsTexto}>vs</Text>
          <View style={s.resultadoColRight}>
            <Text style={s.seccionLabelRight}>RIVAL</Text>
            <TextInput
              style={[s.inputNumero, s.inputNumeroRight]}
              value={puntosRival}
              onChangeText={onChangeRival}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={MUTED}
              maxLength={3}
            />
          </View>
        </View>

        <View style={s.rivalRow}>
          <Text style={s.seccionLabel}>NOMBRE DEL RIVAL</Text>
          <TextInput
            style={s.inputTexto}
            value={rivalNombre}
            onChangeText={onChangeRivalNombre}
            placeholder="Nombre del rival"
            placeholderTextColor={MUTED}
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
          style={[s.botonPrimarioMt, guardandoResultado && s.botonOff]}
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

  const pasoTitulo: Record<typeof paso, string> = {
    equipo:     'Equipo · Partido',
    asistencia: equipoSeleccionado ? `Asistencia · ${equipoSeleccionado.nombre}` : 'Asistencia',
    mesa:       equipoSeleccionado ? `Mesa · ${equipoSeleccionado.nombre}` : 'Mesa de partido',
    resultado:  'Resultado',
  }

  if (loading) {
    return (
      <SafeAreaView style={s.centrado}>
        <ActivityIndicator color={colors.oro} size="large" />
      </SafeAreaView>
    )
  }

  if (sinDivision) {
    return (
      <SafeAreaView style={s.centrado}>
        <Text style={s.mutedTexto}>Sin división asignada.</Text>
        <Text style={s.mutedTexto}>Contactá a la Subcomisión.</Text>
      </SafeAreaView>
    )
  }

  const jugadoresPresentes = jugadores.filter(j => j.presente)

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.seccion}>SECCIÓN · CANCHA</Text>
        <Text style={s.titulo}>{pasoTitulo[paso]}</Text>
        <Text style={s.headerMeta}>{divisionNombre.toUpperCase()}</Text>
      </View>
      <View style={s.divider} />

      <ScrollView contentContainerStyle={s.scrollContent}>
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
  root:        { flex: 1, backgroundColor: FONDO },
  centrado:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: FONDO, gap: 8 },
  mutedTexto:  { fontFamily: fonts.titulo, fontSize: 16, color: MUTED, textAlign: 'center' },
  scrollContent: { paddingBottom: 40 },

  // Header
  header:    { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  seccion:   { fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, color: colors.oro, marginBottom: 6 },
  titulo:    { fontFamily: fonts.titulo, fontSize: 26, color: TEXTO, lineHeight: 32 },
  headerMeta:{ fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5, color: MUTED, marginTop: 4 },
  divider:   { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },
  separator: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20 },

  // Sections
  bloque:      { paddingHorizontal: 20, marginTop: 16, gap: 10 },
  bloqueMt:    { paddingHorizontal: 20, marginTop: 8, gap: 10 },
  bloqueMt2:   { paddingHorizontal: 20, marginTop: 16, gap: 10 },
  bloqueMt3:   { paddingHorizontal: 20, marginTop: 20, gap: 10 },
  pasoWrap:    { paddingBottom: 16 },
  gap8:        { gap: 8 },
  emptyGap:    { gap: 4 },

  seccionLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, color: colors.oro },
  seccionLabelMx: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, color: colors.oro,
    marginHorizontal: 20, marginTop: 20, marginBottom: 8,
  },
  seccionDivider: { height: 1, backgroundColor: DIVIDER, marginHorizontal: 20, marginVertical: 16 },

  // Cards (paso 1)
  card:            { borderWidth: 1, borderColor: DIVIDER, borderRadius: 2, padding: 14, backgroundColor: CARD },
  cardActivo:      { borderColor: colors.oro, borderWidth: 2 },
  cardRow:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardInfo:        { flex: 1 },
  cardTitle:       { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO },
  cardTitleActivo: { color: colors.oro },
  cardTitleFlex:   { flex: 1 },
  cardSub:         { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5, color: MUTED, marginTop: 3 },
  checkOro:        { fontFamily: fonts.label, fontSize: 14, color: colors.oro },
  checkOroMl:      { marginLeft: 8 },

  emptyTexto:    { fontFamily: fonts.titulo, fontSize: 14, color: MUTED, fontStyle: 'italic' },
  emptyTextoMx:  { fontFamily: fonts.titulo, fontSize: 14, color: MUTED, fontStyle: 'italic', marginHorizontal: 20, marginTop: 16 },
  emptySubtexto: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5, color: MUTED, marginTop: 4 },

  // Equipo badges
  equipoBadge:          { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  equipoBadgeOblig:     { backgroundColor: TEXTO },
  equipoBadgeOpc:       { borderWidth: 1, borderColor: colors.oro, backgroundColor: 'transparent' },
  equipoBadgeTexto:     { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
  equipoBadgeTextoOblig:{ color: FONDO },
  equipoBadgeTextoOpc:  { color: colors.oroHondo },

  // Fila asistencia
  fila:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  numero:     { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: MUTED, width: 28 },
  nombre:     { fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO, flex: 1, marginRight: 10 },
  mesaPadding:{ paddingHorizontal: 20 },

  // Badges asistencia
  badgesRow:          { flexDirection: 'row', gap: 5 },
  badge:              { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 2, borderWidth: 1 },
  badgeInactivo:      { borderColor: DIVIDER, backgroundColor: 'transparent' },
  badgePres:          { backgroundColor: VERDE, borderColor: VERDE },
  badgeAus:           { backgroundColor: ROJO, borderColor: ROJO },
  badgeTexto:         { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
  badgeTextoPres:     { color: '#fff' },
  badgeTextoAus:      { color: '#fff' },
  badgeTextoInactivo: { color: MUTED },

  // Contadores (asistencia)
  contadores:       { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  contadorBox:      { flex: 1, borderWidth: 1.5, borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  contadorBoxVerde: { borderColor: VERDE },
  contadorBoxRojo:  { borderColor: ROJO },
  contadorNum:      { fontFamily: fonts.titulo, fontSize: 28, lineHeight: 34 },
  contadorNumVerde: { color: VERDE },
  contadorNumRojo:  { color: ROJO },
  contadorLabel:    { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: MUTED, marginTop: 2 },

  // Conteo mesa
  conteoRow:    { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  conteoBox:    { flex: 1, borderWidth: 1.5, borderColor: colors.oro, borderRadius: 2, paddingVertical: 12, alignItems: 'center' },
  conteoNum:    { fontFamily: fonts.titulo, fontSize: 24, lineHeight: 30 },
  conteoNumOro: { color: colors.oro },
  conteoNumRojo:{ color: ROJO },
  conteoLabel:  { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: MUTED, marginTop: 2 },

  // Fila mesa — asignada (dark)
  mesaCardDark: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: TEXTO, borderRadius: 2,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  mesaNombreDark: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 15, color: colors.oro },
  mesaQuitarTexto:{ fontFamily: fonts.label, fontSize: 14, color: colors.oroHondo },

  // Fila mesa — disponible
  mesaCardLight: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD, borderWidth: 1, borderColor: DIVIDER,
    borderRadius: 2, paddingHorizontal: 14, paddingVertical: 12,
  },
  mesaNombreLight: { flex: 1, fontFamily: fonts.cuerpo, fontSize: 15, color: TEXTO, marginRight: 10 },
  mesaBotones:     { flexDirection: 'row', gap: 6 },
  mesaRolBtn:      { width: 34, height: 34, borderRadius: 2, borderWidth: 1, borderColor: TEXTO, justifyContent: 'center', alignItems: 'center' },
  mesaRolBtnOff:   { borderColor: DIVIDER, opacity: 0.4 },
  mesaRolBtnTxt:   { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: TEXTO },
  mesaRolBtnTxtOff:{ color: MUTED },

  // Botones
  botonPrimario:      { backgroundColor: TEXTO, paddingVertical: 16, borderRadius: 2, alignItems: 'center' },
  botonPrimarioMt:    { backgroundColor: TEXTO, paddingVertical: 16, borderRadius: 2, alignItems: 'center', marginTop: 8 },
  botonPrimarioTexto: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2.5, color: colors.oro },
  botonGuardarMesa:   { backgroundColor: TEXTO, paddingVertical: 18, borderRadius: 2, alignItems: 'center' },
  botonSecundario:    { borderWidth: 1, borderColor: colors.oro, paddingVertical: 14, borderRadius: 2, alignItems: 'center', marginTop: 8 },
  botonSecundarioTexto:{ fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, color: colors.oro },
  botonOff:           { opacity: 0.4 },

  volverBtn:  { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  volverTexto:{ fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, color: colors.oroHondo },

  // Banners
  bannerError:      { borderLeftWidth: 3, borderLeftColor: ROJO, backgroundColor: '#2A1010', borderRadius: 2, padding: 12, marginBottom: 8 },
  bannerErrorTexto: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5, color: '#FFAAAA' },
  bannerOkTexto:    { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, color: VERDE, marginBottom: 8 },

  // Resultado
  resultadoRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultadoCol:   { flex: 1, gap: 8 },
  resultadoColRight: { flex: 1, gap: 8 },
  rivalRow:       { gap: 8, marginTop: 16 },
  seccionLabelRight: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 3, color: colors.oro, textAlign: 'right' },
  vsTexto: {
    fontFamily: fonts.titulo, fontSize: 24, color: MUTED,
    alignSelf: 'flex-end', paddingBottom: 12,
  },
  inputNumero: {
    borderWidth: 1.5, borderColor: TEXTO, borderRadius: 2,
    paddingVertical: 14, paddingHorizontal: 8,
    fontFamily: fonts.titulo, fontSize: 40, color: TEXTO,
    textAlign: 'center', backgroundColor: CARD,
  },
  inputNumeroRight: { textAlign: 'right' },
  inputTexto: {
    borderWidth: 1.5, borderColor: TEXTO, borderRadius: 2,
    padding: 14, fontFamily: fonts.cuerpo, fontSize: 15,
    color: TEXTO, backgroundColor: CARD,
  },
})
