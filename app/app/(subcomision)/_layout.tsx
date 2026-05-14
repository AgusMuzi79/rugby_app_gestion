import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'

export default function SubcomisionLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#0E0E0E', borderTopColor: '#1A1A1A' },
        tabBarActiveTintColor: '#E8B53C',
        tabBarInactiveTintColor: '#666666',
        tabBarShowLabel: false,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="diario"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen
        name="usuarios"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cronica"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
      <Tabs.Screen name="salir" options={{ href: null }} />
      <Tabs.Screen name="eventos" options={{ href: null }} />
      <Tabs.Screen name="informes" options={{ href: null }} />
      <Tabs.Screen name="notificaciones" options={{ href: null }} />
      <Tabs.Screen name="protocolos" options={{ href: null }} />
    </Tabs>
  )
}
