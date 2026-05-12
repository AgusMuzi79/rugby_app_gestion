import { TouchableOpacity } from 'react-native'
import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSignOut } from '@/hooks/useSignOut'

export default function EntrenadorLayout() {
  const { signOut } = useSignOut()

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
      <Tabs.Screen
        name="asistencia"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="cronica"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="activity" size={size} color={color} /> }}
      />
      <Tabs.Screen name="lesiones" options={{ href: null }} />
      <Tabs.Screen name="partido" options={{ href: null }} />
      <Tabs.Screen
        name="salir"
        options={{
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
          tabBarButton: ({ children, style }) => (
            <TouchableOpacity style={style} onPress={signOut} activeOpacity={0.7}>{children}</TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  )
}
