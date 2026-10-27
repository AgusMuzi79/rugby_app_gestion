import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'

// 5 pestañas; Mi perfil se abre desde el avatar del encabezado (X9).
export default function SubcomisionLayout() {
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
      <Tabs.Screen name="sobre" options={{ title: 'Mi perfil', href: null }} />
      <Tabs.Screen name="salir" options={{ href: null }} />
      <Tabs.Screen name="informes" options={{ href: null }} />
      <Tabs.Screen name="protocolos" options={{ href: null }} />
    </Tabs>
  )
}
