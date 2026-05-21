import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native'
import { useUsuarios, rolLabel } from '@/hooks/useUsuarios'
import type { Usuario, RolCreable, DivisionOpcion } from '@/hooks/useUsuarios'
import { useTheme } from '@/contexts/ThemeContext'

const CREAM = '#F5F0E8'
const GOLD  = '#C9A84C'
const DARK  = '#1A1A1A'
const MUTED = '#888888'
const CARD  = '#FFFFFF'
const ROJO  = '#EF4444'
const VERDE = '#22C55E'

const ROL_COLOR: Record<string, string> = {
  subcomision: '#7C3AED',
  coordinador: '#2563EB',
  entrenador:  '#059669',
  manager:     '#D97706',
  admin:       '#DC2626',
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UsuariosScreen() {
  const hook = useUsuarios()
  const { colors: tc } = useTheme()

  if (hook.loading) {
    return (
      <View style={[s.centrado, { backgroundColor: tc.fondo }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    )
  }

  if (hook.paso === 'detalle' && hook.usuarioSeleccionado) {
    return <VistaDetalle hook={hook} />
  }

  return <VistaLista hook={hook} />
}

// ─── Vista lista ──────────────────────────────────────────────────────────────

function VistaLista({ hook }: { hook: ReturnType<typeof useUsuarios> }) {
  const { colors: tc } = useTheme()
  const activos   = hook.usuarios.filter(u => u.activo)
  const inactivos = hook.usuarios.filter(u => !u.activo)

  return (
    <View style={[s.root, { backgroundColor: tc.fondo }]}>
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <Text style={s.headerTitle}>Usuarios</Text>
        <Text style={s.headerSub}>{activos.length} activos · {inactivos.length} inactivos</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {hook.usuarios.length === 0 ? (
          <Text style={s.vacio}>Sin usuarios registrados.</Text>
        ) : (
          hook.usuarios.map(u => (
            <UsuarioFila key={u.id} usuario={u} onPress={() => hook.seleccionarUsuario(u)} />
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={hook.abrirModal} activeOpacity={0.85}>
        <Text style={s.fabTexto}>+ Nuevo usuario</Text>
      </TouchableOpacity>

      <ModalNuevoUsuario hook={hook} />
    </View>
  )
}

function UsuarioFila({ usuario, onPress }: { usuario: Usuario; onPress: () => void }) {
  const { colors: tc } = useTheme()
  const color = ROL_COLOR[usuario.rol] ?? MUTED
  const inicial = usuario.nombre.charAt(0).toUpperCase()

  return (
    <TouchableOpacity style={[s.card, { backgroundColor: tc.card }, !usuario.activo && s.cardInactivo]} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.avatar, { backgroundColor: color + '22' }]}>
        <Text style={[s.avatarLetra, { color }]}>{inicial}</Text>
      </View>
      <View style={s.filaInfo}>
        <Text style={[s.cardNombre, { color: tc.tinta }, !usuario.activo && s.textoInactivo]}>{usuario.nombre}</Text>
        <View style={s.rolFila}>
          <View style={[s.rolBadge, { backgroundColor: color + '22', borderColor: color }]}>
            <Text style={[s.rolTexto, { color }]}>{rolLabel(usuario.rol)}</Text>
          </View>
          {!usuario.activo && (
            <View style={s.inactivoBadge}>
              <Text style={s.inactivoTexto}>INACTIVO</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  )
}

// ─── Vista detalle ────────────────────────────────────────────────────────────

function VistaDetalle({ hook }: { hook: ReturnType<typeof useUsuarios> }) {
  const { colors: tc } = useTheme()
  const u     = hook.usuarioSeleccionado!
  const color  = ROL_COLOR[u.rol] ?? MUTED
  const inicial = u.nombre.charAt(0).toUpperCase()

  function confirmarEliminar() {
    Alert.alert(
      '¿Estás seguro?',
      `Vas a eliminar a ${u.nombre} permanentemente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Última confirmación',
              'Esta acción no se puede deshacer.',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar definitivamente', style: 'destructive', onPress: hook.eliminarUsuario },
              ],
            ),
        },
      ],
    )
  }

  return (
    <View style={[s.root, { backgroundColor: tc.fondo }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={hook.volverALista} style={s.backBtn}>
          <Text style={s.backTexto}>‹ Usuarios</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Detalle</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Info del usuario */}
        <View style={[s.detalleCard, { backgroundColor: tc.card }]}>
          <View style={[s.avatarGrande, { backgroundColor: color + '22' }]}>
            <Text style={[s.avatarLetraGrande, { color }]}>{inicial}</Text>
          </View>
          <Text style={[s.detalleNombre, { color: tc.tinta }]}>{u.nombre}</Text>
          {hook.cargandoEmail ? (
            <ActivityIndicator size="small" color={GOLD} />
          ) : hook.emailUsuario ? (
            <Text style={s.detalleEmail}>{hook.emailUsuario}</Text>
          ) : null}
          <View style={[s.rolBadge, { backgroundColor: color + '22', borderColor: color, alignSelf: 'center', marginTop: 6 }]}>
            <Text style={[s.rolTexto, { color }]}>{rolLabel(u.rol)}</Text>
          </View>
          <View style={[s.estadoBadge, { backgroundColor: u.activo ? VERDE + '22' : ROJO + '22', marginTop: 8 }]}>
            <Text style={[s.estadoTexto, { color: u.activo ? VERDE : ROJO }]}>
              {u.activo ? 'ACTIVO' : 'INACTIVO'}
            </Text>
          </View>
        </View>

        {/* Divisiones editables */}
        <View style={[s.seccionDetalle, { backgroundColor: tc.card }]}>
          <Text style={s.seccionLabel}>DIVISIONES ASIGNADAS</Text>
          <DivisionesMultiselect
            divisiones={hook.divisiones}
            seleccionadas={hook.divisionesEditDetalle}
            onToggle={hook.toggleDivisionDetalle}
          />
          {hook.divisionesGuardadasOk && (
            <View style={[s.bannerOk, { marginTop: 8 }]}>
              <Text style={[s.bannerTexto, { color: tc.tinta }]}>✓ Divisiones actualizadas.</Text>
            </View>
          )}
          {hook.guardandoDivisiones ? (
            <ActivityIndicator color={GOLD} style={{ marginTop: 12 }} />
          ) : (
            <TouchableOpacity
              style={s.botonGuardar}
              onPress={hook.guardarDivisiones}
              activeOpacity={0.8}
            >
              <Text style={s.botonGuardarTexto}>GUARDAR CAMBIOS</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Feedback estado */}
        {hook.estadoCambiadoOk && (
          <View style={s.bannerOk}>
            <Text style={[s.bannerTexto, { color: tc.tinta }]}>
              {hook.usuarioSeleccionado?.activo ? '✓ Usuario reactivado.' : '✓ Usuario desactivado.'}
            </Text>
          </View>
        )}
        {hook.errorEstado && (
          <View style={s.bannerError}>
            <Text style={[s.bannerTexto, { color: tc.tinta }]}>{hook.errorEstado}</Text>
          </View>
        )}

        {/* Acción estado */}
        {hook.cambiandoEstado ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 16 }} />
        ) : u.activo ? (
          <TouchableOpacity
            style={s.botonPeligro}
            onPress={() => hook.cambiarEstado('deactivate')}
            activeOpacity={0.8}
          >
            <Text style={s.botonPeligroTexto}>Desactivar usuario</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.botonOk}
            onPress={() => hook.cambiarEstado('reactivate')}
            activeOpacity={0.8}
          >
            <Text style={s.botonOkTexto}>Reactivar usuario</Text>
          </TouchableOpacity>
        )}

        {/* Eliminar — doble confirmación */}
        {hook.eliminando ? (
          <ActivityIndicator color={ROJO} style={{ marginTop: 8 }} />
        ) : (
          <TouchableOpacity
            style={s.botonEliminar}
            onPress={confirmarEliminar}
            activeOpacity={0.8}
          >
            <Text style={s.botonEliminarTexto}>ELIMINAR USUARIO</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

// ─── Modal nuevo usuario ──────────────────────────────────────────────────────

const ROLES_CREABLES: { value: RolCreable; label: string }[] = [
  { value: 'coordinador', label: 'Coordinador' },
  { value: 'entrenador',  label: 'Entrenador'  },
  { value: 'manager',     label: 'Manager'     },
]

function ModalNuevoUsuario({ hook }: { hook: ReturnType<typeof useUsuarios> }) {
  const { colors: tc } = useTheme()
  return (
    <Modal visible={hook.modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={hook.cerrarModal}>
      <KeyboardAvoidingView style={[s.modalRoot, { backgroundColor: tc.fondo }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitulo}>Nuevo usuario</Text>
          <TouchableOpacity onPress={hook.cerrarModal}>
            <Text style={s.modalCerrar}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
          {hook.creadoOk ? (
            <View style={s.bannerOk}>
              <Text style={[s.bannerTexto, { color: tc.tinta }]}>✓ Usuario creado. Se envió un email de invitación.</Text>
            </View>
          ) : (
            <>
              {/* Nombre */}
              <Text style={[s.inputLabel, { color: tc.tinta }]}>Nombre completo</Text>
              <TextInput
                style={[s.input, { color: tc.tinta, backgroundColor: tc.card }]}
                value={hook.nombre}
                onChangeText={hook.setNombre}
                placeholder="Ej: Juan Pérez"
                placeholderTextColor={MUTED}
                autoCapitalize="words"
              />

              {/* Email */}
              <Text style={[s.inputLabel, { color: tc.tinta }]}>Email</Text>
              <TextInput
                style={[s.input, { color: tc.tinta, backgroundColor: tc.card }]}
                value={hook.email}
                onChangeText={hook.setEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={MUTED}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Rol */}
              <Text style={[s.inputLabel, { color: tc.tinta }]}>Rol</Text>
              <View style={s.rolSelector}>
                {ROLES_CREABLES.map(r => (
                  <TouchableOpacity
                    key={r.value}
                    style={[s.rolBtn, hook.rolSeleccionado === r.value && s.rolBtnActivo]}
                    onPress={() => hook.setRolSeleccionado(r.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.rolBtnTexto, hook.rolSeleccionado === r.value && s.rolBtnTextoActivo]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Divisiones */}
              <Text style={[s.inputLabel, { color: tc.tinta }]}>Divisiones asignadas</Text>
              <DivisionesMultiselect
                divisiones={hook.divisiones}
                seleccionadas={hook.divisionesSeleccionadas}
                onToggle={hook.toggleDivision}
              />

              {/* Error */}
              {hook.errorForm && (
                <View style={s.bannerError}>
                  <Text style={[s.bannerTexto, { color: tc.tinta }]}>{hook.errorForm}</Text>
                </View>
              )}

              {/* Botón crear */}
              <TouchableOpacity
                style={[s.botonPrimario, hook.creando && s.botonDesactivado]}
                onPress={hook.crearUsuario}
                disabled={hook.creando}
                activeOpacity={0.8}
              >
                {hook.creando ? (
                  <ActivityIndicator color={DARK} />
                ) : (
                  <Text style={s.botonPrimarioTexto}>Crear usuario</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function DivisionesMultiselect({
  divisiones,
  seleccionadas,
  onToggle,
}: {
  divisiones: DivisionOpcion[]
  seleccionadas: string[]
  onToggle: (id: string) => void
}) {
  const { colors: tc } = useTheme()
  if (divisiones.length === 0) {
    return <Text style={s.vacio}>Sin divisiones disponibles.</Text>
  }
  return (
    <View style={s.divisionesGrid}>
      {divisiones.map(d => {
        const activa = seleccionadas.includes(d.id)
        return (
          <TouchableOpacity
            key={d.id}
            style={[s.divPill, activa && s.divPillActiva]}
            onPress={() => onToggle(d.id)}
            activeOpacity={0.7}
          >
            <Text style={[s.divPillTexto, !activa && { color: MUTED }, activa && s.divPillTextoActivo, activa && { color: tc.tinta }]} numberOfLines={1}>
              {d.nombre}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: CREAM },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: CREAM },

  // Header
  header:      { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: DARK },
  headerLabel: { fontSize: 10, letterSpacing: 2.5, color: GOLD, marginBottom: 4 },
  headerTitle: { fontSize: 28, fontStyle: 'italic', fontFamily: 'serif', color: '#FFFFFF' },
  headerSub:   { fontSize: 12, color: '#AAAAAA', marginTop: 4 },
  backBtn:     { marginBottom: 4 },
  backTexto:   { color: GOLD, fontSize: 14 },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 10 },
  vacio:         { color: MUTED, fontStyle: 'italic', fontSize: 13, padding: 8 },

  // Lista — card de usuario
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 10, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardInactivo: { opacity: 0.55 },
  avatar:       { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarLetra:  { fontSize: 18, fontWeight: '700' },
  filaInfo:     { flex: 1 },
  cardNombre:   { fontSize: 15, fontWeight: '600', color: DARK, marginBottom: 4 },
  textoInactivo: { color: MUTED },
  rolFila:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolBadge:     { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  rolTexto:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  inactivoBadge: { backgroundColor: ROJO + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  inactivoTexto: { color: ROJO, fontSize: 10, fontWeight: '700' },
  chevron:       { color: MUTED, fontSize: 22 },

  // Detalle
  detalleCard:        { backgroundColor: CARD, borderRadius: 12, padding: 24, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  avatarGrande:       { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarLetraGrande:  { fontSize: 28, fontWeight: '700' },
  detalleNombre:      { fontSize: 20, fontWeight: '700', color: DARK },
  detalleEmail:       { fontSize: 13, color: MUTED, marginTop: 2 },
  estadoBadge:        { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  estadoTexto:        { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  seccionDetalle:     { marginTop: 8, backgroundColor: CARD, borderRadius: 10, padding: 16, gap: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  seccionLabel:       { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 4 },
  botonGuardar:       { backgroundColor: GOLD, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  botonGuardarTexto:  { color: DARK, fontWeight: '700', fontSize: 13, letterSpacing: 1 },

  // Feedback banners
  bannerOk:    { backgroundColor: VERDE + '22', borderRadius: 8, padding: 12 },
  bannerError: { backgroundColor: ROJO   + '22', borderRadius: 8, padding: 12 },
  bannerTexto: { fontSize: 13, color: DARK },

  // Botones de acción
  botonPeligro:      { backgroundColor: ROJO,  borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  botonPeligroTexto: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  botonOk:           { backgroundColor: VERDE, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  botonOkTexto:      { color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  botonEliminar:     { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16, borderWidth: 1.5, borderColor: ROJO },
  botonEliminarTexto: { color: ROJO, fontWeight: '700', fontSize: 14, letterSpacing: 1 },

  // FAB
  fab:      { position: 'absolute', bottom: 24, right: 20, backgroundColor: GOLD, borderRadius: 30, paddingHorizontal: 20, paddingVertical: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabTexto: { color: DARK, fontWeight: '700', fontSize: 14 },

  // Modal
  modalRoot:   { flex: 1, backgroundColor: CREAM },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, backgroundColor: DARK },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  modalCerrar: { fontSize: 20, color: GOLD, fontWeight: '600' },
  modalBody:   { padding: 20, gap: 12, paddingBottom: 48 },

  // Inputs
  inputLabel: { fontSize: 12, fontWeight: '600', color: DARK, letterSpacing: 0.5, textTransform: 'uppercase' },
  input:      { backgroundColor: CARD, borderRadius: 8, borderWidth: 1, borderColor: '#E0D8CC', padding: 12, fontSize: 15, color: DARK },

  // Selector de rol
  rolSelector: { flexDirection: 'row', gap: 8 },
  rolBtn:      { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: CARD, borderWidth: 1.5, borderColor: '#E0D8CC', alignItems: 'center' },
  rolBtnActivo: { backgroundColor: GOLD, borderColor: GOLD },
  rolBtnTexto:  { fontSize: 12, fontWeight: '600', color: MUTED },
  rolBtnTextoActivo: { color: DARK },

  // Divisiones multiselect
  divisionesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divPill:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: CARD, borderWidth: 1.5, borderColor: '#E0D8CC', maxWidth: '48%' },
  divPillActiva:  { backgroundColor: GOLD + '33', borderColor: GOLD },
  divPillTexto:   { fontSize: 12, color: MUTED, fontWeight: '500' },
  divPillTextoActivo: { color: DARK, fontWeight: '600' },

  // Botón primario
  botonPrimario:      { backgroundColor: GOLD, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  botonDesactivado:   { opacity: 0.6 },
  botonPrimarioTexto: { color: DARK, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
})
