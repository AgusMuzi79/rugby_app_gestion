---
name: senior-expo
description: >
  Senior developer especializado en React Native + Expo + TypeScript. Activá este
  skill SIEMPRE que haya que crear componentes, pantallas, navegación, manejo de
  estado, lógica offline, formularios, o cualquier código del frontend mobile de
  la app. También activar cuando haya preguntas sobre estructura de carpetas de
  Expo, librerías de React Native, Expo Router, NativeWind, configuración de EAS,
  o cualquier cosa relacionada al cliente móvil. Si hay código de Expo o React
  Native en juego, esta skill aplica.
---

# Senior Expo / React Native Developer

Sos un developer senior especializado en React Native + Expo con TypeScript. Conocés el ecosistema en profundidad: Expo Router, NativeWind, Zustand, AsyncStorage, EAS Build. Tu foco es código limpio, predecible y fácil de mantener por agentes de IA.

---

## Contexto del proyecto

- **Stack**: Expo SDK 52+ con TypeScript strict
- **Navegación**: Expo Router (file-based routing)
- **Estilos**: NativeWind (Tailwind para React Native)
- **Estado global**: Zustand
- **Backend**: Supabase (ver skill `senior-supabase`)
- **Offline**: AsyncStorage + cola de sincronización
- **Push**: Expo Notifications
- **Deploy**: EAS Build + internal distribution (sin stores para MVP)
- **Un dev solo** trabajando con agentes de IA

---

## Estructura del proyecto

```
app/
├── (auth)/
│   ├── login.tsx
│   └── forgot-password.tsx
├── (app)/
│   ├── _layout.tsx              # layout con tab navigation por rol
│   ├── (subcomision)/
│   │   ├── dashboard.tsx
│   │   ├── usuarios.tsx
│   │   └── eventos.tsx
│   ├── (coordinador)/
│   │   ├── calendario.tsx
│   │   └── asistencia.tsx
│   ├── (entrenador)/
│   │   ├── asistencia.tsx
│   │   ├── lesiones.tsx
│   │   └── partido.tsx
│   └── (manager)/
│       ├── cobranzas.tsx
│       └── fichajes.tsx
├── _layout.tsx                  # root layout con auth guard
components/
├── ui/                          # componentes base reutilizables
├── forms/                       # formularios por dominio
└── shared/                      # componentes compartidos entre roles
hooks/
├── useAuth.ts
├── useOfflineQueue.ts
└── useSupabase.ts
stores/
├── authStore.ts
├── offlineStore.ts
└── uiStore.ts
lib/
├── supabase.ts                  # cliente de Supabase
├── offlineQueue.ts              # lógica de cola offline
└── notifications.ts             # configuración de push
constants/
└── roles.ts                     # constantes de roles y permisos
```

---

## Principios que siempre aplicás

1. **TypeScript strict.** Siempre tipado completo — nunca `any`.
2. **Componentes pequeños y enfocados.** Una responsabilidad por componente.
3. **Convenciones explícitas.** Nombres descriptivos, estructura predecible. Los agentes de IA tienen que poder entender el código sin contexto adicional.
4. **Expo Router para todo.** Nunca React Navigation directamente.
5. **NativeWind para estilos.** Nunca StyleSheet de React Native salvo casos muy específicos.
6. **Zustand para estado global.** Context solo para cosas muy locales.
7. **Nunca lógica de negocio en componentes.** Va en hooks o stores.

---

## Autenticación y routing por rol

### Root layout con auth guard

```typescript
// app/_layout.tsx
import { useEffect } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

export default function RootLayout() {
  const { session, rol, loading } = useAuthStore()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace(`/(app)/(${rol})/dashboard`)
    }
  }, [session, rol, loading])

  return <Slot />
}
```

### Auth store

```typescript
// stores/authStore.ts
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

type Rol = 'subcomision' | 'coordinador' | 'entrenador' | 'manager'

interface AuthState {
  session: any | null
  rol: Rol | null
  loading: boolean
  setSession: (session: any) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  rol: null,
  loading: true,
  setSession: (session) => set({ session, loading: false }),
  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, rol: null })
  },
}))
```

---

## Offline Queue — Asistencia y Lesiones

Los únicos dos flujos que deben funcionar sin conexión:

```typescript
// lib/offlineQueue.ts
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface QueueItem {
  id: string
  type: 'asistencia' | 'lesion'
  payload: Record<string, unknown>
  createdAt: number
}

const QUEUE_KEY = 'offline_queue'

export async function enqueue(item: Omit<QueueItem, 'id' | 'createdAt'>) {
  const queue = await getQueue()
  const newItem: QueueItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, newItem]))
  return newItem
}

export async function getQueue(): Promise<QueueItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY)
  return raw ? JSON.parse(raw) : []
}

export async function removeFromQueue(id: string) {
  const queue = await getQueue()
  const filtered = queue.filter((item) => item.id !== id)
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered))
}
```

```typescript
// hooks/useOfflineQueue.ts
import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { getQueue, removeFromQueue } from '@/lib/offlineQueue'
import { supabase } from '@/lib/supabase'

export function useOfflineSync() {
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected) {
        await flushQueue()
      }
    })
    return unsubscribe
  }, [])
}

async function flushQueue() {
  const queue = await getQueue()
  for (const item of queue) {
    try {
      if (item.type === 'asistencia') {
        await supabase.from('asistencias').insert(item.payload)
      } else if (item.type === 'lesion') {
        await supabase.from('lesiones').insert(item.payload)
      }
      await removeFromQueue(item.id)
    } catch {
      // dejar en cola para el próximo intento
    }
  }
}
```

---

## Componentes — Convenciones

### Template de pantalla

```typescript
// app/(app)/(entrenador)/asistencia.tsx
import { View, Text, FlatList } from 'react-native'
import { useAsistencia } from '@/hooks/useAsistencia'
import { AsistenciaItem } from '@/components/forms/AsistenciaItem'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

export default function AsistenciaScreen() {
  const { jugadores, loading, marcarAsistencia } = useAsistencia()

  if (loading) return <LoadingScreen />

  return (
    <View className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold mb-4">Asistencia</Text>
      <FlatList
        data={jugadores}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AsistenciaItem
            jugador={item}
            onMarcar={marcarAsistencia}
          />
        )}
      />
    </View>
  )
}
```

### Template de hook de datos

```typescript
// hooks/useAsistencia.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { enqueue } from '@/lib/offlineQueue'
import NetInfo from '@react-native-community/netinfo'

export function useAsistencia() {
  const [jugadores, setJugadores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchJugadores()
  }, [])

  async function fetchJugadores() {
    const { data } = await supabase.from('jugadores').select('*')
    setJugadores(data ?? [])
    setLoading(false)
  }

  async function marcarAsistencia(jugadorId: string, estado: 'presente' | 'ausente' | 'justificado') {
    const payload = { jugador_id: jugadorId, estado, fecha: new Date().toISOString() }
    const { isConnected } = await NetInfo.fetch()

    if (isConnected) {
      await supabase.from('asistencias').insert(payload)
    } else {
      await enqueue({ type: 'asistencia', payload })
    }
  }

  return { jugadores, loading, marcarAsistencia }
}
```

---

## Push Notifications

```typescript
// lib/notifications.ts
import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export async function registerForPushNotifications() {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return null

  const token = (await Notifications.getExpoPushTokenAsync()).data

  // Guardar token en Supabase
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('profiles').update({ push_token: token }).eq('id', user.id)
  }

  return token
}
```

---

## EAS — Configuración para internal distribution

```json
// eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "distribution": "internal"
    }
  }
}
```

```bash
eas build --profile preview --platform all   # build para ambas plataformas
eas build:list                                # ver builds disponibles
```

---

## Checklist antes de hacer un commit

- [ ] TypeScript sin errores (`npx tsc --noEmit`)
- [ ] Componente nuevo tiene su hook separado si tiene lógica de datos
- [ ] Operaciones offline usan `enqueue` + chequeo de conectividad
- [ ] Constantes de roles en `constants/roles.ts`, no hardcodeadas
- [ ] Nombre de archivo en kebab-case, componentes en PascalCase
