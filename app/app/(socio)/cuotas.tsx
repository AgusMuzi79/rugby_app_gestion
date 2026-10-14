import {
  View, Text, FlatList, TouchableOpacity, Modal,
  StyleSheet, ActivityIndicator, ScrollView, Linking,
} from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { TutorMenorSelector } from '@/components/shared/TutorMenorSelector'
import { useCuotas, type ComprobanteConEstado, type Cuota, type ServicioActivo } from '@/hooks/useCuotas'
import { comprobanteParaPeriodos } from '@/lib/comprobanteEnviado'
import { useDeudaDetalle, type DeudaDetalle } from '@/hooks/useDeudaDetalle'
import { useSocioObjetivo } from '@/hooks/useSocioObjetivo'
import { colors, fonts } from '@/constants/theme'

// ─── Config club ──────────────────────────────────────────────────────────────
// TODO: mover a tabla config en Supabase cuando se implemente
const ALIAS_CLUB = 'cuenta.uncas.rugby'
// Mismo número que web/app/soporte/page.tsx — Secretaría prefiere recibir los
// comprobantes por WhatsApp (de ahí los carga a NUVIX ella misma) antes que
// tener que revisarlos en el panel web.
const WHATSAPP_SECRETARIA = '5492494522888'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodoLabel(periodo: string): string {
  const [anio, mes] = periodo.split('-')
  const meses = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${meses[Number(mes)]} ${anio}`
}

// Sólo visual — el período que coincide con el mes calendario actual se
// etiqueta "MES EN CURSO" en vez de mostrarse como deuda atrasada más, aunque
// NUVIX ya lo haya marcado como vencido (su fecha de vencimiento puede haber
// pasado hace apenas unos días dentro del mismo mes). No cambia el semáforo
// ni el monto — el socio real sigue contando este período igual que antes,
// esto es puramente de presentación en esta pantalla.
function esMesEnCurso(periodo: string): boolean {
  return periodo === new Date().toISOString().slice(0, 7)
}

function whatsappComprobanteUrl(concepto: string, monto: number): string {
  const mensaje = `Hola! Te mando el comprobante de ${concepto} ($${monto.toLocaleString('es-AR')}).`
  return `https://wa.me/${WHATSAPP_SECRETARIA}?text=${encodeURIComponent(mensaje)}`
}

// Comprobante NO REGISTRADO tras la gracia: mismo número de Secretaría.
function whatsappNoFiguraUrl(c: ComprobanteConEstado): string {
  const que = c.periodos.length > 0
    ? `de ${c.periodos.map(periodoLabel).join(', ')}`
    : 'de mi saldo anterior'
  const mensaje = `Hola! El ${diaMes(c.enviadoAt)} te mandé el comprobante del pago ${que} y todavía no figura en la app.`
  return `https://wa.me/${WHATSAPP_SECRETARIA}?text=${encodeURIComponent(mensaje)}`
}

// dd/mm de una fecha. Las columnas date ('YYYY-MM-DD') se leen por partes:
// new Date('2026-10-10') es medianoche UTC y en Argentina mostraría el 09/10.
function diaMes(fecha: string): string {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}`
  const d = new Date(fecha)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

// La cuota virtual no es "la cuota de este mes": su monto es toda la deuda
// según NUVIX, así que se titula con la fecha de corte de esa importación.
function tituloCuota(cuota: Cuota, fechaCorte: string | null): string {
  if (!cuota.id.startsWith('virtual-')) return periodoLabel(cuota.periodo).toUpperCase()
  return `DEUDA AL ${diaMes(fechaCorte ?? new Date().toISOString())}`
}

function conceptoWhatsapp(cuota: Cuota, fechaCorte: string | null): string {
  if (!cuota.id.startsWith('virtual-')) return `mi cuota de ${periodoLabel(cuota.periodo)}`
  return `mi deuda al ${diaMes(fechaCorte ?? new Date().toISOString())}`
}

interface FilaDesglose { key: string; label: string; monto: number }

// Desglose de la cuota virtual: los períodos que debe según NUVIX (+ saldo
// anterior), que suman exactamente su monto. Si no hay detalle de NUVIX (el
// monto cayó al total mensual), el desglose de categoría + servicios de hoy.
function desgloseVirtual(
  deuda: DeudaDetalle | null,
  categoriaLabel: string,
  montoCategoria: number,
  serviciosActivos: ServicioActivo[],
): FilaDesglose[] {
  if (deuda && (deuda.periodos.length > 0 || deuda.saldoAnterior > 0)) {
    const filas = deuda.periodos.map(p => ({ key: p.periodo, label: periodoLabel(p.periodo), monto: p.vencido }))
    if (deuda.saldoAnterior > 0) filas.push({ key: 'saldo-anterior', label: 'Saldo anterior', monto: deuda.saldoAnterior })
    return filas
  }
  if (!categoriaLabel) return []
  return [
    { key: 'categoria', label: categoriaLabel, monto: montoCategoria },
    ...serviciosActivos.map(srv => ({ key: srv.id, label: srv.nombre, monto: srv.monto_mensual })),
  ]
}

function fechaCorta(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function montoStr(monto: number): string {
  return `$ ${monto.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
}

function fechaEdicion(): string {
  const d    = new Date()
  const dias = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yy   = String(d.getFullYear()).slice(2)
  return `${dias[d.getDay()]} ${dd}.${mm}.${yy}`
}

// ─── Modal de pago ────────────────────────────────────────────────────────────

function PagoModal({
  cuota,
  onClose,
  titulo,
  conceptoMensaje,
  desglose,
  onEnviar,
}: {
  cuota:             Cuota
  onClose:           () => void
  titulo:            string
  conceptoMensaje:   string
  desglose:          FilaDesglose[]
  onEnviar:          (c: Cuota) => Promise<void>
}) {
  // Primero se guarda el envío (la card pasa a ENVIADO), después se abre
  // WhatsApp y se cierra el modal para que al volver se vea la card.
  async function enviarComprobante() {
    await onEnviar(cuota)
    Linking.openURL(whatsappComprobanteUrl(conceptoMensaje, cuota.monto))
    onClose()
  }

  // El desglose sólo existe para la cuota virtual (ver desgloseVirtual), que
  // se calcula en el mismo fetch que su monto. Una cuota real ya creada en la
  // tabla `cuotas` tiene su monto congelado al momento de generarse, así que
  // mostrarle un desglose con precios de hoy podría no sumar ese total (por
  // ejemplo, después de un aumento de cuota). Para esas, mostramos sólo el
  // total sin fabricar un desglose que no le corresponde.
  const esVirtual = cuota.id.startsWith('virtual-')
  const insets = useSafeAreaInsets()

  // "✓ COPIADO" durante 2 s después de copiar; el timeout se limpia al
  // desmontar (cerrar el modal) para no hacer setState sobre un componente ido.
  const [copiado, setCopiado] = useState(false)
  const copiadoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const montado        = useRef(true)
  useEffect(() => () => {
    montado.current = false
    if (copiadoTimeout.current) clearTimeout(copiadoTimeout.current)
  }, [])

  async function copiarAlias() {
    // Si el portapapeles falla no se muestra "copiado"; queda el alias seleccionable.
    try {
      await Clipboard.setStringAsync(ALIAS_CLUB)
    } catch {
      return
    }
    // El modal pudo cerrarse mientras se copiaba: no tocar estado ni dejar timers.
    if (!montado.current) return
    setCopiado(true)
    if (copiadoTimeout.current) clearTimeout(copiadoTimeout.current)
    copiadoTimeout.current = setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={m.overlayBg} activeOpacity={1} onPress={onClose} />
        <View style={[m.sheet, { paddingBottom: insets.bottom + 24 }]}>

          <Text style={m.sheetTitle}>{titulo}</Text>

          {/* Desglose */}
          <View style={m.breakdown}>
            {esVirtual && desglose.length > 0 && (
              <>
                {desglose.map(f => (
                  <View key={f.key} style={m.bRow}>
                    <Text style={m.bLabel}>{f.label}</Text>
                    <Text style={m.bMonto}>${f.monto.toLocaleString('es-AR')}</Text>
                  </View>
                ))}
                <View style={m.bSep} />
              </>
            )}
            <View style={m.bRow}>
              <Text style={m.bTotalLabel}>TOTAL A TRANSFERIR</Text>
              <Text style={m.bTotal}>{montoStr(cuota.monto)}</Text>
            </View>
          </View>

          {/* Alias */}
          <View style={m.aliasBox}>
            <Text style={m.aliasEtiqueta}>ALIAS</Text>
            {/* selectable queda como respaldo: mantener apretado para copiar */}
            <Text style={m.aliasValor} selectable>{ALIAS_CLUB}</Text>
            <TouchableOpacity
              style={m.copiarBtn}
              onPress={copiarAlias}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={copiado ? 'Alias copiado' : 'Copiar alias'}
            >
              <Feather
                name={copiado ? 'check' : 'copy'}
                size={14}
                color={copiado ? colors.confirmacion : colors.oro}
              />
              <Text style={[m.copiarBtnText, copiado && { color: colors.confirmacion }]}>
                {copiado ? '✓ COPIADO' : 'COPIAR ALIAS'}
              </Text>
            </TouchableOpacity>
            <Text style={m.aliasSub}>Transferí desde tu app bancaria o billetera virtual</Text>
          </View>

          {/* Acción */}
          <TouchableOpacity
            style={m.subirBtn}
            onPress={enviarComprobante}
            activeOpacity={0.8}
          >
            <Feather name="send" size={14} color={colors.oro} />
            <Text style={m.subirBtnText}>ENVIAR COMPROBANTE POR WHATSAPP</Text>
          </TouchableOpacity>

          <Text style={m.subirHint}>
            Se abre WhatsApp con un mensaje para Secretaría — adjuntá ahí la foto o captura del comprobante.
          </Text>

          <TouchableOpacity style={m.cerrarBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={m.cerrarText}>CERRAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Modal detalle de deuda (registros del club, vía NUVIX) ────────────────────

function DeudaClubModal({ onClose, socioId }: { onClose: () => void; socioId?: string }) {
  const { data, loading } = useDeudaDetalle(socioId)
  const insets = useSafeAreaInsets()

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={m.overlayBg} activeOpacity={1} onPress={onClose} />
        <View style={[m.sheet, dm.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={m.sheetTitle}>DEUDA SEGÚN EL CLUB</Text>

          {loading ? (
            <ActivityIndicator color={colors.oro} style={{ marginVertical: 30 }} />
          ) : !data ? (
            <Text style={dm.emptyText}>No se pudo cargar la información.</Text>
          ) : (
            <ScrollView style={dm.scroll} showsVerticalScrollIndicator={false}>
              {/* Sello de frescura */}
              <View style={dm.selloBox}>
                <Feather name="clock" size={12} color={colors.oroHondo} />
                <Text style={dm.selloText}>
                  {data.fechaCorte
                    ? `Datos al ${fechaCorta(data.fechaCorte)} — puede no reflejar pagos muy recientes.`
                    : 'Todavía no hay datos de deuda cargados por el club.'}
                </Text>
              </View>

              {/* Períodos con deuda */}
              {data.periodos.length === 0 && data.regCesantesTotal === 0 && data.saldoAnterior === 0 ? (
                <Text style={dm.emptyText}>No figurás con deuda pendiente. 🎉</Text>
              ) : (
                <>
                  {data.periodos.map(p => (
                    <View key={p.periodo} style={dm.periodoBox}>
                      <View style={dm.periodoHeader}>
                        <View style={dm.periodoLabelRow}>
                          <Text style={dm.periodoLabel}>{periodoLabel(p.periodo).toUpperCase()}</Text>
                          {esMesEnCurso(p.periodo) && (
                            <View style={dm.mesEnCursoTag}>
                              <Text style={dm.mesEnCursoTagText}>MES EN CURSO</Text>
                            </View>
                          )}
                        </View>
                        <Text style={dm.periodoMonto}>{montoStr(p.vencido)}</Text>
                      </View>
                      {p.comprobantes.length > 1 && (
                        <View style={dm.subRows}>
                          {p.comprobantes.map((c, idx) => (
                            <View key={c.id} style={dm.subRow}>
                              <Text style={dm.subRowLabel}>Concepto {idx + 1}</Text>
                              <Text style={dm.subRowMonto}>{montoStr(c.vencido)}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))}

                  {data.saldoAnterior > 0 && (
                    <View style={dm.periodoBox}>
                      <View style={dm.periodoHeader}>
                        <Text style={dm.periodoLabel}>SALDO ANTERIOR</Text>
                        <Text style={dm.periodoMonto}>{montoStr(data.saldoAnterior)}</Text>
                      </View>
                    </View>
                  )}

                  {/* Plan de regularización — aparte, nunca mezclado con cuotas */}
                  {data.regCesantesTotal > 0 && (
                    <View style={dm.regularizacionBox}>
                      <Text style={dm.regularizacionTitle}>PLAN DE REGULARIZACIÓN</Text>
                      <View style={dm.periodoHeader}>
                        <Text style={dm.subRowLabel}>Saldo del plan</Text>
                        <Text style={dm.periodoMonto}>{montoStr(data.regCesantesTotal)}</Text>
                      </View>
                      <Text style={dm.regularizacionHint}>
                        Aparte de la cuota social — no afecta tu estado de socio al día.
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* A vencer — informativo, no es deuda */}
              {data.proximosVencimientos.length > 0 && (
                <View style={dm.proximosBox}>
                  <Text style={dm.proximosTitle}>PRÓXIMOS VENCIMIENTOS</Text>
                  {data.proximosVencimientos.map(c => (
                    <View key={c.id} style={dm.subRow}>
                      <Text style={dm.subRowLabel}>
                        {c.vencimiento ? `Vence el ${fechaCorta(c.vencimiento)}` : 'Próximo vencimiento'}
                      </Text>
                      <Text style={dm.subRowMonto}>{montoStr(c.a_vencer)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={[m.cerrarBtn, { marginTop: 16 }]} onPress={onClose} activeOpacity={0.75}>
            <Text style={m.cerrarText}>CERRAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

// ─── Card cuota ───────────────────────────────────────────────────────────────

function CuotaCard({
  cuota,
  onVerPago,
  titulo,
  desglose,
  comprobante,
  onEscribirSecretaria,
}: {
  cuota:                Cuota
  onVerPago:            (c: Cuota) => void
  titulo:               string
  desglose:             FilaDesglose[]
  comprobante:          ComprobanteConEstado | null
  onEscribirSecretaria: (c: ComprobanteConEstado) => void
}) {
  const [expandida, setExpandida] = useState(false)

  const pagada      = cuota.estado === 'pagado'
  const enRevision  = cuota.estado === 'en_revision'
  const pendiente   = cuota.estado === 'pendiente'
  // Mismo criterio que PagoModal: el desglose sólo es fiel para la cuota
  // virtual, no para una cuota real ya creada con un monto congelado de otro
  // momento.
  const esVirtual   = cuota.id.startsWith('virtual-')
  // Comprobante mandado por WhatsApp desde este dispositivo (sólo cuotas
  // pendientes; los REGISTRADO se muestran en el banner de arriba).
  const enviado     = pendiente && comprobante?.estado === 'ENVIADO'
  const noRegistrado = pendiente && comprobante?.estado === 'NO_REGISTRADO'

  const borderColor = pagada ? colors.exito : enRevision || enviado ? colors.oroHondo : noRegistrado ? colors.rojoUrgente : colors.borde
  const badgeBg     = pagada ? colors.exito : enRevision || enviado ? colors.oroHondo : '#3A2800' // único: fondo oscuro del badge PENDIENTE / NO REGISTRADO
  const badgeLabel  = pagada ? 'PAGADA' : enRevision ? 'EN REVISIÓN' : enviado ? 'ENVIADO' : noRegistrado ? 'NO REGISTRADO' : 'PENDIENTE'
  // Sobre oroHondo el texto crema no llega a 4.5:1 → texto oscuro.
  const badgeTexto  = enRevision || enviado ? colors.sobreOro : colors.texto

  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: borderColor }]}
      onPress={() => setExpandida(v => !v)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityHint={expandida ? 'Oculta el detalle' : 'Muestra el detalle'}
      accessibilityState={{ expanded: expandida }}
    >
      {/* Fila principal */}
      <View style={s.cardRow}>
        <View style={s.cardLeft}>
          <Text style={s.cardPeriodo}>{titulo}</Text>
          <Text style={s.cardMonto}>{montoStr(cuota.monto)}</Text>
        </View>
        <View style={s.cardRight}>
          <View style={[s.estadoBadge, { backgroundColor: badgeBg }]}>
            <Text style={[s.estadoText, { color: badgeTexto }]}>{badgeLabel}</Text>
          </View>
          <Feather
            name={expandida ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.oroHondo}
            style={{ marginTop: 8 }}
          />
        </View>
      </View>

      {/* Feedback del comprobante mandado por WhatsApp */}
      {enviado && comprobante && (
        <View style={[s.infoRow, s.comprobanteRow]}>
          <Feather name="clock" size={12} color={colors.oroHondo} />
          <Text style={s.infoText}>
            Mandaste el comprobante el {diaMes(comprobante.enviadoAt)} por WhatsApp. Secretaría lo carga y se actualiza con la próxima importación.
          </Text>
        </View>
      )}
      {noRegistrado && comprobante && (
        <View style={[s.comprobanteRow, { gap: 10 }]}>
          <View style={s.infoRow}>
            <Feather name="alert-circle" size={12} color={colors.rojoUrgente} />
            <Text style={s.infoText}>Todavía no figura tu pago. Escribile a Secretaría.</Text>
          </View>
          <TouchableOpacity
            style={s.escribirBtn}
            onPress={() => onEscribirSecretaria(comprobante)}
            activeOpacity={0.8}
          >
            <Feather name="message-circle" size={14} color={colors.oro} />
            <Text style={s.escribirBtnText}>ESCRIBIR A SECRETARÍA</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Expansión */}
      {expandida && (
        <View style={s.detalle}>
          {/* Desglose — sólo para la cuota virtual, ver nota arriba */}
          {esVirtual && desglose.length > 0 && (
            <View style={s.desgloseBox}>
              {desglose.map(f => (
                <View key={f.key} style={s.desgloseRow}>
                  <Text style={s.desgloseItem}>{f.label}</Text>
                  <Text style={s.desgloseMonto}>${f.monto.toLocaleString('es-AR')}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Estado detallado */}
          {pagada && cuota.fecha_pago && (
            <View style={s.infoRow}>
              <Feather name="check-circle" size={12} color={colors.exito} />
              <Text style={s.infoText}>Pagado el {fechaCorta(cuota.fecha_pago)}</Text>
            </View>
          )}
          {enRevision && (
            <View style={s.infoRow}>
              <Feather name="clock" size={12} color={colors.oroHondo} />
              <Text style={s.infoText}>Comprobante recibido · aguardando confirmación de Secretaría</Text>
            </View>
          )}
        </View>
      )}

      {/* Acción de pago siempre visible en las pendientes, sin expandir */}
      {pendiente && (
        <TouchableOpacity
          style={[s.pagarBtn, s.pagarBtnCard]}
          onPress={() => onVerPago(cuota)}
          activeOpacity={0.8}
        >
          <Feather name="arrow-right-circle" size={14} color={colors.sobreOro} />
          <Text style={s.pagarBtnText}>VER CÓMO PAGAR</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CuotasScreen() {
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  // Tutor (also served from app/(tutor)/cuotas.tsx): the selected minor's
  // cuotas. "Ver cómo pagar" stays: it only shows the alias and opens WhatsApp,
  // no write to the club's data. Other roles: socioId undefined -> unchanged.
  const { socioId } = useSocioObjetivo()
  const {
    cuotas, loading, error, refreshing, refetch,
    serviciosActivos, totalMensual, categoriaLabel, montoCategoria,
    alDia, deudaActualizadaAt, deuda, pendientes,
    comprobantes, marcarComprobanteEnviado,
  } = useCuotas(socioId)

  const [cuotaModal, setCuotaModal] = useState<Cuota | null>(null)
  const [deudaModal, setDeudaModal] = useState(false)

  const enRevision   = cuotas.filter(c => c.estado === 'en_revision').length
  const fechaCorte   = deuda?.fechaCorte ?? deudaActualizadaAt
  const desglose     = desgloseVirtual(deuda, categoriaLabel, montoCategoria, serviciosActivos)
  const registrados  = comprobantes.filter(c => c.estado === 'REGISTRADO')
  const vigentes     = comprobantes.filter(c => c.estado !== 'REGISTRADO')

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={s.edicionBar}>
          <Text style={s.edicionLabel}>SECCIÓN · SOCIOS</Text>
          <Text style={s.edicionFecha}>{fechaEdicion()}</Text>
        </View>
        <TutorMenorSelector />
      </View>

      {/* `loading` es sólo la primera carga (o el reintento tras un error):
          al volver a la pestaña se recarga sin desmontar la lista. */}
      {loading ? (
        <ActivityIndicator color={colors.oro} style={{ marginTop: 60 }} />
      ) : error ? (
        <View style={s.centrado}>
          <Text style={s.errorTexto}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={s.reintentarBtn} activeOpacity={0.8}>
            <Text style={s.reintentarTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={cuotas}
          keyExtractor={c => c.id}
          contentContainerStyle={s.listContent}
          onRefresh={refetch}
          refreshing={refreshing}
          ListHeaderComponent={
            <View>
              {/* Resumen mensual */}
              {!!categoriaLabel && (
                <View style={s.resumenCard}>
                  <View style={s.secRow}>
                    <Text style={s.secTitle}>LO QUE PAGÁS POR MES</Text>
                    <View style={s.secLine} />
                  </View>
                  <View style={s.serviciosGrid}>
                    <View style={s.servicioChip}>
                      <Text style={s.servicioNombre}>{categoriaLabel}</Text>
                      <Text style={s.servicioMonto}>${montoCategoria.toLocaleString('es-AR')}</Text>
                    </View>
                    {serviciosActivos.map(srv => (
                      <View key={srv.id} style={s.servicioChip}>
                        <Text style={s.servicioNombre}>{srv.nombre}</Text>
                        <Text style={s.servicioMonto}>${srv.monto_mensual.toLocaleString('es-AR')}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>TOTAL</Text>
                    <Text style={s.totalMonto}>${totalMensual.toLocaleString('es-AR', { minimumFractionDigits: 0 })}/mes</Text>
                  </View>
                </View>
              )}

              {/* Comprobantes mandados por WhatsApp que ya aparecen en NUVIX */}
              {registrados.map(c => (
                <View key={c.clave} style={[s.banner, s.bannerRegistrado]}>
                  <Feather name="check-circle" size={14} color={colors.exito} />
                  <Text style={s.bannerText}>
                    Pago registrado ✓ — el comprobante que mandaste el {diaMes(c.enviadoAt)} ya figura en el club.
                  </Text>
                </View>
              ))}

              {/* Banners de alerta */}
              {pendientes > 0 && (
                <View style={[s.banner, s.bannerPendiente]}>
                  <Feather name="alert-circle" size={14} color={colors.sobreOro} />
                  <Text style={[s.bannerText, { color: colors.sobreOro }]}>
                    {pendientes === 1
                      ? 'Tenés 1 cuota pendiente de pago.'
                      : `Tenés ${pendientes} cuotas pendientes de pago.`}
                  </Text>
                </View>
              )}
              {enRevision > 0 && (
                <View style={[s.banner, s.bannerRevision]}>
                  <Feather name="clock" size={14} color={colors.sobreOro} />
                  <Text style={[s.bannerText, { color: colors.sobreOro }]}>
                    {enRevision === 1
                      ? '1 comprobante en revisión por Secretaría.'
                      : `${enRevision} comprobantes en revisión por Secretaría.`}
                  </Text>
                </View>
              )}
              {alDia === false && (
                <TouchableOpacity
                  style={[s.banner, s.bannerDeudaClub]}
                  onPress={() => setDeudaModal(true)}
                  activeOpacity={0.8}
                >
                  <Feather name="info" size={14} color={colors.tinta} />
                  <Text style={[s.bannerText, { color: colors.tinta }]}>
                    Según los registros del club, tenés pagos pendientes
                    {deudaActualizadaAt ? ` (datos al ${fechaCorta(deudaActualizadaAt)})` : ''}. Tocá para ver el detalle.
                  </Text>
                </TouchableOpacity>
              )}

              {/* Historial header */}
              <View style={[s.secRow, { marginTop: 20 }]}>
                <Text style={s.secTitle}>HISTORIAL DE CUOTAS</Text>
                <View style={s.secLine} />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <CuotaCard
              cuota={item}
              onVerPago={c => setCuotaModal(c)}
              titulo={tituloCuota(item, fechaCorte)}
              desglose={desglose}
              comprobante={comprobanteParaPeriodos(
                vigentes,
                item.id.startsWith('virtual-') ? item.periodosNuvix ?? [] : [item.periodo],
              )}
              onEscribirSecretaria={c => Linking.openURL(whatsappNoFiguraUrl(c))}
            />
          )}
          ListEmptyComponent={
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>No hay cuotas registradas aún.</Text>
            </View>
          }
        />
      )}

      {cuotaModal && (
        <PagoModal
          cuota={cuotaModal}
          onClose={() => setCuotaModal(null)}
          titulo={tituloCuota(cuotaModal, fechaCorte)}
          conceptoMensaje={conceptoWhatsapp(cuotaModal, fechaCorte)}
          desglose={desglose}
          onEnviar={marcarComprobanteEnviado}
        />
      )}

      {deudaModal && <DeudaClubModal socioId={socioId} onClose={() => setDeudaModal(false)} />}
    </View>
  )
}

// ─── Styles pantalla ─────────────────────────────────────────────────────────


const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: colors.fondo },
  listContent:  { paddingHorizontal: 20, paddingBottom: 60, gap: 10 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: colors.oroSobreClaro },
  edicionFecha: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.grisClaro },

  secRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secTitle:{ fontFamily: fonts.label, fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: colors.oroHondo },
  secLine: { flex: 1, height: 1, backgroundColor: colors.borde },

  resumenCard: {
    backgroundColor: colors.card, borderRadius: 6, borderWidth: 1, borderColor: colors.borde,
    padding: 16, gap: 12, marginBottom: 4,
  },
  serviciosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  servicioChip: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8,
    borderColor: colors.borde, gap: 2,
  },
  servicioNombre: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, color: colors.texto },
  servicioMonto:  { fontFamily: fonts.cuerpo, fontSize: 15, color: colors.muted },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borde },
  totalLabel:{ fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, color: colors.muted },
  totalMonto:{ fontFamily: fonts.titulo, fontSize: 23, color: colors.texto },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, marginBottom: 4,
  },
  bannerPendiente: { backgroundColor: colors.oroHondo },
  bannerRevision:  { backgroundColor: colors.oro },
  bannerRegistrado: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borde,
    borderLeftWidth: 3, borderLeftColor: colors.exito,
  },
  bannerDeudaClub: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borde,
    borderLeftWidth: 3, borderLeftColor: colors.rojoUrgente,
  },
  bannerText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, flex: 1, color: colors.texto },

  // Cards de cuota
  card: {
    backgroundColor: colors.card, borderRadius: 4, borderWidth: 1,
    borderColor: colors.borde, borderLeftWidth: 3, padding: 16,
  },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft:   { gap: 4, flex: 1 },
  cardRight:  { alignItems: 'flex-end' },
  cardPeriodo:{ fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.muted },
  cardMonto:  { fontFamily: fonts.titulo, fontSize: 28, color: colors.texto },
  estadoBadge:{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  estadoText: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.texto },

  detalle:  { marginTop: 14, gap: 10, borderTopWidth: 1, borderTopColor: colors.borde, paddingTop: 14 },
  desgloseBox: { gap: 6 },
  desgloseRow: { flexDirection: 'row', justifyContent: 'space-between' },
  desgloseItem:{ fontFamily: fonts.cuerpo, fontSize: 15, color: colors.muted, flex: 1 },
  desgloseMonto:{ fontFamily: fonts.cuerpo, fontSize: 15, color: colors.texto },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText:{ fontFamily: fonts.cuerpo, fontSize: 14, color: colors.muted, flex: 1, fontStyle: 'italic' },
  comprobanteRow: { marginTop: 12 },

  escribirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 4, paddingVertical: 12, minHeight: 44,
  },
  escribirBtnText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },

  pagarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.oro, paddingVertical: 12, minHeight: 44, borderRadius: 4,
  },
  pagarBtnCard: { marginTop: 14 },
  pagarBtnText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.sobreOro },

  emptyContainer: { paddingTop: 60, alignItems: 'center' },
  emptyText:      { fontFamily: fonts.cuerpo, fontSize: 16, fontStyle: 'italic', color: colors.muted },

  // Error de carga — mismo patrón que calendario.tsx
  centrado:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  errorTexto:      { fontFamily: fonts.cuerpo, color: colors.rojoTexto, fontSize: 16, textAlign: 'center' },
  reintentarBtn:   { minHeight: 44, justifyContent: 'center', marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.oro, borderRadius: 4 },
  reintentarTexto: { fontFamily: fonts.label, fontSize: 13, color: colors.oro, letterSpacing: 1 },
})

// ─── Styles modal de pago ─────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    // paddingBottom va en línea: insets.bottom + 24 (barra de gestos / home indicator).
    // Sin "handle": no se puede arrastrar para cerrar, se cierra con CERRAR o tocando afuera.
    padding: 24, gap: 16,
    borderTopWidth: 1, borderColor: colors.borde,
  },
  sheetTitle: {
    fontFamily: fonts.titulo, fontSize: 26, color: colors.texto,
  },

  breakdown: { gap: 8 },
  bRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bLabel:    { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.muted, flex: 1 },
  bMonto:    { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto },
  bSep:      { height: 1, backgroundColor: colors.borde, marginVertical: 4 },
  bTotalLabel:{ fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, color: colors.muted, flex: 1 },
  bTotal:    { fontFamily: fonts.titulo, fontSize: 26, color: colors.texto },

  aliasBox: {
    backgroundColor: colors.fondo, borderRadius: 6, borderWidth: 1, borderColor: colors.borde,
    padding: 16, gap: 4, alignItems: 'center',
  },
  aliasEtiqueta: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 3, color: colors.muted },
  aliasValor:    { fontFamily: fonts.titulo, fontSize: 25, color: colors.oro, letterSpacing: 1 },
  aliasSub:      { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.muted, fontStyle: 'italic', textAlign: 'center' },
  copiarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44, minWidth: 160, paddingHorizontal: 16, marginVertical: 4,
    borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 4,
  },
  copiarBtnText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },

  subirBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.oroHondo, borderRadius: 4, paddingVertical: 14,
  },
  subirBtnText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oro },

  subirHint: {
    fontFamily: fonts.cuerpo, fontSize: 13, color: colors.muted,
    fontStyle: 'italic', textAlign: 'center', lineHeight: 17,
  },

  cerrarBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 44 },
  cerrarText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.muted },
})

// ─── Styles modal detalle de deuda ────────────────────────────────────────────

const dm = StyleSheet.create({
  sheet: { maxHeight: '80%' },
  scroll: { marginTop: 4 },

  selloBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.fondo, borderRadius: 6, borderWidth: 1, borderColor: colors.borde,
    padding: 12, marginBottom: 16,
  },
  selloText: { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.muted, flex: 1, fontStyle: 'italic', lineHeight: 17 },

  emptyText: {
    fontFamily: fonts.cuerpo, fontSize: 16, color: colors.muted,
    fontStyle: 'italic', textAlign: 'center', paddingVertical: 20,
  },

  periodoBox: {
    borderBottomWidth: 1, borderBottomColor: colors.borde, paddingVertical: 12,
  },
  periodoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  periodoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  periodoLabel:  { fontFamily: fonts.label, fontSize: 13, letterSpacing: 2, color: colors.oroHondo },
  periodoMonto:  { fontFamily: fonts.titulo, fontSize: 21, color: colors.texto },

  mesEnCursoTag: {
    borderWidth: 1, borderColor: colors.muted, borderRadius: 3,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  mesEnCursoTagText: {
    fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, color: colors.muted,
  },

  subRows: { marginTop: 8, gap: 4, paddingLeft: 4 },
  subRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  subRowLabel: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.muted, flex: 1 },
  subRowMonto: { fontFamily: fonts.cuerpo, fontSize: 14, color: colors.texto },

  regularizacionBox: {
    marginTop: 12, backgroundColor: colors.fondo, borderRadius: 6,
    borderWidth: 1, borderColor: colors.borde, padding: 12,
  },
  regularizacionTitle: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: colors.muted, marginBottom: 8,
  },
  regularizacionHint: {
    fontFamily: fonts.cuerpo, fontSize: 13, color: colors.muted,
    fontStyle: 'italic', marginTop: 8, lineHeight: 17,
  },

  proximosBox: { marginTop: 16 },
  proximosTitle: {
    fontFamily: fonts.label, fontSize: 12, letterSpacing: 2, color: colors.muted, marginBottom: 8,
  },
})
