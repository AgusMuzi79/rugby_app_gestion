import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { useSincronizacionOffline } from '@/hooks/useSincronizacionOffline'

// Colaborador (auditoría entrenador T23): sólo toma asistencia. Una pestaña
// (Asistencia, para volver desde Mi perfil); Mi perfil se abre desde el avatar
// del encabezado y desde ahí se cierra la sesión.
export default function ColaboradorLayout() {
  // Manda la asistencia guardada sin señal cuando vuelve la conexión.
  useSincronizacionOffline()

  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="asistencia"
        options={{ title: 'Asistencia', tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} /> }}
      />
      <Tabs.Screen name="sobre" options={{ title: 'Mi perfil', href: null }} />
    </Tabs>
  )
}
