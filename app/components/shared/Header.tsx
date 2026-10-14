import { useEffect, useState } from 'react'
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter, useSegments, type Href } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'
import { inicialesNombre, rutaPerfil } from '@/lib/perfilAvatar'
import { usePerfilAvatar } from '@/lib/perfilAvatarStore'

// Botón de "Mi perfil" arriba a la derecha (auditoría UX, T7): reemplaza la
// pestaña Perfil en los roles donde todas las pantallas muestran este Header.
function AvatarPerfil() {
  const { colors: tc } = useTheme()
  const router   = useRouter()
  const segments = useSegments()
  const ruta     = rutaPerfil(segments)
  const { nombre, fotoUrl } = usePerfilAvatar()
  const iniciales = inicialesNombre(nombre)
  // URL firmada vencida o archivo local borrado: se cae a iniciales / ícono
  const [fotoFallo, setFotoFallo] = useState(false)
  useEffect(() => { setFotoFallo(false) }, [fotoUrl])

  if (!ruta) return null

  return (
    <TouchableOpacity
      onPress={() => router.navigate(ruta as Href)}
      accessibilityRole="button"
      accessibilityLabel="Mi perfil"
      activeOpacity={0.8}
      style={[styles.avatar, { backgroundColor: tc.card, borderColor: tc.oroHondo }]}
    >
      {fotoUrl && !fotoFallo ? (
        <Image source={{ uri: fotoUrl }} style={styles.avatarFoto} onError={() => setFotoFallo(true)} />
      ) : iniciales ? (
        <Text style={[styles.avatarIniciales, { color: tc.texto }]}>{iniciales}</Text>
      ) : (
        <Feather name="user" size={20} color={tc.texto} />
      )}
    </TouchableOpacity>
  )
}

export function Header() {
  const { colors: tc } = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: tc.fondo }]}>
      <View style={styles.row}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.textBlock}>
          <Text style={[styles.clubName, { color: tc.texto }]}>UNCAS RUGBY CLUB</Text>
          <Text style={[styles.titulo, { color: tc.texto }]}>Uncas Rugby App</Text>
        </View>
        <AvatarPerfil />
      </View>
      <View style={[styles.divider, { backgroundColor: tc.grisClaro }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  logo: {
    width: 44,
    height: 44,
  },
  textBlock: {
    flex: 1,
  },
  clubName: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 23,
    lineHeight: 26,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFoto: {
    width: '100%',
    height: '100%',
  },
  avatarIniciales: {
    fontFamily: fonts.label,
    fontSize: 15,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
  },
})
