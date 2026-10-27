import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { useAuthStore } from '@/stores/authStore'
import { useSincronizacionOffline } from '@/hooks/useSincronizacionOffline'

export default function PorteriaLayout() {
  const { rol } = useAuthStore()
  const esBuffet = rol === 'buffet'
  // Manda los ingresos que se dejaron pasar sin conexión al volver la red o
  // la app a primer plano (ver useScanner).
  useSincronizacionOffline()

  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="scanner"
        options={{ title: 'Escanear', tabBarIcon: ({ color, size }) => <Feather name="camera" size={size} color={color} /> }}
      />
      {/* Sólo Buffet publica promos — el resto de las cuentas Lector no ven esta tab */}
      <Tabs.Screen
        name="promos"
        options={{
          title: 'Promos',
          href: esBuffet ? undefined : null,
          tabBarIcon: ({ color, size }) => <Feather name="tag" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ title: 'Mi perfil', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
