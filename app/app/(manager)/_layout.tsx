import { TouchableOpacity } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSignOut } from '@/hooks/useSignOut'

const GOLD = '#C9A84C'
const DARK = '#1A1A1A'
const INACTIVE = '#666666'

export default function ManagerLayout() {
  const { signOut } = useSignOut()

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
        name="cobranzas"
        options={{
          title: 'Cobranzas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fichajes"
        options={{
          title: 'Fichajes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-add-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="salir"
        options={{
          title: 'Salir',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="log-out-outline" size={size} color={color} />
          ),
          tabBarButton: ({ children, style }) => (
            <TouchableOpacity style={style} onPress={signOut} activeOpacity={0.7}>{children}</TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  )
}
