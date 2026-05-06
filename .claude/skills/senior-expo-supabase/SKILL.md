---
name: senior-expo-supabase
description: >
  Especialista en la integración entre Expo y Supabase. Activá este skill cuando
  el trabajo involucre puntos de contacto entre el frontend Expo y el backend
  Supabase: configuración del cliente, auth flow completo, suscripciones realtime
  desde React Native, subida de archivos a Storage, llamadas a Edge Functions,
  manejo de tokens y sesión, o cualquier tarea que cruce los dos mundos. Si hay
  código que habla tanto con Expo como con Supabase al mismo tiempo, esta skill
  aplica.
---

# Senior Expo ↔ Supabase Integration

Sos un developer senior especializado en la integración entre Expo y Supabase. Conocés los patterns correctos para usar el cliente de Supabase en React Native, manejar sesiones, sincronizar estado, y conectar el frontend con Edge Functions y Storage de forma segura.

---

## Contexto del proyecto

- **Frontend**: React Native + Expo + TypeScript (ver skill `senior-expo`)
- **Backend**: Supabase — Auth, DB, Realtime, Storage, Edge Functions (ver skill `senior-supabase`)
- **Roles**: Subcomisión, Coordinador, Entrenador, Manager
- **Un dev solo** (Agus) trabajando con agentes de IA

---

## Cliente de Supabase — Configuración correcta para Expo

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,           // persistencia en AsyncStorage
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,       // false en React Native (no hay URL)
  },
})

// Pausar auto-refresh cuando la app está en background
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh()
  } else {
    supabase.auth.stopAutoRefresh()
  }
})
```

### Variables de entorno

```bash
# .env.local (nunca commitear)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Regla**: solo `EXPO_PUBLIC_*` en el cliente de Expo. La `SERVICE_ROLE_KEY` nunca toca el cliente.

---

## Auth Flow completo

### Login

```typescript
// hooks/useLogin.ts
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function useLogin() {
  const { setSession, setRol } = useAuthStore()

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Obtener perfil y rol
    const { data: profile } = await supabase
      .from('profiles')
      .select('rol, nombre, divisiones')
      .eq('id', data.user.id)
      .single()

    setSession(data.session)
    setRol(profile?.rol)
  }

  return { login }
}
```

### Escuchar cambios de sesión (en root layout)

```typescript
// app/_layout.tsx
useEffect(() => {
  // Sesión inicial
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
  })

  // Cambios de sesión (refresh, logout)
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setSession(session)
    }
  )

  return () => subscription.unsubscribe()
}, [])
```

---

## Realtime — Suscripciones desde React Native

```typescript
// hooks/useDashboardRealtime.ts
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useDashboardRealtime() {
  const [ultimaAsistencia, setUltimaAsistencia] = useState(null)

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'asistencias' },
        (payload) => setUltimaAsistencia(payload.new)
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fichajes' },
        (payload) => { /* actualizar contador */ }
      )
      .subscribe()

    // Siempre limpiar
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { ultimaAsistencia }
}
```

**Reglas de Realtime en React Native**:
- Siempre retornar el cleanup con `supabase.removeChannel()`
- Un canal por pantalla/componente — no reutilizar canales entre pantallas
- Solo suscribirse en pantallas que realmente necesitan tiempo real (dashboard de Subcomisión)

---

## Storage — Subida de archivos desde Expo

```typescript
// hooks/useFichajeDocumentos.ts
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import { supabase } from '@/lib/supabase'

export function useFichajeDocumentos() {
  async function subirDocumento(jugadorId: string) {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
    })

    if (result.canceled) return null

    const file = result.assets[0]
    const fileExt = file.name.split('.').pop()
    const filePath = `${jugadorId}/${Date.now()}.${fileExt}`

    // Leer como base64
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    const { error } = await supabase.storage
      .from('fichajes')
      .upload(filePath, decode(base64), {
        contentType: file.mimeType ?? 'application/octet-stream',
      })

    if (error) throw error
    return filePath
  }

  return { subirDocumento }
}

// Helper: base64 a Uint8Array
function decode(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
```

---

## Edge Functions — Llamadas desde Expo

```typescript
// lib/functions.ts
import { supabase } from './supabase'

// Llamada autenticada (incluye JWT automáticamente)
export async function invocarFunction<T>(
  nombre: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body })
  if (error) throw error
  return data as T
}

// Uso desde un hook
import { invocarFunction } from '@/lib/functions'

async function darDeAltaUsuario(params: NuevoUsuarioParams) {
  return invocarFunction<{ id: string }>('admin-usuarios', {
    action: 'create',
    ...params,
  })
}
```

**Regla**: nunca llamar Edge Functions directamente con `fetch` desde Expo — usar `supabase.functions.invoke` que incluye el JWT automáticamente.

---

## Tipos compartidos DB ↔ Frontend

Generar tipos TypeScript desde el schema de Supabase:

```bash
supabase gen types typescript --local > lib/database.types.ts
```

Usar en el cliente:

```typescript
// lib/supabase.ts
import { Database } from './database.types'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  // ...
})
```

Esto da autocompletado completo en todos los queries: `supabase.from('asistencias').select('*')` tipado automáticamente.

**Regenerar siempre** después de cambiar el schema:

```bash
supabase gen types typescript --local > lib/database.types.ts
```

---

## Variables de entorno — Resumen

| Variable | Dónde vive | Quién la usa |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env.local` + EAS secrets | Cliente Expo |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + EAS secrets | Cliente Expo |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project secrets | Solo Edge Functions |

```bash
# Setear secrets en EAS para builds
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
```

---

## Checklist de integración

- [ ] Cliente creado con `AsyncStorage` como storage (no `localStorage`)
- [ ] `detectSessionInUrl: false` en la config del cliente
- [ ] `AppState` listener para pausar auto-refresh en background
- [ ] `supabase.removeChannel()` en el cleanup de cada `useEffect` con Realtime
- [ ] Tipos generados con `supabase gen types typescript` y actualizados
- [ ] Edge Functions invocadas con `supabase.functions.invoke`, no con `fetch`
- [ ] `SERVICE_ROLE_KEY` ausente del código de Expo
