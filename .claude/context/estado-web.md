# Estado Web — Panel Subcomisión (Next.js)

## Setup

- Carpeta: `web/` en la raíz del repo
- Stack: Next.js 16.2.6 + TypeScript + Tailwind v4 + `@supabase/supabase-js`
- `web/.env.local` apunta a Supabase **cloud** (`tlexvbattnzpmdftjsao`)
- Deploy pendiente en Vercel ⏳

```bash
cd web
npm run dev   # http://localhost:3000
```

## Estructura de paneles

Dos route groups en `web/app/`, cada uno con su propio layout + sidebar + guard de rol:

| Route group | Roles | Sidebar |
|---|---|---|
| `(subcomision)/` | `subcomision`, `admin` | `Sidebar.tsx` — TABLERO, USUARIOS, DIVISIONES, INFORMES |
| `(secretaria)/` | `secretaria`, `admin` | `SidebarSecretaria.tsx` — SOCIOS, NOTICIAS, SERVICIOS |

Login (`/login`) es compartido — redirige a `/secretaria/socios` o `/dashboard` según rol.

## Páginas implementadas — Subcomisión

| Ruta | Descripción |
|---|---|
| `/` | Redirect a `/dashboard` |
| `/login` | Formulario auth Supabase, guard por rol, redirección inteligente |
| `/dashboard` | 4 stat cards: asistencia global, fichados, lesiones activas, cobranzas |
| `/usuarios` | Lista profiles, expande detalle, edita rol y divisiones, desactiva/reactiva via Edge Function |
| `/divisiones` | Lista activas/inactivas, toggle activo, crear nueva división (con campo `categoria`) |
| `/informes` | 4 tabs: Asistencia, Resultados, Fichajes, Financiero — selector de división arriba |

## Páginas implementadas — Secretaría

| Ruta | Descripción |
|---|---|
| `/secretaria/socios` | Tabla con búsqueda + filtro por estado, detalle completo, alta via `admin-socios`, pago manual, asociar/quitar/cobrar tarjeta, servicios opcionales, validar foto, desactivar/reactivar |
| `/secretaria/noticias` | Lista con filtro por deporte, publicar/despublicar, eliminar, modal nueva noticia (se guarda como borrador) |
| `/secretaria/servicios` | Tabla CRUD completa: crear, editar nombre/descripción/monto, toggle activo/inactivo, eliminar |

### Notas de implementación — Secretaría

- Las páginas están en `(secretaria)/secretaria/{socios,noticias,servicios}/page.tsx` — el segmento `secretaria/` es necesario para que las rutas resuelvan a `/secretaria/*` (el route group `(secretaria)` no agrega segmento de URL).
- `socios/page.tsx` llama a `admin-socios` y `socios-pagos` directamente desde el browser via fetch con el JWT de sesión.
- El join de `socios` con `profiles` usa la FK explícita: `profiles!socios_profile_id_fkey(nombre)`.
- El join de `noticias` con `profiles` usa: `profiles!noticias_autor_id_fkey(nombre)`.

## Arquitectura

- `web/lib/supabase.ts` — cliente browser (`NEXT_PUBLIC_*` vars)
- `web/app/(subcomision)/layout.tsx` — guard: `subcomision`/`admin`
- `web/app/(secretaria)/layout.tsx` — guard: `secretaria`/`admin`
- `web/components/Sidebar.tsx` — sidebar subcomisión
- `web/components/SidebarSecretaria.tsx` — sidebar secretaría

## Notas de framework

- **Next.js 16**: `proxy.ts` reemplaza `middleware.ts` (deprecado); `params` son Promises.
- **Tailwind v4**: `@import "tailwindcss"` + tokens en `@theme inline` (sin `tailwind.config.js`).
- **Fuentes**: Playfair Display + Lora via `next/font/google`, tokens `--font-playfair-var` / `--font-lora-var`.

## Bugs conocidos y corregidos

### `/login`
- Si el usuario switcheó el rol activo en la app móvil (ej: manager), el login web detecta que `profiles.rol` no es un rol web y lo restaura buscando en `profiles.roles[]` el primer rol web válido (`subcomision`, `admin`, `secretaria`). Actualiza la DB antes de redirigir para que RLS funcione.

### `/usuarios` — `callEdgeFunction` + `buscarSocio`
- `callEdgeFunction` usa `fetch` manual con el JWT de sesión (no `supabase.functions.invoke()`). `cors.ts` incluye `x-client-info, apikey` en `Access-Control-Allow-Headers`.
- `buscarSocio` obtiene `nombre` del socio via join `profiles!socios_profile_id_fkey` — la tabla `socios` NO tiene columna `nombre` ni `email`. Mismo patrón en mobile `useUsuarios.ts`.
- `handleAssignRole` en `admin-usuarios`: idem, selecciona `profiles!socios_profile_id_fkey(nombre)` en lugar de `nombre, email` directamente de `socios`.

### `/divisiones`
- Columna es `activa` (boolean), NO `activo` — afecta SELECT, UPDATE e INSERT.
- Handler de crear: botón usa `type="button"` + `onClick` directo (no depende del `onSubmit` del form).
- INSERT requiere `categoria` NOT NULL — opciones: `infantil`, `juvenil`, `plantel_superior`, `femenino`, `rugby_mixed`.
