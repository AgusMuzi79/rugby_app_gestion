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

## Usuarios de prueba v2 (cloud)

| Auth ID | Rol | Profile |
|---|---|---|
| `dccdb2cf-fb18-4e6e-bba7-2a604b833afa` | secretaria | Creado manualmente en Supabase |
| `b58a72c7-f085-408a-a7ae-10b52cf89d53` | porteria | Creado manualmente en Supabase |

Los usuarios v2 sin profile dan FK error al guardar el push token. Verificar con:
```sql
SELECT au.id, au.email FROM auth.users au LEFT JOIN profiles p ON p.id = au.id WHERE p.id IS NULL;
```

## Dependencias nativas instaladas (app/)

- `react-native-modal-datetime-picker@18.0.0` + `@react-native-community/datetimepicker@8.4.4`
- `react-native-reanimated@4.1.7` — compatible con SDK 54 / RN 0.81.5. Requerido por NativeWind css-interop en runtime.
- `expo-image-picker` — foto de perfil en `useSobre`. Declarado en `app.json plugins`.
- `expo-camera@~17.0.10` — SDK 54 compatible. Declarado en `app.json plugins`. **NO usar `npm install expo-camera`** — instala versión SDK 56. Siempre `npx expo install expo-camera`.
- `react-native-qrcode-svg` + `react-native-svg@15.12.1` — carnet QR del socio.
- `react-native-worklets@0.5.1` — SDK 54 compatible. No subir de versión sin `npx expo install`.
- `babel.config.js` tiene `react-native-reanimated/plugin` en plugins.

**⚠️ SIEMPRE usar `npx expo install <pkg>` para paquetes del ecosistema Expo** — resuelve la versión SDK-compatible. `npm install` puede instalar versiones incompatibles que crashean la app nativamente y requieren nueva build.

**⚠️ SIEMPRE usar `--legacy-peer-deps` en `npm install`** — conflicto `react-dom@19.2.6` vs `react@19.1.0`. Sin la flag, npm puede eliminar reanimated y otros paquetes transitivos.

**`app/.npmrc`** tiene `legacy-peer-deps=true` — EAS Build corre `npm ci` sin flags, este archivo lo resuelve automáticamente.

**Verificar compatibilidad antes de cada build**: `npx expo install --check`. Debe decir `Dependencies are up to date`.

## EAS Build

- EAS CLI v18.13.0 instalado globalmente
- Project ID: `d363d962-7caf-4050-81fc-b70b493289ca` (en `app.json extra.eas`)
- Scheme deep linking: `uncasrugby` (en `app.json`)
- `app/eas.json`: profiles `development` (developmentClient), `preview` (internal, APK), `production` (internal)
- **Firebase**: `app/google-services.json` configurado en `app.json → android.googleServicesFile`. Excluido de git. Requerido para push en dev build / preview.
- Última dev build: `00d498bf-a0ba-440b-a8f1-ed8831336f50` (con Firebase, SDK 54 deps alineadas)

```bash
cd app
eas build --profile preview --platform android   # APK standalone Android
eas build --profile preview --platform ios        # IPA para iOS (requiere Apple Developer ⏳)
eas build --profile development --platform android  # dev build (requiere npx expo start para JS)
```

**Dev build vs Preview build**:
- Dev build: JS servido por Metro en tiempo real. Requiere `npx expo start` y mismo WiFi (o `--tunnel`). Cambios JS = recarga inmediata. Cambio nativo = nueva build.
- Preview build: JS bundleado. Funciona sin Metro, sin WiFi compartido. Para testers externos.

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
