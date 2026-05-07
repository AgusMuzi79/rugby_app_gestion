import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Mostrar alertas aunque la app esté en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
})

export async function registerPushToken(): Promise<void> {
  // Push no funciona en web
  if (Platform.OS === 'web') return

  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    const { status } = existing !== 'granted'
      ? await Notifications.requestPermissionsAsync()
      : { status: existing }

    if (status !== 'granted') return

    // Android requiere canal de notificaciones
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:              'Notificaciones del Club',
        importance:        Notifications.AndroidImportance.MAX,
        vibrationPattern:  [0, 250, 250, 250],
        lightColor:        '#C9A84C',
      })
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync()
    const pushToken   = tokenResult.data  // "ExponentPushToken[...]"

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
