# Stack — Entorno, Deps, Comandos y Env Vars

## Entorno local Supabase

- Supabase CLI v2.98.2 en `%USERPROFILE%\AppData\Local\supabase\supabase.exe` (en PATH de usuario)
- Studio: http://127.0.0.1:54323 · DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- 5 migraciones aplicadas (ver `estado-supabase.md`)
- Tipos TypeScript en `app/lib/database.types.ts`

```bash
supabase start          # requiere Docker Desktop corriendo
supabase functions serve  # levantar Edge Runtime local (en paralelo con start)
supabase gen types typescript --local > app/lib/database.types.ts
```

## Supabase Cloud

- Proyecto: `tlexvbattnzpmdftjsao`
- URL: `https://tlexvbattnzpmdftjsao.supabase.co`
- Migraciones aplicadas con `supabase db push`
- Edge Functions deployadas: `admin-usuarios`, `notifications`
- Redirect URL configurada: `uncasrugby://reset-password` ✅
- SMTP: Gmail en Dashboard → Project Settings → Auth → SMTP

## Env Vars — Cloud (producción)

```
# app/.env.local
EXPO_PUBLIC_SUPABASE_URL=https://tlexvbattnzpmdftjsao.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsZXh2YmF0dG56cG1kZnRqc2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTA2MzcsImV4cCI6MjA5NDY4NjYzN30.EtQ1-M0uENBhoeg-86_S2xp0QyN-QTeV5plTeaZUVPI

# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://tlexvbattnzpmdftjsao.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_nrdPtegYMk8DQbuGLw7wEg_XlfZOtb0
```

## Env Vars — Local (requiere Docker + `supabase start`)

```
# app/.env.local — usar IP de red del host (ej: 192.168.x.x:54321)
EXPO_PUBLIC_SUPABASE_URL=http://<IP_RED>:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# web/.env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

- El teléfono debe estar en la misma red WiFi que el host.
- Si el firewall bloquea el puerto: `netsh advfirewall firewall add rule name="Supabase Local Dev" dir=in action=allow protocol=TCP localport=54321` (PowerShell admin)
- `app/lib/supabase.ts` detecta URLs de túnel (`loca.lt`, `ngrok`) y agrega `bypass-tunnel-reminder: true` automáticamente.

## Usuarios de prueba (local)

| Email | Contraseña | Rol | División |
|---|---|---|---|
| admin@uncas.club | Admin1234! | admin | — |
| subco@uncas.club | Admin1234! | subcomision | — |
| coordinador@uncas.club | Admin1234! | coordinador | — |
| entrenador@uncas.club | Admin1234! | entrenador | M15 Prueba |
| manager@uncas.club | Admin1234! | manager | M15 Prueba |

- 10 jugadores de prueba en división M15 Prueba (`00000000-0000-0000-0000-000000000001`)
- 1 partido de prueba: vs Pampas RC, 2026-05-10, Cancha principal

## Dependencias nativas instaladas (app/)

- `react-native-modal-datetime-picker@18.0.0` + `@react-native-community/datetimepicker@8.4.4`
- `react-native-reanimated@4.1.7` — compatible con SDK 54 / RN 0.81.5. Requerido por NativeWind css-interop en runtime.
- `expo-image-picker` — foto de perfil en `useSobre`. Declarado en `app.json plugins`.
- `babel.config.js` tiene `react-native-reanimated/plugin` en plugins.

**⚠️ SIEMPRE usar `--legacy-peer-deps` en `npm install`** — conflicto `react-dom@19.2.6` vs `react@19.1.0`. Sin la flag, npm puede eliminar reanimated y otros paquetes transitivos.

## EAS Build

- EAS CLI v18.13.0 instalado globalmente
- Project ID: `d363d962-7caf-4050-81fc-b70b493289ca` (en `app.json extra.eas`)
- Scheme deep linking: `uncasrugby` (en `app.json`)
- `app/eas.json`: profiles `development` (developmentClient), `preview` (internal, APK), `production` (internal)

```bash
cd app
eas build --profile preview --platform android   # APK para Android ✅
eas build --profile preview --platform ios        # IPA para iOS (requiere Apple Developer ⏳)
eas build --profile development                   # dev build para probar push
```

## Notas de compatibilidad

- **Tailwind (app):** v3 (no v4). NativeWind v4 no soporta Tailwind v4. `global.css` usa `@tailwind base/components/utilities`.
- **expo-file-system v19:** `EncodingType` NO es named export. Usar string literal `'base64'`.
- **expo-notifications v0.32:** `NotificationBehavior` requiere `shouldShowBanner` y `shouldShowList` además de los 3 campos estándar.
- **Expo Go SDK 53:** push remotas eliminadas. `notifications.ts` usa `Constants.appOwnership === 'expo'` para saltear push en Expo Go.

## Comandos frecuentes

```bash
# App mobile
cd app && npx expo start

# Web
cd web && npm run dev   # http://localhost:3000

# Supabase
supabase start
supabase stop
supabase functions serve
supabase db push   # aplicar migraciones a cloud
supabase gen types typescript --local > app/lib/database.types.ts
```
