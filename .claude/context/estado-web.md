# Estado Web — Panel Subcomisión (Next.js)

## Setup

- Carpeta: `web/` en la raíz del repo
- Stack: Next.js 16.2.6 + TypeScript + Tailwind v4 + `@supabase/supabase-js`
- `web/.env.local` apunta actualmente a Supabase **local** — cambiar a cloud si es necesario (ver `stack.md`)
- Deploy pendiente en Vercel ⏳

```bash
cd web
npm run dev   # http://localhost:3000
```

## Páginas implementadas

| Ruta | Descripción |
|---|---|
| `/` | Redirect a `/dashboard` |
| `/login` | Formulario con identidad La Bitácora, auth Supabase, guard por rol |
| `/dashboard` | 4 stat cards: asistencia global, fichados, lesiones activas, cobranzas |
| `/usuarios` | Lista profiles, expande detalle, edita rol y divisiones, desactiva/reactiva via Edge Function |
| `/divisiones` | Lista activas/inactivas, toggle activo, crear nueva división (con campo `categoria`) |
| `/informes` | 4 tabs: Asistencia (% per-jugador, badge 4 ausencias), Resultados (W/L/D), Fichajes (count+últimos 20), Financiero (por evento, formas de pago) — selector de división arriba |

## Arquitectura

- `web/lib/supabase.ts` — cliente browser (`NEXT_PUBLIC_*` vars)
- `web/app/(protected)/layout.tsx` — auth guard client-side: verifica sesión + rol (`subcomision`/`admin`), redirige a `/login`
- `web/components/Sidebar.tsx` — navegación lateral oscura con acento dorado (TABLERO, USUARIOS, DIVISIONES, INFORMES)

## Notas de framework

- **Next.js 16**: `proxy.ts` reemplaza `middleware.ts` (deprecado); `params` son Promises.
- **Tailwind v4**: `@import "tailwindcss"` + tokens en `@theme inline` (sin `tailwind.config.js`).
- **Fuentes**: Playfair Display + Lora via `next/font/google`, tokens `--font-playfair-var` / `--font-lora-var`.

## Bugs conocidos y corregidos

### `/divisiones`
- Columna es `activa` (boolean), NO `activo` — afecta SELECT, UPDATE e INSERT.
- Handler de crear: botón usa `type="button"` + `onClick` directo (no depende del `onSubmit` del form).
- INSERT requiere `categoria` NOT NULL — opciones: `infantil`, `juvenil`, `plantel_superior`, `femenino`, `rugby_mixed`.
