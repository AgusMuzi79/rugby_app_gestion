import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { FEATURES } from '@/constants/features'

// Admin has its own group (2026-10-09): user management and system status,
// without the player/attendance/fichajes screens of (subcomision).
export default function AdminLayout() {
  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="usuarios"
        options={{ title: 'Usuarios', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="comunicados"
        options={{ title: 'Comunicados', tabBarIcon: ({ color, size }) => <Feather name="rss" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sistema"
        options={{ title: 'Sistema', tabBarIcon: ({ color, size }) => <Feather name="server" size={size} color={color} /> }}
      />
      {/* Reservas de tenis: admin gestiona las canchas igual que la subcomisión de tenis. */}
      <Tabs.Screen
        name="canchas"
        options={{
          title: 'Canchas',
          href: FEATURES.tenis ? undefined : null,
          tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ title: 'Mi perfil', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
