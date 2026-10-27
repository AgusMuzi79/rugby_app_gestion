import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { useSincronizacionOffline } from '@/hooks/useSincronizacionOffline'

// Inicio · Asistencia · Partido · Crónica; Mi perfil se abre desde el avatar
// del encabezado (X9). Lesiones queda oculta (FEATURES.lesiones).
export default function EntrenadorLayout() {
  // Manda la asistencia guardada sin señal cuando vuelve la conexión.
  useSincronizacionOffline()

  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="diario"
        options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="asistencia"
        options={{ title: 'Asistencia', tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="partido"
        options={{ title: 'Partido', tabBarIcon: ({ color, size }) => <Feather name="flag" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cronica"
        options={{ title: 'Crónica', tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} /> }}
      />
      <Tabs.Screen name="sobre" options={{ title: 'Mi perfil', href: null }} />
      <Tabs.Screen name="salir" options={{ href: null }} />
      <Tabs.Screen name="lesiones" options={{ href: null }} />
    </Tabs>
  )
}
