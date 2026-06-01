# Estado Supabase — Migrations, Edge Functions, RLS

## Migraciones aplicadas

| Archivo | Descripción |
|---|---|
| `20260506000000_init_schema.sql` | Schema PostgreSQL completo: 18 tablas, helper functions RLS, índices |
| `20260506000001_add_platform_to_push_tokens.sql` | Columna `plataforma` en `push_tokens` |
| `20260506000002_rls_policies.sql` | Políticas RLS completas para las 18 tablas (44 políticas) |
| `20260506000003_add_admin_role.sql` | Rol `admin` con CRUD en las 18 tablas |
| `20260507000000_eventos_insert_entrenador.sql` | Política INSERT en `eventos` para entrenador (tipo entrenamiento) |

Todas aplicadas en local y cloud (`supabase db push`).

## Edge Functions

| Función | Estado | Descripción |
|---|---|---|
| `supabase/functions/admin-usuarios/` | ✅ completo | `create` / `deactivate` / `reactivate` / `getUser` |
| `supabase/functions/notifications/` | ✅ completo | lesión→Subcomisión, fichaje→Subcomisión, 4 ausencias consecutivas→Coordinador via Expo Push API |
| `supabase/functions/_shared/` | ✅ | `supabase-admin.ts` (service role client) + `cors.ts` (headers + helpers) |

### `admin-usuarios` — detalle de acciones

- **`create`**: `inviteUserByEmail(email, { data: { nombre }, redirectTo: 'uncasrugby://reset-password' })` — Supabase envía email de invite via SMTP Gmail + template Dashboard. Sin Resend.
- **`deactivate` / `reactivate`**: ban/unban usuario (876000h).
- **`getUser`**: `supabaseAdmin.auth.admin.getUserById(userId)` → retorna `{ email }`. El email vive en `auth.users`, no en `profiles`.

### `notifications` — tipos soportados

- `lesion` → notifica a Subcomisión
- `fichaje` → notifica a Subcomisión
- `ausencias_consecutivas` → notifica al Coordinador
- `manual` → solo push (el INSERT en DB lo hace el cliente directo)

**Nota**: `supabase start` NO levanta el Edge Runtime. Para probar funciones localmente, correr `supabase functions serve` en paralelo.

## Notas de schema relevantes

- Email de usuario vive en `auth.users`, NO en `profiles` — siempre obtener con `getUser` action.
- `monto_sugerido` en eventos financieros está almacenado en el campo `descripcion` (no existe columna propia).
- `division_id IS NULL` en cobranzas/eventos = pedido global de Subcomisión (aplica a todos los equipos).
- Columna de estado en `divisiones` es `activa` (boolean), NO `activo`.
- INSERT en `divisiones` requiere `categoria` NOT NULL — opciones: `infantil`, `juvenil`, `plantel_superior`, `femenino`, `rugby_mixed`.
- `push_tokens` upsert por `onConflict: 'token'`.
- Tipos de evento financiero: `'recaudacion' | 'viaje' | 'tercer_tiempo'`.
