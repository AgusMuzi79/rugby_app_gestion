import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// expo-notifications no soporta push remoto en Expo Go desde SDK 53.
// Solo importamos y configuramos si corremos en un dev build o producción.
const isExpoGo = Constants.appOwnership === 'expo'

if (!isExpoGo) {
  // Importación dinámica para evitar que el módulo registre listeners en Expo Go
  import('expo-notifications').then((Notifications) => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert:  true,
        shouldPlaySound:  true,
        shouldSetBadge:   true,
        shouldShowBanner: true,
        shouldShowList:   true,
      }),
    })
  })
}

export async function registerPushToken(): Promise<void> {
  console.log('[push] registerPushToken() invocado')
  console.log('[push] Platform.OS:', Platform.OS)
  console.log('[push] isExpoGo:', isExpoGo)

  if (Platform.OS === 'web') {
    console.log('[push] Saliendo: plataforma web')
    return
  }
  if (isExpoGo) {
    console.log('[push] Saliendo: Expo Go detectado (push no soportado)')
    return
  }

  try {
    console.log('[push] Importando expo-notifications...')
    const Notifications = await import('expo-notifications')
    console.log('[push] expo-notifications importado OK')

    const { status: existing } = await Notifications.getPermissionsAsync()
    console.log('[push] Permiso existente:', existing)

    const { status } = existing !== 'granted'
      ? await Notifications.requestPermissionsAsync()
      : { status: existing }
    console.log('[push] Permiso final:', status)

    if (status !== 'granted') {
      console.log('[push] Saliendo: permiso denegado')
      return
    }

    if (Platform.OS === 'android') {
      console.log('[push] Configurando canal Android...')
      await Notifications.setNotificationChannelAsync('default', {
        name:              'Notificaciones del Club',
        importance:        Notifications.AndroidImportance.MAX,
        vibrationPattern:  [0, 250, 250, 250],
        lightColor:        '#C9A84C',
      })
      console.log('[push] Canal Android configurado OK')
    }

    console.log('[push] Obteniendo Expo push token...')
    const tokenResult = await Notifications.getExpoPushTokenAsync()
    const pushToken   = tokenResult.data
    console.log('[push] Token obtenido:', pushToken)

    const { data: { user } } = await supabase.auth.getUser()
    console.log('[push] Usuario autenticado:', user?.id ?? 'null')
    if (!user) {
      console.log('[push] Saliendo: no hay usuario autenticado')
      return
    }

    console.log('[push] Guardando token en push_tokens...')
    // Eliminar entrada previa del token (puede pertenecer a otro usuario/sesión)
    await supabase.from('push_tokens').delete().eq('token', pushToken)
    const { error } = await supabase
      .from('push_tokens')
      .insert({ usuario_id: user.id, token: pushToken, plataforma: Platform.OS })
    if (error) {
      console.log('[push] Error al guardar token:', error.message)
    } else {
      console.log('[push] Token guardado OK')
    }
  } catch (err) {
    console.log('[push] Error inesperado:', err)
  }
}
