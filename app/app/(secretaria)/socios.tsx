import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, TextInput, Alert, ScrollView, Image,
  KeyboardAvoidingView,
} from 'react-native'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { Header } from '@/components/shared/Header'
import { useSociosSecretaria, type SocioItem, type CategoriaSocio, type ServicioOpcional, type CardFormData } from '@/hooks/useSociosSecretaria'
import { colors, fonts } from '@/constants/theme'

// ─── Constants ────────────────────────────────────────────────────────────────

const FONDO   = '#15110A'
const CARD    = '#1C1710'
const TEXTO   = '#F3EFE4'
const MUTED   = '#8E8574'
const DIVIDER = '#2C2418'

const ESTADO_COLOR: Record<string, string> = {
  activo:    '#2ECC71',
  moroso:    colors.oro,
  pendiente: '#E67E22',
  inactivo:  '#555555',
}
const ESTADO_LABEL: Record<string, string> = {
  activo: 'ACTIVO', moroso: 'MOROSO', pendiente: 'PENDIENTE', inactivo: 'INACTIVO',
}
const FILTROS = ['todos', 'activo', 'moroso', 'pendiente', 'inactivo'] as const
type Filtro = typeof FILTROS[number]

// ─── Modal Nuevo Socio ────────────────────────────────────────────────────────

function ModalNuevoSocio({
  visible,
  categorias,
  creando,
  onClose,
  onCreate,
}: {
  visible:    boolean
  categorias: CategoriaSocio[]
  creando:    boolean
  onClose:    () => void
  onCreate:   (email: string, nombre: string, dni: string, categoria_id: string) => void
}) {
  const [email, setEmail]   = useState('')
  const [nombre, setNombre] = useState('')
  const [dni, setDni]       = useState('')
  const [catId, setCatId]   = useState('')

  const handleCrear = () => {
    if (!email.trim())  { Alert.alert('Requerido', 'Email obligatorio.'); return }
    if (!nombre.trim()) { Alert.alert('Requerido', 'Nombre obligatorio.'); return }
    if (!dni.trim())    { Alert.alert('Requerido', 'DNI obligatorio.'); return }
    if (!catId)         { Alert.alert('Requerido', 'Seleccioná una categoría.'); return }
    onCreate(email.trim().toLowerCase(), nombre.trim(), dni.trim(), catId)
  }

  const handleClose = () => {
    setEmail(''); setNombre(''); setDni(''); setCatId('')
    onClose()
  }

  const categoriasActivas = categorias.filter(c => c.activa)

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={ss.kavOverlay}>
        <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={ss.modal}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={ss.modalContent}
          >
            <View style={ss.modalHeader}>
              <Text style={ss.modalTitle}>NUEVO SOCIO</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
                <Feather name="x" size={20} color={TEXTO} />
              </TouchableOpacity>
            </View>

            {[
              { label: 'NOMBRE COMPLETO', value: nombre, set: setNombre, placeholder: 'Juan Pérez', keyboard: 'default' as const, caps: 'words' as const },
              { label: 'EMAIL', value: email, set: setEmail, placeholder: 'juan@ejemplo.com', keyboard: 'email-address' as const, caps: 'none' as const },
              { label: 'DNI', value: dni, set: setDni, placeholder: '12345678', keyboard: 'numeric' as const, caps: 'none' as const },
            ].map(f => (
              <View key={f.label}>
                <Text style={ss.inputLabel}>{f.label}</Text>
                <TextInput
                  style={ss.input}
                  value={f.value}
                  onChangeText={f.set}
                  placeholder={f.placeholder}
                  placeholderTextColor={MUTED}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.caps}
                />
              </View>
            ))}

            <Text style={ss.inputLabelMt}>CATEGORÍA</Text>
            {categoriasActivas.length === 0 ? (
              <Text style={ss.catVacio}>
                Sin categorías — verificar seed en Supabase.
              </Text>
            ) : (
              <View style={ss.categoriasGrid}>
                {categoriasActivas.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[ss.catBtn, catId === c.id ? ss.catBtnActivo : ss.catBtnInactivo]}
                    onPress={() => setCatId(c.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[ss.catBtnText, catId === c.id ? ss.catBtnTextActivo : ss.catBtnTextInactivo]}>
                      {c.nombre}
                    </Text>
                    <Text style={[ss.catMonto, catId === c.id ? ss.catMontoActivo : ss.catMontoInactivo]}>
                      ${c.monto_mensual}/mes
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[ss.crearBtn, creando && ss.crearBtnOff]}
              onPress={handleCrear}
              disabled={creando}
              activeOpacity={0.8}
            >
              {creando
                ? <ActivityIndicator color={colors.oro} />
                : <Text style={ss.crearBtnText}>CREAR SOCIO Y ENVIAR INVITACIÓN</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Modal Pago Manual ────────────────────────────────────────────────────────

function periodoActual(): string {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

function ModalPagoManual({
  visible,
  montoDefault,
  socioNombre,
  onClose,
  onConfirm,
}: {
  visible:      boolean
  montoDefault: number
  socioNombre:  string
  onClose:      () => void
  onConfirm:    (periodo: string, monto: number, formaPago: 'efectivo' | 'transferencia') => Promise<void>
}) {
  const [periodo,   setPeriodo]   = useState(periodoActual)
  const [monto,     setMonto]     = useState(String(montoDefault))
  const [formaPago, setFormaPago] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [enviando,  setEnviando]  = useState(false)

  useEffect(() => { setMonto(String(montoDefault)) }, [montoDefault, visible])

  const handleConfirm = async () => {
    if (!/^\d{4}-\d{2}$/.test(periodo.trim())) {
      Alert.alert('Período inválido', 'Usá el formato YYYY-MM, ej: 2026-06')
      return
    }
    const montoNum = parseFloat(monto.replace(',', '.'))
    if (isNaN(montoNum) || montoNum <= 0) {
      Alert.alert('Monto inválido', 'Ingresá un monto mayor a 0.')
      return
    }
    setEnviando(true)
    await onConfirm(periodo.trim(), montoNum, formaPago)
    setEnviando(false)
  }

  const handleClose = () => {
    setPeriodo(periodoActual())
    setMonto(String(montoDefault))
    setFormaPago('efectivo')
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={ss.kavOverlay}>
        <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={ss.modal}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ss.modalContent}
          >
            <View style={ss.modalHeader}>
              <Text style={ss.modalTitle}>REGISTRAR PAGO</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
                <Feather name="x" size={20} color={TEXTO} />
              </TouchableOpacity>
            </View>

            <Text style={ss.pagoSocioNombre}>{socioNombre}</Text>

            <Text style={ss.inputLabelMt}>PERÍODO</Text>
            <TextInput
              style={ss.input}
              value={periodo}
              onChangeText={setPeriodo}
              placeholder="2026-06"
              placeholderTextColor={MUTED}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              maxLength={7}
            />

            <Text style={ss.inputLabelMt}>MONTO ($)</Text>
            <TextInput
              style={ss.input}
              value={monto}
              onChangeText={setMonto}
              placeholder="5000"
              placeholderTextColor={MUTED}
              keyboardType="numeric"
            />

            <Text style={ss.inputLabelMt}>FORMA DE PAGO</Text>
            <View style={ss.formaPagoRow}>
              {(['efectivo', 'transferencia'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  style={[ss.formaPagoBtn, formaPago === f ? ss.formaPagoBtnActivo : ss.formaPagoBtnInactivo]}
                  onPress={() => setFormaPago(f)}
                  activeOpacity={0.75}
                >
                  <Text style={[ss.formaPagoBtnText, formaPago === f ? ss.formaPagoBtnTextActivo : ss.formaPagoBtnTextInactivo]}>
                    {f === 'efectivo' ? 'EFECTIVO' : 'TRANSFERENCIA'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[ss.crearBtn, enviando && ss.crearBtnOff]}
              onPress={handleConfirm}
              disabled={enviando}
              activeOpacity={0.8}
            >
              {enviando
                ? <ActivityIndicator color={colors.oro} />
                : <Text style={ss.crearBtnText}>CONFIRMAR PAGO</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Modal Asociar Tarjeta ────────────────────────────────────────────────────

function ModalAsociarTarjeta({
  visible,
  socioNombre,
  onClose,
  onConfirm,
}: {
  visible:      boolean
  socioNombre:  string
  onClose:      () => void
  onConfirm:    (data: CardFormData) => Promise<void>
}) {
  const [cardNumber,     setCardNumber]     = useState('')
  const [expMonth,       setExpMonth]       = useState('')
  const [expYear,        setExpYear]        = useState('')
  const [cvv,            setCvv]            = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [enviando,       setEnviando]       = useState(false)

  const handleCardNumberChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 16)
    setCardNumber(digits.replace(/(\d{4})(?=\d)/g, '$1 '))
  }

  const handleConfirm = async () => {
    const digits = cardNumber.replace(/\s/g, '')
    if (digits.length < 13) { Alert.alert('Error', 'Número de tarjeta inválido'); return }
    const month = parseInt(expMonth)
    if (!month || month < 1 || month > 12) { Alert.alert('Error', 'Mes de vencimiento inválido (1-12)'); return }
    const yearRaw = parseInt(expYear)
    const fullYear = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    if (!fullYear || fullYear < new Date().getFullYear()) { Alert.alert('Error', 'Año de vencimiento inválido'); return }
    if (!cvv) { Alert.alert('Error', 'CVV requerido'); return }
    if (!cardholderName.trim()) { Alert.alert('Error', 'Nombre del titular requerido'); return }
    setEnviando(true)
    await onConfirm({
      card_number:      digits,
      expiration_month: month,
      expiration_year:  fullYear,
      security_code:    cvv,
      cardholder_name:  cardholderName.trim(),
    })
    setEnviando(false)
  }

  const handleClose = () => {
    setCardNumber(''); setExpMonth(''); setExpYear(''); setCvv(''); setCardholderName('')
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={ss.kavOverlay}>
        <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={ss.modal}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ss.modalContent}
          >
            <View style={ss.modalHeader}>
              <Text style={ss.modalTitle}>ASOCIAR TARJETA</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
                <Feather name="x" size={20} color={TEXTO} />
              </TouchableOpacity>
            </View>

            <Text style={ss.pagoSocioNombre}>{socioNombre}</Text>

            <Text style={ss.inputLabelMt}>NÚMERO DE TARJETA</Text>
            <TextInput
              style={ss.input}
              value={cardNumber}
              onChangeText={handleCardNumberChange}
              placeholder="1234 5678 9012 3456"
              placeholderTextColor={MUTED}
              keyboardType="numeric"
              maxLength={19}
            />

            <View style={ss.tarjetaRow}>
              <View style={ss.tarjetaCol}>
                <Text style={ss.inputLabelMt}>MES (MM)</Text>
                <TextInput
                  style={ss.input}
                  value={expMonth}
                  onChangeText={t => setExpMonth(t.replace(/\D/g, '').slice(0, 2))}
                  placeholder="06"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                  maxLength={2}
                />
              </View>
              <View style={ss.tarjetaCol}>
                <Text style={ss.inputLabelMt}>AÑO (AAAA)</Text>
                <TextInput
                  style={ss.input}
                  value={expYear}
                  onChangeText={t => setExpYear(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="2028"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                  maxLength={4}
                />
              </View>
              <View style={ss.tarjetaCol}>
                <Text style={ss.inputLabelMt}>CVV</Text>
                <TextInput
                  style={ss.input}
                  value={cvv}
                  onChangeText={t => setCvv(t.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>

            <Text style={ss.inputLabelMt}>NOMBRE EN LA TARJETA</Text>
            <TextInput
              style={ss.input}
              value={cardholderName}
              onChangeText={setCardholderName}
              placeholder="JUAN PÉREZ"
              placeholderTextColor={MUTED}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={[ss.crearBtn, enviando && ss.crearBtnOff]}
              onPress={handleConfirm}
              disabled={enviando}
              activeOpacity={0.8}
            >
              {enviando
                ? <ActivityIndicator color={colors.oro} />
                : <Text style={ss.crearBtnText}>GUARDAR TARJETA</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Modal Cobrar Tarjeta ─────────────────────────────────────────────────────

function ModalCobrarTarjeta({
  visible,
  socioNombre,
  onClose,
  onConfirm,
}: {
  visible:     boolean
  socioNombre: string
  onClose:     () => void
  onConfirm:   (periodo: string) => Promise<void>
}) {
  const [periodo,  setPeriodo]  = useState(periodoActual)
  const [enviando, setEnviando] = useState(false)

  const handleConfirm = async () => {
    if (!/^\d{4}-\d{2}$/.test(periodo.trim())) {
      Alert.alert('Período inválido', 'Usá el formato YYYY-MM, ej: 2026-06')
      return
    }
    setEnviando(true)
    await onConfirm(periodo.trim())
    setEnviando(false)
  }

  const handleClose = () => { setPeriodo(periodoActual()); onClose() }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={ss.kavOverlay}>
        <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={ss.modal}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={ss.modalContent}
          >
            <View style={ss.modalHeader}>
              <Text style={ss.modalTitle}>COBRAR CON TARJETA</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.75}>
                <Feather name="x" size={20} color={TEXTO} />
              </TouchableOpacity>
            </View>

            <Text style={ss.pagoSocioNombre}>{socioNombre}</Text>

            <Text style={ss.inputLabelMt}>PERÍODO</Text>
            <TextInput
              style={ss.input}
              value={periodo}
              onChangeText={setPeriodo}
              placeholder="2026-06"
              placeholderTextColor={MUTED}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              maxLength={7}
            />

            <TouchableOpacity
              style={[ss.crearBtn, enviando && ss.crearBtnOff]}
              onPress={handleConfirm}
              disabled={enviando}
              activeOpacity={0.8}
            >
              {enviando
                ? <ActivityIndicator color={colors.oro} />
                : <Text style={ss.crearBtnText}>CONFIRMAR COBRO</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Detalle Socio ────────────────────────────────────────────────────────────

function DetalleSocio({
  socio,
  categorias,
  servicios,
  serviciosSocio,
  fotoSignedUrl,
  onDeactivate,
  onReactivate,
  onValidarFoto,
  onToggleServicio,
  onRegistrarPago,
  onAssociateCard,
  onRemoveCard,
  onChargeCard,
  onClose,
}: {
  socio:            SocioItem
  categorias:       CategoriaSocio[]
  servicios:        ServicioOpcional[]
  serviciosSocio:   string[]
  fotoSignedUrl:    (path: string) => Promise<string | null>
  onDeactivate:      (id: string) => void
  onReactivate:      (id: string) => void
  onValidarFoto:     (id: string) => void
  onToggleServicio:  (servicioId: string, agregar: boolean) => void
  onRegistrarPago:   (periodo: string, monto: number, formaPago: 'efectivo' | 'transferencia') => Promise<boolean>
  onAssociateCard:   (data: CardFormData) => Promise<boolean>
  onRemoveCard:      () => Promise<boolean>
  onChargeCard:      (periodo: string) => Promise<boolean>
  onClose:           () => void
}) {
  const [fotoUrl,              setFotoUrl]              = useState<string | null>(null)
  const [modalPago,            setModalPago]            = useState(false)
  const [modalAsociarTarjeta,  setModalAsociarTarjeta]  = useState(false)
  const [modalCobrarTarjeta,   setModalCobrarTarjeta]   = useState(false)
  const categoria = categorias.find(c => c.id === socio.categoria_id)

  const montoServicios = servicios
    .filter(s => serviciosSocio.includes(s.id))
    .reduce((sum, s) => sum + s.monto_mensual, 0)
  const montoTotal = (categoria?.monto_mensual ?? 0) + montoServicios

  const verFoto = async () => {
    if (!socio.foto_path) { Alert.alert('Sin foto', 'El socio no tiene foto cargada.'); return }
    const url = await fotoSignedUrl(socio.foto_path)
    if (url) setFotoUrl(url)
  }

  return (
    <View style={ss.detalle}>
      <View style={ss.detalleBar}>
        <TouchableOpacity onPress={onClose} style={ss.backBtn} activeOpacity={0.75}>
          <Feather name="arrow-left" size={18} color={TEXTO} />
          <Text style={ss.backText}>SOCIOS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={ss.detalleScrollContent} showsVerticalScrollIndicator={false}>
        {fotoUrl ? (
          <Image source={{ uri: fotoUrl }} style={ss.fotoDetalle} />
        ) : (
          <TouchableOpacity
            style={[ss.fotoDetalle, ss.fotoPlaceholder]}
            onPress={verFoto}
            activeOpacity={0.75}
          >
            <Feather name="image" size={32} color={MUTED} />
            <Text style={ss.verFotoText}>VER FOTO</Text>
          </TouchableOpacity>
        )}

        <View>
          <Text style={ss.detalleNombre}>{socio.nombre}</Text>
          <Text style={ss.detalleNum}>Nº {socio.numero_socio}</Text>
        </View>

        {[
          { label: 'DNI',       value: socio.dni },
          { label: 'CATEGORÍA', value: categoria?.nombre ?? socio.categoria },
          { label: 'ESTADO',    value: ESTADO_LABEL[socio.estado] ?? socio.estado.toUpperCase() },
          { label: 'FOTO',      value: socio.foto_validada ? 'Validada ✓' : 'Pendiente de validación' },
        ].map(row => (
          <View key={row.label} style={ss.dataRow}>
            <Text style={ss.dataLabel}>{row.label}</Text>
            <Text style={ss.dataValue}>{row.value}</Text>
          </View>
        ))}

        {/* ── Servicios opcionales ─────────────────────────────────── */}
        <View style={ss.serviciosSection}>
          <Text style={ss.serviciosTitulo}>SERVICIOS OPCIONALES</Text>
          <View style={ss.serviciosGrid}>
            {servicios.map(srv => {
              const activo = serviciosSocio.includes(srv.id)
              return (
                <TouchableOpacity
                  key={srv.id}
                  style={[ss.servicioChip, activo ? ss.servicioChipActivo : ss.servicioChipInactivo]}
                  onPress={() => onToggleServicio(srv.id, !activo)}
                  activeOpacity={0.75}
                >
                  <Text style={[ss.servicioChipNombre, activo ? ss.servicioChipNombreActivo : ss.servicioChipNombreInactivo]}>
                    {srv.nombre}
                  </Text>
                  <Text style={[ss.servicioChipMonto, activo ? ss.servicioChipMontoActivo : ss.servicioChipMontoInactivo]}>
                    +${srv.monto_mensual}/mes
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <View style={ss.totalRow}>
            <Text style={ss.totalLabel}>TOTAL MENSUAL</Text>
            <Text style={ss.totalMonto}>
              ${montoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* ── Débito automático ───────────────────────────────── */}
        <View style={ss.tarjetaSection}>
          <Text style={ss.tarjetaTitulo}>DÉBITO AUTOMÁTICO</Text>
          {socio.mp_card_last_four ? (
            <View style={ss.tarjetaCard}>
              <Feather name="credit-card" size={16} color={colors.oro} />
              <View style={ss.tarjetaCardInfo}>
                <Text style={ss.tarjetaNumero}>
                  •••• •••• •••• {socio.mp_card_last_four}
                </Text>
                {socio.mp_card_brand ? (
                  <Text style={ss.tarjetaBrand}>
                    {socio.mp_card_brand.toUpperCase()}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <Text style={ss.tarjetaVacia}>Sin tarjeta asociada</Text>
          )}
        </View>

        <View style={ss.acciones}>
          {socio.estado !== 'inactivo' && (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnVerde]}
              onPress={() => setModalPago(true)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextVerde]}>REGISTRAR PAGO</Text>
            </TouchableOpacity>
          )}
          {!socio.foto_validada && socio.foto_path && (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnOro]}
              onPress={() => onValidarFoto(socio.id)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextOro]}>VALIDAR FOTO</Text>
            </TouchableOpacity>
          )}
          {socio.estado !== 'inactivo' && (
            socio.mp_card_last_four ? (
              <>
                <TouchableOpacity
                  style={[ss.accionBtn, ss.accionBtnVerde]}
                  onPress={() => setModalCobrarTarjeta(true)}
                  activeOpacity={0.8}
                >
                  <Text style={[ss.accionBtnText, ss.accionBtnTextVerde]}>COBRAR CON TARJETA</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ss.accionBtn, ss.accionBtnRojo]}
                  onPress={() => Alert.alert(
                    'Quitar tarjeta',
                    '¿Quitar la tarjeta guardada de este socio?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Quitar', style: 'destructive', onPress: () => { void onRemoveCard() } },
                    ]
                  )}
                  activeOpacity={0.8}
                >
                  <Text style={[ss.accionBtnText, ss.accionBtnTextRojo]}>QUITAR TARJETA</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[ss.accionBtn, ss.accionBtnOro]}
                onPress={() => setModalAsociarTarjeta(true)}
                activeOpacity={0.8}
              >
                <Text style={[ss.accionBtnText, ss.accionBtnTextOro]}>ASOCIAR TARJETA</Text>
              </TouchableOpacity>
            )
          )}

          {socio.estado !== 'inactivo' ? (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnRojo]}
              onPress={() => onDeactivate(socio.id)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextRojo]}>DESACTIVAR SOCIO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[ss.accionBtn, ss.accionBtnVerde]}
              onPress={() => onReactivate(socio.id)}
              activeOpacity={0.8}
            >
              <Text style={[ss.accionBtnText, ss.accionBtnTextVerde]}>REACTIVAR SOCIO</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <ModalPagoManual
        visible={modalPago}
        montoDefault={montoTotal}
        socioNombre={socio.nombre}
        onClose={() => setModalPago(false)}
        onConfirm={async (periodo, monto, formaPago) => {
          const ok = await onRegistrarPago(periodo, monto, formaPago)
          if (ok) {
            setModalPago(false)
            Alert.alert('Pago registrado ✓', `Cuota ${periodo} marcada como pagada.`)
          }
        }}
      />

      <ModalAsociarTarjeta
        visible={modalAsociarTarjeta}
        socioNombre={socio.nombre}
        onClose={() => setModalAsociarTarjeta(false)}
        onConfirm={async (data) => {
          const ok = await onAssociateCard(data)
          if (ok) {
            setModalAsociarTarjeta(false)
            Alert.alert('Tarjeta guardada ✓', 'La tarjeta fue asociada correctamente.')
          }
        }}
      />

      <ModalCobrarTarjeta
        visible={modalCobrarTarjeta}
        socioNombre={socio.nombre}
        onClose={() => setModalCobrarTarjeta(false)}
        onConfirm={async (periodo) => {
          const ok = await onChargeCard(periodo)
          if (ok) setModalCobrarTarjeta(false)
        }}
      />
    </View>
  )
}

// ─── Fila lista ───────────────────────────────────────────────────────────────

function SocioRow({ socio, onPress }: { socio: SocioItem; onPress: () => void }) {
  return (
    <TouchableOpacity style={ss.socioRow} onPress={onPress} activeOpacity={0.75}>
      <Text style={ss.socioNum}>{socio.numero_socio}</Text>
      <View style={ss.socioInfo}>
        <Text style={ss.socioNombre} numberOfLines={1}>{socio.nombre}</Text>
        <Text style={ss.socioCat}>{socio.categoria}</Text>
      </View>
      <View style={[ss.estadoBadge, { backgroundColor: ESTADO_COLOR[socio.estado] ?? '#555' }]}>
        <Text style={ss.estadoBadgeText}>{ESTADO_LABEL[socio.estado]?.[0] ?? '?'}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SociosScreen() {
  const scrollRef = useRef<FlatList>(null)
  useScrollToTop(scrollRef)
  const insets = useSafeAreaInsets()
  const {
    socios, categorias, servicios, serviciosSocio, loading, creando,
    filtro, setFiltro,
    crearSocio, desactivarSocio, reactivarSocio, validarFoto, fotoSignedUrl,
    registrarPagoManual, associateCard, removeCard, chargeCard,
    fetchServiciosSocio, toggleServicio,
  } = useSociosSecretaria()

  const [modalNuevo, setModalNuevo] = useState(false)
  const [detalle, setDetalle]       = useState<SocioItem | null>(null)

  const handleCrear = async (email: string, nombre: string, dni: string, categoria_id: string) => {
    const ok = await crearSocio({ email, nombre, dni, categoria_id })
    if (ok) setModalNuevo(false)
  }

  const handleDeactivate = useCallback(async (id: string) => {
    Alert.alert('Desactivar socio', '¿Estás seguro? Se baneará el acceso.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desactivar', style: 'destructive', onPress: async () => {
        const ok = await desactivarSocio(id)
        if (ok) setDetalle(null)
      }},
    ])
  }, [desactivarSocio])

  const handleReactivate = useCallback(async (id: string) => {
    const ok = await reactivarSocio(id)
    if (ok) setDetalle(null)
  }, [reactivarSocio])

  const handleValidarFoto = useCallback(async (id: string) => {
    const res = await validarFoto(id)
    if (res.validada) {
      Alert.alert('Foto validada ✓', `Estado actualizado a: ${res.estado?.toUpperCase() ?? '—'}.`)
    } else {
      Alert.alert('Foto no válida', res.mensaje ?? 'No se pudo validar la foto.')
    }
  }, [validarFoto])

  const abrirDetalle = useCallback((socio: SocioItem) => {
    setDetalle(socio)
    void fetchServiciosSocio(socio.id)
  }, [fetchServiciosSocio])

  const handleToggleServicio = useCallback((servicioId: string, agregar: boolean) => {
    if (!detalle) return
    void toggleServicio(detalle.id, servicioId, agregar)
  }, [detalle, toggleServicio])

  // ── Detalle ──────────────────────────────────────────────────────────────
  if (detalle) {
    const actualizado = socios.find(x => x.id === detalle.id) ?? detalle
    return (
      <View style={[ss.root, { paddingTop: insets.top }]}>
        <DetalleSocio
          socio={actualizado}
          categorias={categorias}
          servicios={servicios}
          serviciosSocio={serviciosSocio}
          fotoSignedUrl={fotoSignedUrl}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onValidarFoto={handleValidarFoto}
          onToggleServicio={handleToggleServicio}
          onRegistrarPago={(periodo, monto, formaPago) =>
            registrarPagoManual(actualizado.id, periodo, monto, formaPago)
          }
          onAssociateCard={(data) => associateCard(actualizado.id, data)}
          onRemoveCard={() => removeCard(actualizado.id)}
          onChargeCard={(periodo) => chargeCard(actualizado.id, periodo)}
          onClose={() => setDetalle(null)}
        />
      </View>
    )
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  return (
    <View style={ss.root}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <View style={ss.edicionBar}>
          <Text style={ss.edicionLabel}>SECRETARÍA · SOCIOS</Text>
          <Text style={ss.edicionFecha}>{socios.length} EN VISTA</Text>
        </View>

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={ss.filtrosContent}
          style={ss.filtrosBar}
        >
          {FILTROS.map(f => (
            <TouchableOpacity
              key={f}
              style={[ss.filtroBtn, filtro === f && ss.filtroBtnActive]}
              onPress={() => setFiltro(f as Filtro)}
              activeOpacity={0.75}
            >
              <Text style={[ss.filtroBtnText, filtro === f && ss.filtroBtnTextActive]}>
                {f === 'todos' ? 'TODOS' : ESTADO_LABEL[f] ?? f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.oro} style={ss.activityIndicator} />
      ) : socios.length === 0 ? (
        <View style={ss.empty}>
          <Text style={ss.emptyText}>No hay socios en esta vista.</Text>
        </View>
      ) : (
        <FlatList
          ref={scrollRef}
          data={socios}
          keyExtractor={item => item.id}
          contentContainerStyle={ss.listContent}
          renderItem={({ item }) => (
            <SocioRow socio={item} onPress={() => abrirDetalle(item)} />
          )}
        />
      )}

      <TouchableOpacity style={ss.fab} onPress={() => setModalNuevo(true)} activeOpacity={0.85}>
        <Feather name="plus" size={22} color={colors.tinta} />
      </TouchableOpacity>

      <ModalNuevoSocio
        visible={modalNuevo}
        categorias={categorias}
        creando={creando}
        onClose={() => setModalNuevo(false)}
        onCreate={handleCrear}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root:             { flex: 1, backgroundColor: FONDO },
  activityIndicator:{ marginTop: 40 },
  listContent:      { paddingHorizontal: 20, paddingBottom: 100 },

  edicionBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.tinta,
  },
  edicionLabel: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },
  edicionFecha: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.grisClaro,
  },

  filtrosBar:     { borderBottomWidth: 1, maxHeight: 46, backgroundColor: CARD, borderBottomColor: DIVIDER },
  filtrosContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filtroBtn:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 2 },
  filtroBtnActive:{ borderBottomWidth: 2, borderBottomColor: colors.oro },
  filtroBtnText: {
    fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5,
    textTransform: 'uppercase', color: '#888',
  },
  filtroBtnTextActive: { color: colors.oro },

  socioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  socioNum:    { fontFamily: fonts.titulo, fontSize: 18, width: 44, textAlign: 'right', color: colors.oroHondo },
  socioInfo:   { flex: 1 },
  socioNombre: { fontFamily: fonts.cuerpo, fontSize: 14, color: TEXTO },
  socioCat:    { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, marginTop: 2, color: MUTED },
  estadoBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  estadoBadgeText: { fontFamily: fonts.label, fontSize: 10, color: colors.blanco, fontWeight: 'bold' },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.oro,
    alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },

  // Modal overlay
  kavOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  backdrop:   { flex: 1 },

  // Modal
  modal: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '90%', backgroundColor: CARD,
  },
  modalContent: {
    padding: 24, paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: TEXTO,
  },
  inputLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginTop: 12, color: MUTED },
  inputLabelMt: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', marginTop: 14, color: MUTED },
  input: {
    fontFamily: fonts.cuerpo, fontSize: 16, color: TEXTO,
    borderBottomWidth: 1, borderBottomColor: colors.oro, paddingVertical: 8, marginBottom: 4,
  },
  categoriasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  catBtn: {
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2,
  },
  catBtnActivo:         { borderColor: colors.oro, backgroundColor: colors.tinta },
  catBtnInactivo:       { borderColor: DIVIDER, backgroundColor: 'transparent' },
  catBtnText:           { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
  catBtnTextActivo:     { color: colors.oro },
  catBtnTextInactivo:   { color: TEXTO },
  catMonto:             { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic' },
  catMontoActivo:       { color: colors.grisClaro },
  catMontoInactivo:     { color: MUTED },
  catVacio:             { fontFamily: fonts.cuerpo, fontSize: 12, fontStyle: 'italic', marginTop: 8, color: MUTED },
  crearBtn: {
    backgroundColor: colors.tinta, paddingVertical: 16,
    alignItems: 'center', borderRadius: 4, marginTop: 20, marginBottom: 8,
  },
  crearBtnOff: { opacity: 0.5 },
  crearBtnText: {
    fontFamily: fonts.label, fontSize: 11, letterSpacing: 2,
    textTransform: 'uppercase', color: colors.oro,
  },

  // Pago modal
  pagoSocioNombre: {
    fontFamily: fonts.cuerpo, fontSize: 13, fontStyle: 'italic', marginBottom: 4, color: MUTED,
  },
  formaPagoRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  formaPagoBtn: {
    flex: 1, borderWidth: 1, borderRadius: 4,
    paddingVertical: 10, alignItems: 'center',
  },
  formaPagoBtnActivo:       { borderColor: colors.oro, backgroundColor: colors.tinta },
  formaPagoBtnInactivo:     { borderColor: DIVIDER, backgroundColor: 'transparent' },
  formaPagoBtnText:         { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  formaPagoBtnTextActivo:   { color: colors.oro },
  formaPagoBtnTextInactivo: { color: TEXTO },

  // Tarjeta row (3-col expiry/cvv)
  tarjetaRow: { flexDirection: 'row', gap: 12 },
  tarjetaCol: { flex: 1 },

  // Detalle
  detalle:            { flex: 1 },
  detalleBar:         { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  backBtn:            { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText:           { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: TEXTO },
  detalleScrollContent: { padding: 20, gap: 16 },

  fotoDetalle:     { width: 120, height: 150, borderRadius: 6, alignSelf: 'center' },
  fotoPlaceholder: { borderWidth: 1, borderColor: DIVIDER, alignItems: 'center', justifyContent: 'center', gap: 8 },
  verFotoText:     { fontFamily: fonts.label, fontSize: 8, letterSpacing: 1.5, color: MUTED },

  detalleNombre: { fontFamily: fonts.titulo, fontSize: 28, marginBottom: 2, color: TEXTO },
  detalleNum:    { fontFamily: fonts.label, fontSize: 11, letterSpacing: 2, color: colors.oroHondo },

  dataRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  dataLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: MUTED },
  dataValue: { fontFamily: fonts.cuerpo, fontSize: 13, color: TEXTO },

  // Servicios
  serviciosSection: { gap: 10, marginTop: 4 },
  serviciosTitulo: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: MUTED,
  },
  serviciosGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  servicioChip:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  servicioChipActivo:   { backgroundColor: colors.tinta, borderColor: colors.tinta },
  servicioChipInactivo: { backgroundColor: 'transparent', borderColor: DIVIDER },
  servicioChipNombre:         { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
  servicioChipNombreActivo:   { color: colors.oro },
  servicioChipNombreInactivo: { color: TEXTO },
  servicioChipMonto:          { fontFamily: fonts.cuerpo, fontSize: 11, fontStyle: 'italic' },
  servicioChipMontoActivo:    { color: colors.grisClaro },
  servicioChipMontoInactivo:  { color: MUTED },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: DIVIDER,
  },
  totalLabel: { fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, color: MUTED },
  totalMonto: { fontFamily: fonts.titulo, fontSize: 20, color: TEXTO },

  // Tarjeta section
  tarjetaSection: { gap: 8, marginTop: 4 },
  tarjetaTitulo: {
    fontFamily: fonts.label, fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: MUTED,
  },
  tarjetaCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 4, padding: 14,
    backgroundColor: colors.tinta, borderColor: DIVIDER,
  },
  tarjetaCardInfo: { flex: 1 },
  tarjetaNumero:   { fontFamily: fonts.cuerpo, fontSize: 14, color: TEXTO },
  tarjetaBrand:    { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1, marginTop: 2, color: MUTED },
  tarjetaVacia:    { fontFamily: fonts.cuerpo, fontSize: 12, fontStyle: 'italic', color: MUTED },

  acciones: { gap: 10, marginTop: 8 },
  accionBtn: {
    borderWidth: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4,
  },
  accionBtnVerde:    { borderColor: '#2ECC71' },
  accionBtnOro:      { borderColor: colors.oro },
  accionBtnRojo:     { borderColor: colors.rojoUrgente },
  accionBtnText:     { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  accionBtnTextVerde:{ color: '#2ECC71' },
  accionBtnTextOro:  { color: colors.oro },
  accionBtnTextRojo: { color: colors.rojoUrgente },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: fonts.cuerpo, fontSize: 14, fontStyle: 'italic', color: MUTED },
})
