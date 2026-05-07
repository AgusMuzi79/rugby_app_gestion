import { TouchableOpacity } from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSignOut } from '@/hooks/useSignOut'

const GOLD = '#C9A84C'
const DARK = '#1A1A1A'
const INACTIVE = '#666666'

export default function EntrenadorLayout() {
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
