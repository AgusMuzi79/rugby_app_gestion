import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'

// Rol "Cliente Gimnasio" (2026-09-11) — no es socio, no ve cuotas/noticias/
// calendario. Sólo 2 tabs a propósito: el carnet y "Mi Perfil" (cerrar
// sesión). Ver migración 20260911000000_rol_cliente_gimnasio.
export default function ClienteGimnasioLayout() {
  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="carnet"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="sobre"
        options={{ tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  )
}
