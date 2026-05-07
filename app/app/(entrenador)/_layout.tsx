import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const GOLD = '#C9A84C'
const DARK = '#1A1A1A'
const INACTIVE = '#666666'

export default function EntrenadorLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: DARK, borderTopColor: '#2A2A2A' },
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: INACTIVE,
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.5 },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="asistencia"
        options={{
          title: 'Asistencia',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lesiones"
        options={{
          title: 'Lesiones',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="medkit-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="partido"
        options={{
          title: 'Partido',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="american-football-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
