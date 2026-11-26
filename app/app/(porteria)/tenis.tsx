import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, TextInput, ScrollView, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform, Modal, Linking, StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { parsearQR } from '@/lib/qrCarnet'
import { ErrorCarga } from '@/components/shared/ErrorCarga'
import { GrillaCanchas } from '@/components/tenis/GrillaCanchas'
import { DetalleItem } from '@/components/tenis/DetalleItem'
import { Aviso, BarraModal, Boton, Chip, Leyenda, Titulo, estilosTenis } from '@/components/tenis/ui'
import { ComprobantesPendientes } from '@/components/tenis/ComprobantesPendientes'
import { accionesTenis, checkinTenis, useTenisGrilla, type Checkin } from '@/hooks/useTenisGestor'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { FEATURES } from '@/constants/features'
import { colors, fonts } from '@/constants/theme'
import { normalizarDni } from '@/lib/entradaDni'
import { formatMonto } from '@/lib/formatoMonto'
import {
  CONFIG_DEFECTO, RESULTADO_CHECKIN, fechaArgentina, horaArgentina, inicioReal, montoCargo, resultadoCheckin,
  type Cancha, type ItemGrilla,
} from '@/lib/tenis'
import { canchasLibresExtension, etiquetasSaldo, jugadorTrasCobro, type EtiquetaSaldo } from '@/lib/tenisReserva'

// Pestaña "Tenis" del Canchero (FEATURES.tenis): consulta por DNI (o por el QR
// del carnet, que trae el número de socio) si la
// persona tiene reserva ahora (de 15 min antes al final del turno), si pagó y
// si está suspendida; al dar ok queda registrado el ingreso. Debajo, la grilla
// de hoy: tocar una reserva permite marcar cobros, corregir jugadores o
// registrar una extensión. La tarjeta muestra lo que debe cada uno (turno,
// diferencias, no-show) y permite extender en cualquier cancha libre; los
// comprobantes y ajustes de cobro se revisan desde acá también.

// Colores del resultado (mismos que el escáner): blanco/#1A7A1A 5.46 ·
// #15110A/#E67E22 6.60 · blanco/#CC4127 4.82.
const NIVEL = {
  ok:    { bg: colors.exito,           fg: colors.blanco },
  aviso: { bg: colors.estadoPendiente, fg: colors.sobreOro },
  error: { bg: colors.rojoUrgente,     fg: colors.blanco },
} as const

// Lector del QR del carnet ("<numero_socio>:<código>", lib/qrCarnet), cámara
// trasera (el canchero atiende). Sólo se usa el número de socio: el código TOTP
// no se valida acá (lo valida socios-qr en la puerta, que además lo consume y
// registra otro acceso). El canchero ve el nombre de la persona en la tarjeta.
function EscanerCarnet({ onNumero, onCerrar }: { onNumero: (numero: string) => void; onCerrar: () => void }) {
  const [permiso, pedirPermiso] = useCameraPermissions()
  const [error, setError] = useState<string | null>(null)
  // La cámara dispara varias veces por el mismo QR antes de cerrar el modal.
  const leido = useRef(false)

  function leer(data: string) {
    if (leido.current) return
    const qr = parsearQR(data)
    if (!qr) { setError('Ese QR no es un carnet del club.'); return }
    leido.current = true
    onNumero(qr.numero_socio)
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo="ESCANEAR CARNET" onCerrar={onCerrar} />
        {!permiso ? (
          <ActivityIndicator color={colors.oro} style={s.cargando} />
        ) : !permiso.granted ? (
          <View style={estilosTenis.sheetCuerpo}>
            <Text style={estilosTenis.textoCard}>
              {permiso.canAskAgain
                ? 'Para escanear carnets hace falta acceso a la cámara.'
                : 'Denegaste el acceso a la cámara. Activalo desde Ajustes del sistema.'}
            </Text>
            <Boton
              texto={permiso.canAskAgain ? 'PERMITIR ACCESO' : 'ABRIR AJUSTES'}
              onPress={permiso.canAskAgain ? () => { void pedirPermiso() } : () => { void Linking.openSettings() }}
            />
          </View>
        ) : (
          <View style={s.camara}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => leer(data)}
            />
            {error && <View style={s.errorCamara}><Aviso tipo="error">{error}</Aviso></View>}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const TONO_SALDO: Record<EtiquetaSaldo['tono'], { color: string }> = {
  debe:  { color: colors.rojoTexto },
  favor: { color: colors.confirmacion },
  info:  { color: colors.muted },
}

type ReservaCheckin = NonNullable<Checkin['reserva']>

function TarjetaCheckin({ c, onCobrado, onExtender }: {
  c: Checkin; onCobrado: () => void; onExtender: (r: ReservaCheckin) => void
}) {
  const res = resultadoCheckin(c.resultado)
  const ui = RESULTADO_CHECKIN[res]
  const color = NIVEL[ui.nivel]
  const [cobrando, setCobrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // El saldo se actualiza acá al cobrar: volver a consultar registraría otro ingreso.
  const [jugador, setJugador] = useState(c.jugador)
  const cobrado = jugador?.cobrado ?? false

  // Cobra el turno entero o, si ya estaba cobrado con diferencia, la salda.
  async function cobrar() {
    if (!jugador?.id) return
    setCobrando(true)
    const r = await accionesTenis.cobroMarcar(jugador.id, true)
    setCobrando(false)
    if (!r.ok) { setError(r.mensaje); return }
    setJugador(j => j && jugadorTrasCobro(j))
    onCobrado()
  }

  const saldo = jugador ? etiquetasSaldo(jugador) : []
  const puedeExtender = !!c.reserva && (res === 'ok' || res === 'comprobante_pendiente')

  return (
    <View style={s.tarjeta} accessibilityLiveRegion="polite">
      <View style={[s.banda, { backgroundColor: color.bg }]} accessibilityRole="alert">
        <Text style={[s.bandaTexto, { color: color.fg }]}>{ui.titulo}</Text>
      </View>
      <View style={s.tarjetaCuerpo}>
        {c.persona && (
          <>
            <Text style={s.nombre}>{c.persona.nombre}</Text>
            <Text style={estilosTenis.mutedCard}>
              {c.persona.tipo === 'invitado' ? 'Invitado (no socio)' : 'Socio'}
              {c.persona.semaforo ? ` · Cuota: ${c.persona.semaforo}` : ''}
            </Text>
          </>
        )}
        {c.suspendido && <Text style={s.alerta}>Está suspendido: no puede jugar.</Text>}
        {c.reserva && (
          <Text style={estilosTenis.textoCard}>
            Cancha {c.reserva.cancha} · {inicioReal(c.reserva.inicio)} a {horaArgentina(c.reserva.fin)} · {c.reserva.modalidad === 'dobles' ? 'Dobles' : 'Singles'}
          </Text>
        )}
        {jugador && (
          <Text style={estilosTenis.textoCard}>
            {jugador.cargo === 0 ? 'Sin cargo' : `Turno ${montoCargo(jugador.cargo)}`}
            {jugador.cargo > 0 ? (cobrado ? ' · COBRADO' : ' · PENDIENTE') : ''}
            {cobrado && jugador.monto_cobrado !== null && jugador.monto_cobrado !== jugador.cargo ? ` (pagó ${formatMonto(jugador.monto_cobrado)})` : ''}
          </Text>
        )}
        {saldo.map(e => (
          <Text key={e.texto} style={[s.saldo, TONO_SALDO[e.tono]]}>{e.texto}</Text>
        ))}
        {res === 'comprobante_pendiente' && (
          <Aviso>El comprobante de pago todavía no fue revisado. Revisalo o cobrale en el momento.</Aviso>
        )}
        {jugador && jugador.cargo > 0 && !cobrado && !!jugador.id && (
          <Boton texto="MARCAR COBRADO" onPress={cobrar} cargando={cobrando} />
        )}
        {jugador && cobrado && jugador.diferencia !== 0 && !!jugador.id && (
          <Boton
            texto={jugador.diferencia > 0 ? 'COBRÉ LA DIFERENCIA' : 'YA LE DEVOLVÍ LA DIFERENCIA'}
            onPress={cobrar}
            cargando={cobrando}
          />
        )}
        {puedeExtender && c.reserva && (
          <Boton texto="REGISTRAR EXTENSIÓN" variante="secundario" onPress={() => onExtender(c.reserva as ReservaCheckin)} />
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </View>
    </View>
  )
}

// Extensión: siguen jugando después del turno, en la misma cancha o en
// cualquier otra libre para esa media hora / hora (como en OnDepor). Las
// canchas libres salen de la grilla de hoy; el servidor lo vuelve a validar.
function ExtensionCancha({ reserva, canchas, items, onCerrar, onHecho }: {
  reserva:  ReservaCheckin
  canchas:  Cancha[]
  items:    ItemGrilla[]
  onCerrar: () => void
  onHecho:  () => void
}) {
  const [minutos, setMinutos] = useState(30)
  const [canchaId, setCanchaId] = useState<string | null>(reserva.cancha_id)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasta = new Date(Date.parse(reserva.fin) + minutos * 60_000).toISOString()
  const libres = useMemo(() => canchasLibresExtension(items, canchas, reserva.fin, hasta), [items, canchas, reserva.fin, hasta])
  const elegida = libres.find(c => c.id === canchaId) ?? null

  async function confirmar() {
    if (!elegida || enviando) return
    setEnviando(true)
    setError(null)
    const r = await accionesTenis.extension(elegida.id, hasta, reserva.id)
    setEnviando(false)
    if (!r.ok) { setError(r.mensaje); return }
    onHecho()
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCerrar}>
      <SafeAreaView style={estilosTenis.sheet}>
        <BarraModal titulo="EXTENSIÓN" onCerrar={onCerrar} />
        <ScrollView contentContainerStyle={estilosTenis.sheetCuerpo}>
          <Text style={estilosTenis.textoCard}>
            Termina a las {horaArgentina(reserva.fin)} en la cancha {reserva.cancha}. La extensión se cobra como un turno más.
          </Text>
          <Text style={estilosTenis.label}>CUÁNTO MÁS</Text>
          <View style={estilosTenis.fila}>
            <Chip texto="+30 MIN" activo={minutos === 30} onPress={() => setMinutos(30)} />
            <Chip texto="+1 H" activo={minutos === 60} onPress={() => setMinutos(60)} />
          </View>
          <Text style={estilosTenis.label}>CANCHA LIBRE · {horaArgentina(reserva.fin)} A {horaArgentina(hasta)}</Text>
          {libres.length === 0 ? (
            <Text style={estilosTenis.vacio}>No hay canchas libres en ese horario.</Text>
          ) : (
            <View style={estilosTenis.fila}>
              {libres.map(c => (
                <Chip
                  key={c.id}
                  texto={c.id === reserva.cancha_id ? `${c.nombre} (LA MISMA)` : c.nombre}
                  activo={c.id === elegida?.id}
                  onPress={() => setCanchaId(c.id)}
                />
              ))}
            </View>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton
            texto={elegida ? `EXTENDER EN CANCHA ${elegida.nombre}` : 'ELEGÍ UNA CANCHA'}
            onPress={confirmar}
            cargando={enviando}
            disabled={!elegida}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

export default function TenisCancheroScreen() {
  // "Hoy" sale del reloj en cada render: al refrescar, al volver a la pestaña
  // o con el tic de cada minuto pasa solo al día siguiente después de
  // medianoche (y useTenisGrilla carga la grilla del día nuevo).
  const [ahoraMs, setAhoraMs] = useState(() => Date.now())
  const hoy = fechaArgentina(ahoraMs)
  const { grilla, loading, error, refetch } = useTenisGrilla(hoy)

  useEffect(() => {
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Si cambió el día, el cambio de `hoy` ya dispara la carga del día nuevo;
  // si no, se recarga el mismo día.
  function recargar() {
    const ahora = Date.now()
    setAhoraMs(ahora)
    if (fechaArgentina(ahora) === hoy) refetch()
  }
  useRefreshOnFocus(recargar)
  const [dni, setDni] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [checkin, setCheckin] = useState<Checkin | null>(null)
  const [errorCheckin, setErrorCheckin] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<ItemGrilla | null>(null)
  const [escaneando, setEscaneando] = useState(false)
  const [extendiendo, setExtendiendo] = useState<ReservaCheckin | null>(null)
  const [revisando, setRevisando] = useState(false)

  async function consultar(q: { dni: string } | { numeroSocio: string }) {
    setConsultando(true)
    setErrorCheckin(null)
    setCheckin(null)
    const r = await checkinTenis(q)
    setConsultando(false)
    if (!r.ok) { setErrorCheckin(r.mensaje); return }
    setCheckin(r.data)
    setDni('')
    refetch()
  }

  function consultarDni() {
    const d = normalizarDni(dni)
    if (d.length < 6) { setErrorCheckin('Revisá el DNI.'); return }
    void consultar({ dni: d })
  }

  function porQR(numeroSocio: string) {
    setEscaneando(false)
    void consultar({ numeroSocio })
  }

  if (!FEATURES.tenis) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <Text style={estilosTenis.vacio}>Las reservas de tenis todavía no están habilitadas.</Text>
      </SafeAreaView>
    )
  }

  const config = grilla?.config ?? CONFIG_DEFECTO

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.labelHeader}>CANCHERO · TENIS</Text>
        <Text style={s.titulo}>Ingreso a canchas</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.contenido}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={recargar} tintColor={colors.oro} />}
        >
          <Text style={estilosTenis.label}>DNI DEL JUGADOR</Text>
          <View style={s.filaDni}>
            <TextInput
              style={[estilosTenis.input, s.inputDni]}
              value={dni}
              onChangeText={t => setDni(normalizarDni(t))}
              keyboardType="number-pad"
              placeholder="Sin puntos"
              placeholderTextColor={colors.muted}
              accessibilityLabel="DNI del jugador"
              onSubmitEditing={consultarDni}
            />
          </View>
          <Boton texto="CONSULTAR" onPress={consultarDni} cargando={consultando} disabled={dni.length < 6} />
          <Boton texto="ESCANEAR CARNET (QR)" variante="secundario" onPress={() => setEscaneando(true)} disabled={consultando} />
          {errorCheckin && <Aviso tipo="error">{errorCheckin}</Aviso>}
          {checkin && (
            <TarjetaCheckin
              key={JSON.stringify(checkin)}
              c={checkin}
              onCobrado={refetch}
              onExtender={r => (grilla ? setExtendiendo(r) : setErrorCheckin('No se pudo cargar la grilla de hoy. Deslizá para recargar y probá de nuevo.'))}
            />
          )}
          <Boton texto="COMPROBANTES Y AJUSTES DE COBRO" variante="secundario" onPress={() => setRevisando(true)} />

          <Titulo>HOY</Titulo>
          {loading && !grilla ? (
            <ActivityIndicator color={colors.oro} style={s.cargando} />
          ) : error && !grilla ? (
            <ErrorCarga mensaje={error} onReintentar={recargar} />
          ) : grilla ? (
            <>
              <Leyenda />
              <GrillaCanchas
                fecha={hoy}
                config={config}
                horario={grilla.horario}
                canchas={grilla.canchas}
                items={grilla.items}
                ahoraMs={ahoraMs}
                conDetalle
                onPressItem={setDetalle}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {escaneando && <EscanerCarnet onNumero={porQR} onCerrar={() => setEscaneando(false)} />}

      {extendiendo && grilla && (
        <ExtensionCancha
          reserva={extendiendo}
          canchas={grilla.canchas}
          items={grilla.items}
          onCerrar={() => setExtendiendo(null)}
          onHecho={() => { setExtendiendo(null); refetch() }}
        />
      )}

      {revisando && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setRevisando(false); refetch() }}>
          <SafeAreaView style={estilosTenis.sheet}>
            <BarraModal titulo="COMPROBANTES Y AJUSTES" onCerrar={() => { setRevisando(false); refetch() }} />
            <ComprobantesPendientes />
          </SafeAreaView>
        </Modal>
      )}

      {detalle && grilla && (
        <DetalleItem
          item={detalle}
          canchaNombre={detalle.cancha_id ? grilla.canchas.find(c => c.id === detalle.cancha_id)?.nombre ?? '' : 'TODAS'}
          config={config}
          esGestor={false}
          onCerrar={() => setDetalle(null)}
          onCambio={refetch}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.fondo },
  header:        { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borde },
  labelHeader:   { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro, marginBottom: 4 },
  titulo:        { fontFamily: fonts.titulo, fontSize: 28, color: colors.texto },
  contenido:     { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 60 },
  filaDni:       { flexDirection: 'row' },
  inputDni:      { flex: 1, fontSize: 22, fontFamily: fonts.mono },
  cargando:      { marginVertical: 24 },
  tarjeta:       { marginTop: 16, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.borde, backgroundColor: colors.card },
  banda:         { paddingVertical: 14, paddingHorizontal: 16 },
  bandaTexto:    { fontFamily: fonts.label, fontSize: 18, letterSpacing: 1.5 },
  tarjetaCuerpo: { padding: 16, gap: 4 },
  nombre:        { fontFamily: fonts.titulo, fontSize: 22, color: colors.texto },
  alerta:        { fontFamily: fonts.label, fontSize: 15, color: colors.rojoTexto },
  saldo:         { fontFamily: fonts.label, fontSize: 15, letterSpacing: 0.5 },
  camara:        { flex: 1, backgroundColor: colors.fondo },
  errorCamara:   { position: 'absolute', left: 16, right: 16, bottom: 32 },
})
