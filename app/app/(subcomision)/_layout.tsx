import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { useEsGestorTenis } from '@/hooks/useTenisGestor'

// 5 pestañas; Mi perfil se abre desde el avatar del encabezado (X9).
// Con FEATURES.tenis, la subcomisión de tenis (profiles.deporte = 'tenis') y
// admin suman "Canchas" (reservas de tenis); con el flag apagado no se ve.
export default function SubcomisionLayout() {
  const verCanchas = useEsGestorTenis() === true
  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="diario"
        options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="eventos"
        options={{
          title: 'Eventos',
          tabBarIcon: ({ color, size }) => <Feather name="dollar-sign" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="noticias"
        options={{ title: 'Noticias', tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cronica"
        options={{ title: 'Crónica', tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="usuarios"
        options={{ title: 'Usuarios', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="canchas"
        options={{
          title: 'Canchas',
          href: verCanchas ? undefined : null,
          tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="sobre" options={{ title: 'Mi perfil', href: null }} />
      <Tabs.Screen name="salir" options={{ href: null }} />
      <Tabs.Screen name="informes" options={{ href: null }} />
      <Tabs.Screen name="protocolos" options={{ href: null }} />
    </Tabs>
  )
}
