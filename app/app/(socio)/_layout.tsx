import { Tabs } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { TAB_SCREEN_OPTIONS } from '@/constants/tabOptions'
import { AgendaContext, useAgendaEstado } from '@/hooks/useAgenda'
import { mostrarTabAgenda } from '@/lib/agenda'

export default function SocioLayout() {
  // La agenda se carga una vez acá: decide si se ve la pestaña y la pantalla
  // la lee del contexto. Oculta mientras carga; si falla se muestra (la
  // pantalla ofrece Reintentar).
  const agenda = useAgendaEstado()
  const verAgenda = mostrarTabAgenda(agenda)

  return (
    <AgendaContext.Provider value={agenda}>
      <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
        <Tabs.Screen
          name="carnet"
          options={{ title: 'Carnet', tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="cuotas"
          options={{ title: 'Cuotas', tabBarIcon: ({ color, size }) => <Feather name="dollar-sign" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="turnos"
          options={{
            title: 'Agenda',
            href: verAgenda ? undefined : null,
            tabBarIcon: ({ color, size }) => <Feather name="list" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="noticias"
          options={{ title: 'Noticias', tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="calendario"
          options={{ title: 'Calendario', tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="sobre"
          options={{ title: 'Mi perfil', href: null, tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
        />
      </Tabs>
    </AgendaContext.Provider>
  )
}
