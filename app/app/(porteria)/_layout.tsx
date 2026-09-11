import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { useAuthStore } from '@/stores/authStore'

export default function PorteriaLayout() {
  const { rol } = useAuthStore()
  const esBuffet = rol === 'buffet'

  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="scanner"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="camera" size={size} color={color} /> }}
      />
      {/* Sólo Buffet publica promos — el resto de las cuentas Lector no ven esta tab */}
      <Tabs.Screen
        name="promos"
        options={{
          href: esBuffet ? undefined : null,
          tabBarIcon: ({ color, size }) => <Feather name="tag" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
