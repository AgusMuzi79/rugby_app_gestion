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
import { useRef } from 'react'
import { useScrollToTop } from '@react-navigation/native'
import { useUsuarios, rolLabel } from '@/hooks/useUsuarios'
import type { Usuario, RolCreable, DivisionOpcion } from '@/hooks/useUsuarios'
import { useAuthStore } from '@/stores/authStore'
import { colors, fonts } from '@/constants/theme'

const MUTED = '#8E8574'
const ROJO  = '#EF4444'
const VERDE = '#22C55E'

const ROL_COLOR: Record<string, string> = {
  subcomision: '#7C3AED',
  coordinador: '#2563EB',
  entrenador:  '#059669',
  manager:     '#D97706',
  secretaria:  '#0891B2',
  porteria:    '#65A30D',
  admin:       '#DC2626',
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function UsuariosScreen() {
  const hook = useUsuarios()

  if (hook.loading) {
    return (
      <View style={s.centrado}>
        <ActivityIndicator size="large" color={colors.oro} />
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
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const activos   = hook.usuarios.filter(u => u.activo)
  const inactivos = hook.usuarios.filter(u => !u.activo)

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerLabel}>SUBCOMISIÓN</Text>
        <Text style={s.headerTitle}>Usuarios</Text>
        <Text style={s.headerSub}>{activos.length} activos · {inactivos.length} inactivos</Text>
      </View>

      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
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
  // color + '22' is dynamic (varies by role) — must remain inline
  const color = ROL_COLOR[usuario.rol] ?? MUTED
  const inicial = usuario.nombre.charAt(0).toUpperCase()

  return (
    <TouchableOpacity style={[s.card, !usuario.activo && s.cardInactivo]} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.avatar, { backgroundColor: color + '22' }]}>
        <Text style={[s.avatarLetra, { color }]}>{inicial}</Text>
      </View>
      <View style={s.filaInfo}>
        <Text style={[s.cardNombre, !usuario.activo && s.textoInactivo]}>{usuario.nombre}</Text>
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
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={hook.volverALista} style={s.backBtn}>
          <Text style={s.backTexto}>‹ Usuarios</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Detalle</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Info del usuario */}
        <View style={s.detalleCard}>
          {/* color + '22' for avatar bg — dynamic by role, must remain inline */}
          <View style={[s.avatarGrande, { backgroundColor: color + '22' }]}>
            <Text style={[s.avatarLetraGrande, { color }]}>{inicial}</Text>
          </View>
          <Text style={s.detalleNombre}>{u.nombre}</Text>
          {hook.cargandoEmail ? (
            <ActivityIndicator size="small" color={colors.oro} />
          ) : hook.emailUsuario ? (
            <Text style={s.detalleEmail}>{hook.emailUsuario}</Text>
          ) : null}
          {/* rolBadge with dynamic color */}
          <View style={[s.rolBadge, s.rolBadgeCenter, { backgroundColor: color + '22', borderColor: color }]}>
            <Text style={[s.rolTexto, { color }]}>{rolLabel(u.rol)}</Text>
          </View>
          {/* estadoBadge with dynamic color — VERDE + '22' or ROJO + '22' */}
          <View style={[s.estadoBadge, { backgroundColor: u.activo ? VERDE + '22' : ROJO + '22' }]}>
            <Text style={[s.estadoTexto, { color: u.activo ? VERDE : ROJO }]}>
              {u.activo ? 'ACTIVO' : 'INACTIVO'}
            </Text>
          </View>
        </View>

        {/* Divisiones editables */}
        <View style={s.seccionDetalle}>
          <Text style={s.seccionLabel}>DIVISIONES ASIGNADAS</Text>
          <DivisionesMultiselect
            divisiones={hook.divisiones}
            seleccionadas={hook.divisionesEditDetalle}
            onToggle={hook.toggleDivisionDetalle}
          />
          {hook.divisionesGuardadasOk && (
            <View style={s.bannerOkMt}>
              <Text style={s.bannerTexto}>✓ Divisiones actualizadas.</Text>
            </View>
          )}
          {hook.guardandoDivisiones ? (
            <ActivityIndicator color={colors.oro} style={s.activityMt12} />
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
            <Text style={s.bannerTexto}>
              {hook.usuarioSeleccionado?.activo ? '✓ Usuario reactivado.' : '✓ Usuario desactivado.'}
            </Text>
          </View>
        )}
        {hook.errorEstado && (
          <View style={s.bannerError}>
            <Text style={s.bannerTexto}>{hook.errorEstado}</Text>
          </View>
        )}

        {/* Acción estado */}
        {hook.cambiandoEstado ? (
          <ActivityIndicator color={colors.oro} style={s.activityMt16} />
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
          <ActivityIndicator color={ROJO} style={s.activityMt8} />
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

const ROLES_CREABLES_SUBCO: { value: RolCreable; label: string }[] = [
  { value: 'coordinador', label: 'Coordinador' },
  { value: 'entrenador',  label: 'Entrenador'  },
  { value: 'manager',     label: 'Manager'     },
  { value: 'subcomision', label: 'Subcomisión' },
]

const ROLES_CREABLES_ADMIN: { value: RolCreable; label: string }[] = [
  { value: 'coordinador', label: 'Coordinador' },
  { value: 'entrenador',  label: 'Entrenador'  },
  { value: 'manager',     label: 'Manager'     },
  { value: 'secretaria',  label: 'Secretaría'  },
  { value: 'porteria',    label: 'Portería'    },
  { value: 'subcomision', label: 'Subcomisión' },
]

function ModalNuevoUsuario({ hook }: { hook: ReturnType<typeof useUsuarios> }) {
  const { rol } = useAuthStore()
  const rolesCreables = rol === 'admin' ? ROLES_CREABLES_ADMIN : ROLES_CREABLES_SUBCO

  return (
    <Modal visible={hook.modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={hook.cerrarModal}>
      <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitulo}>Nuevo usuario</Text>
          <TouchableOpacity onPress={hook.cerrarModal}>
            <Text style={s.modalCerrar}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
          {hook.creadoOk ? (
            <View style={s.bannerOk}>
              <Text style={s.bannerTexto}>✓ Usuario creado. Puede ingresar con su email y DNI.</Text>
            </View>
          ) : (
            <>
              {/* Nombre */}
              <Text style={s.inputLabel}>Nombre completo</Text>
              <TextInput
                style={s.input}
                value={hook.nombre}
                onChangeText={hook.setNombre}
                placeholder="Ej: Juan Pérez"
                placeholderTextColor={MUTED}
                autoCapitalize="words"
              />

              {/* Email */}
              <Text style={s.inputLabel}>Email</Text>
              <TextInput
                style={s.input}
                value={hook.email}
                onChangeText={hook.setEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={MUTED}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* DNI */}
              <Text style={s.inputLabel}>DNI</Text>
              <TextInput
                style={s.input}
                value={hook.dni}
                onChangeText={hook.setDni}
                placeholder="Ej: 12345678"
                placeholderTextColor={MUTED}
                keyboardType="numeric"
              />

              {/* Rol */}
              <Text style={s.inputLabel}>Rol</Text>
              <View style={s.rolSelector}>
                {rolesCreables.map(r => (
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
              <Text style={s.inputLabel}>Divisiones asignadas</Text>
              <DivisionesMultiselect
                divisiones={hook.divisiones}
                seleccionadas={hook.divisionesSeleccionadas}
                onToggle={hook.toggleDivision}
              />

              {/* Error */}
              {hook.errorForm && (
                <View style={s.bannerError}>
                  <Text style={s.bannerTexto}>{hook.errorForm}</Text>
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
                  <ActivityIndicator color={colors.tinta} />
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
            <Text style={[s.divPillTexto, activa && s.divPillTextoActivo]} numberOfLines={1}>
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
  root:    { flex: 1, backgroundColor: '#15110A' },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#15110A' },

  activityMt8:  { marginTop: 8 },
  activityMt12: { marginTop: 12 },
  activityMt16: { marginTop: 16 },

  // Header
  header:      { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.tinta },
  headerLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 2.5, color: colors.oro, marginBottom: 4 },
  headerTitle: { fontFamily: fonts.titulo, fontSize: 28, color: colors.blanco },
  headerSub:   { fontFamily: fonts.cuerpo, fontSize: 12, color: '#8E8574', marginTop: 4 },
  backBtn:     { marginBottom: 4 },
  backTexto:   { fontFamily: fonts.label, color: colors.oro, fontSize: 14 },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100, gap: 10 },
  vacio:         { fontFamily: fonts.cuerpo, color: MUTED, fontStyle: 'italic', fontSize: 13, padding: 8 },

  // Lista — card de usuario
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1710', borderRadius: 10, padding: 14, gap: 12, borderWidth: 1, borderColor: '#2C2418' },
  cardInactivo: { opacity: 0.55 },
  avatar:       { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarLetra:  { fontFamily: fonts.titulo, fontSize: 18, fontWeight: '700' },
  filaInfo:     { flex: 1 },
  cardNombre:   { fontFamily: fonts.cuerpo, fontSize: 15, fontWeight: '600', color: colors.tinta, marginBottom: 4 },
  textoInactivo: { color: MUTED },
  rolFila:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolBadge:     { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  rolBadgeCenter: { alignSelf: 'center', marginTop: 6 },
  rolTexto:     { fontFamily: fonts.label, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  inactivoBadge: { backgroundColor: ROJO + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  inactivoTexto: { fontFamily: fonts.label, color: ROJO, fontSize: 10, fontWeight: '700' },
  chevron:       { fontFamily: fonts.titulo, color: MUTED, fontSize: 22 },

  // Detalle
  detalleCard:        { backgroundColor: '#1C1710', borderRadius: 12, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#2C2418' },
  avatarGrande:       { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarLetraGrande:  { fontFamily: fonts.titulo, fontSize: 28, fontWeight: '700' },
  detalleNombre:      { fontFamily: fonts.cuerpo, fontSize: 20, fontWeight: '700', color: colors.tinta },
  detalleEmail:       { fontFamily: fonts.cuerpo, fontSize: 13, color: MUTED, marginTop: 2 },
  estadoBadge:        { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  estadoTexto:        { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  seccionDetalle:     { marginTop: 8, backgroundColor: '#1C1710', borderRadius: 10, padding: 16, gap: 10, borderWidth: 1, borderColor: '#2C2418' },
  seccionLabel:       { fontFamily: fonts.label, fontSize: 10, fontWeight: '700', letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 4 },
  botonGuardar:       { backgroundColor: colors.oro, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  botonGuardarTexto:  { fontFamily: fonts.label, color: colors.tinta, fontWeight: '700', fontSize: 13, letterSpacing: 1 },

  // Feedback banners
  bannerOk:    { backgroundColor: VERDE + '22', borderRadius: 8, padding: 12 },
  bannerOkMt:  { backgroundColor: VERDE + '22', borderRadius: 8, padding: 12, marginTop: 8 },
  bannerError: { backgroundColor: ROJO   + '22', borderRadius: 8, padding: 12 },
  bannerTexto: { fontFamily: fonts.cuerpo, fontSize: 13, color: colors.tinta },

  // Botones de acción
  botonPeligro:      { backgroundColor: ROJO,  borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  botonPeligroTexto: { fontFamily: fonts.cuerpo, color: colors.blanco, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  botonOk:           { backgroundColor: VERDE, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  botonOkTexto:      { fontFamily: fonts.cuerpo, color: colors.blanco, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  botonEliminar:     { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16, borderWidth: 1.5, borderColor: ROJO },
  botonEliminarTexto: { fontFamily: fonts.label, color: ROJO, fontWeight: '700', fontSize: 14, letterSpacing: 1 },

  // FAB
  fab:      { position: 'absolute', bottom: 24, right: 20, backgroundColor: colors.oro, borderRadius: 30, paddingHorizontal: 20, paddingVertical: 14 },
  fabTexto: { fontFamily: fonts.label, color: colors.tinta, fontWeight: '700', fontSize: 14 },

  // Modal
  modalRoot:   { flex: 1, backgroundColor: '#15110A' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 24, backgroundColor: colors.tinta },
  modalTitulo: { fontFamily: fonts.titulo, fontSize: 18, fontWeight: '700', color: colors.blanco },
  modalCerrar: { fontFamily: fonts.titulo, fontSize: 20, color: colors.oro, fontWeight: '600' },
  modalBody:   { padding: 20, gap: 12, paddingBottom: 48 },

  // Inputs
  inputLabel: { fontFamily: fonts.label, fontSize: 12, fontWeight: '600', color: colors.tinta, letterSpacing: 0.5, textTransform: 'uppercase' },
  input:      { backgroundColor: '#1C1710', borderRadius: 8, borderWidth: 1, borderColor: '#2C2418', padding: 12, fontFamily: fonts.cuerpo, fontSize: 15, color: colors.tinta },

  // Selector de rol
  rolSelector: { flexDirection: 'row', gap: 8 },
  rolBtn:      { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1C1710', borderWidth: 1.5, borderColor: '#2C2418', alignItems: 'center' },
  rolBtnActivo: { backgroundColor: colors.oro, borderColor: colors.oro },
  rolBtnTexto:  { fontFamily: fonts.label, fontSize: 12, fontWeight: '600', color: MUTED },
  rolBtnTextoActivo: { color: colors.tinta },

  // Divisiones multiselect
  divisionesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divPill:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1C1710', borderWidth: 1.5, borderColor: '#2C2418', maxWidth: '48%' },
  divPillActiva:  { backgroundColor: colors.oro + '33', borderColor: colors.oro },
  divPillTexto:   { fontFamily: fonts.cuerpo, fontSize: 12, color: MUTED, fontWeight: '500' },
  divPillTextoActivo: { color: colors.tinta, fontWeight: '600' },

  // Botón primario
  botonPrimario:      { backgroundColor: colors.oro, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  botonDesactivado:   { opacity: 0.6 },
  botonPrimarioTexto: { fontFamily: fonts.label, color: colors.tinta, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
})
