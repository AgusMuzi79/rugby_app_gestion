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
  if (Platform.OS === 'web') return
  if (isExpoGo) return

  try {
    const Notifications = await import('expo-notifications')

    const { status: existing } = await Notifications.getPermissionsAsync()
    const { status } = existing !== 'granted'
      ? await Notifications.requestPermissionsAsync()
      : { status: existing }

    if (status !== 'granted') return

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:              'Notificaciones del Club',
        importance:        Notifications.AndroidImportance.MAX,
        vibrationPattern:  [0, 250, 250, 250],
        lightColor:        '#C9A84C',
      })
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync()
    const pushToken   = tokenResult.data

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('push_tokens')
      .upsert(
        { usuario_id: user.id, token: pushToken, plataforma: Platform.OS },
        { onConflict: 'token' },
      )
  } catch {
    // No crítico — la app funciona sin push
  }
}
