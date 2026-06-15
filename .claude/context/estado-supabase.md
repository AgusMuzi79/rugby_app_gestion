# Estado Supabase — Migrations, Edge Functions, RLS

## Migraciones aplicadas

| Archivo | Descripción | Estado |
|---|---|---|
| `20260506000000_init_schema.sql` | Schema v1: 18 tablas, helper functions RLS, índices | ✅ cloud+local |
| `20260506000001_add_platform_to_push_tokens.sql` | Columna `plataforma` en `push_tokens` | ✅ cloud+local |
| `20260506000002_rls_policies.sql` | Políticas RLS completas (44 políticas) | ✅ cloud+local |
| `20260506000003_add_admin_role.sql` | Rol `admin` con CRUD en las 18 tablas | ✅ cloud+local |
| `20260507000000_eventos_insert_entrenador.sql` | INSERT en `eventos` para entrenador | ✅ cloud+local |
| `20260507000001_add_equipos.sql` | Equipos | ✅ cloud+local |
| `20260507000002_fix_mesas_uniqueness.sql` | Fix uniqueness en mesas | ✅ cloud+local |
| `20260507000003_add_resultado_fields.sql` | Campos adicionales en resultados | ✅ cloud+local |
| `20260507000004_add_posicion_jugadores.sql` | Columna `posicion` en jugadores + bucket `fichajes` | ✅ cloud+local |
| `20260511000000_protocolos_bucket.sql` | Bucket `protocolos` + políticas storage | ✅ cloud+local |
| `20260512000000_protocolos_schema.sql` | Tablas `protocolos_lesion`, `protocolo_pasos`, `protocolo_alertas`, `grtp_etapas` | ✅ cloud+local |
| `20260512000001_protocolos_seed.sql` | Datos iniciales de protocolos | ✅ cloud+local |
| `20260601000000_socios_schema.sql` | **v2** — 6 tablas nuevas (socios, secrets, cuotas, pagos, noticias, categorias), roles nuevos | ✅ cloud / ❌ local |
| `20260601000001_socios_rls.sql` | **v2** — Políticas RLS módulo socios | ✅ cloud / ❌ local |
| `20260601000002_socios_storage.sql` | **v2** — Buckets `socios-fotos`, `noticias-imagenes`, `comprobantes` | ✅ cloud / ❌ local |
| `20260608000000_fix_push_tokens_update_policy.sql` | Fix RLS UPDATE en `push_tokens`: USING(true) para upsert entre usuarios | ✅ aplicada vía `db query --linked` |
| `20260609000000_servicios_opcionales.sql` | Tablas `servicios_opcionales` + `socio_servicios`, RLS, seed | ✅ aplicada vía `db query --linked` |
| `20260609000002_mp_card_fields.sql` | Columnas MP en `socios`, `'tarjeta'` en CHECK de `pagos_socios` | ✅ aplicada |
| `20260610000000_fix_push_tokens_delete_policy.sql` | DELETE policy `push_tokens` → `USING (true)` para fix de re-asignación entre usuarios | ⏳ pendiente `db push` |

Las migraciones v2 (`20260601000000/01/02`) fueron aplicadas al cloud **manualmente via SQL editor** y marcadas con `migration repair`. Las migraciones `20260608` y `20260609000000` se aplicaron vía `supabase db query --linked` (estaban en el historial pero el SQL nunca se había ejecutado).

El entorno local no está sincronizado — `database.types.ts` no incluye tablas v2. Para sincronizar local:
```bash
supabase start   # requiere Docker Desktop
supabase db push --local
supabase gen types typescript --local > app/lib/database.types.ts
```

**`categorias_socio` requiere seed manual** — la tabla se crea vacía. Insertar via SQL editor:
```sql
INSERT INTO categorias_socio (nombre, descripcion, monto_mensual) VALUES
  ('Activo',    'Socio activo con acceso completo',        5000.00),
  ('Adherente', 'Socio adherente sin actividad deportiva', 3000.00),
  ('Juvenil',   'Menores de 18 años',                      2500.00),
  ('Vitalicio', 'Socio vitalicio',                            0.00);
```

## Edge Functions

| Función | Estado | Descripción |
|---|---|---|
| `supabase/functions/admin-usuarios/` | ✅ completo | `create` / `deactivate` / `reactivate` / `getUser` |
| `supabase/functions/notifications/` | ✅ completo | lesión→Subcomisión, fichaje→Subcomisión, 4 ausencias consecutivas→Coordinador via Expo Push API |
| `supabase/functions/admin-socios/` | ✅ deployada | `create` / `deactivate` / `reactivate` / `validate-photo` (Rekognition con fallback manual si AWS no configurado) |
| `supabase/functions/socios-qr/` | ✅ deployada | `get-secret` (socio) / `validate` (portería) — TOTP server-side |
| `supabase/functions/socios-pagos/` | ✅ deployada (`--no-verify-jwt`) | `checkout` / `webhook` / `manual` / `associate-card` / `remove-card` / `charge-card` / `cobro-mensual` (cron) |
| `supabase/functions/_shared/totp.ts` | ✅ escrito | TOTP RFC 6238 puro (crypto.subtle, sin deps externas) |
| `supabase/functions/_shared/` | ✅ | `supabase-admin.ts` (service role client) + `cors.ts` (headers + helpers) |

**Secrets requeridos** (pendientes cuando estén disponibles):
```bash
supabase secrets set AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=us-east-1
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... RESEND_API_KEY=... CLUB_EMAIL_FROM=...
supabase secrets set CRON_SECRET=...   # para autorizar cobro-mensual desde pg_cron
```

**Comportamiento `validate-photo`**: si `AWS_ACCESS_KEY_ID` no está seteado, valida la foto manualmente (sin Rekognition) y pasa estado a `activo`. Cuando se configuren los secrets de AWS, usa Rekognition automáticamente.

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

## Notas de schema — v1

- Email de usuario vive en `auth.users`, NO en `profiles` — obtener con `getUser` action.
- `monto_sugerido` en eventos financieros almacenado en `descripcion` (no hay columna propia).
- `division_id IS NULL` en cobranzas/eventos = pedido global de Subcomisión.
- Columna de estado en `divisiones` es `activa` (boolean), NO `activo`.
- INSERT en `divisiones` requiere `categoria` NOT NULL — opciones: `infantil`, `juvenil`, `plantel_superior`, `femenino`, `rugby_mixed`.
- `push_tokens` upsert por `onConflict: 'token'`.
- Tipos de evento financiero: `'recaudacion' | 'viaje' | 'tercer_tiempo'`.

## Notas de schema — v2 (Módulo Socios)

### Tablas nuevas

| Tabla | Descripción |
|---|---|
| `categorias_socio` | Categorías de membresía con `monto_mensual`. Solo secretaria/admin modifican. |
| `socios` | Registro central del socio. `profile_id` → `profiles`. `estado`: `pendiente/activo/moroso/inactivo`. |
| `socios_secrets` | TOTP secret base32. **Sin políticas RLS** — solo service role. |
| `cuotas` | Una por socio por `periodo` (YYYY-MM). `monto` = snapshot del monto de categoría. |
| `pagos_socios` | Cada pago (MP o manual). `mp_payment_id` UNIQUE para deduplicación de webhook. |
| `noticias` | Feed institucional. `publicada=false` = borrador invisible para socios. |

### Roles nuevos en `profiles.rol`
`secretaria`, `porteria`, `socio` — agregados al CHECK constraint en migración `20260601000000`.

### Helper function nueva
`get_socio_id()` — retorna el `socios.id` del usuario autenticado. Usado en RLS de cuotas y pagos.

### Buckets de Storage
- `socios-fotos` — privado. Path: `{socio_id}/{filename}`. Signed URL para leer.
- `noticias-imagenes` — público. Path: `{noticia_id}/{filename}`.
- `comprobantes` — privado. Path: `{socio_id}/{pago_id}.pdf`. Solo Edge Function escribe (INSERT sin policy).

### Decisiones de diseño clave
- `socios_secrets` sin policies = solo service role puede acceder (Edge Functions).
- Cuotas se crean lazily al registrar pago — no hay cron job para generar cuotas mensuales (MVP).
- El socio NO puede insertar en `pagos_socios` — Mercado Pago usa webhook con service role.
- `socios.foto_path` actualizable por el propio socio (policy `socios_update_own_foto`).
- `numero_socio` auto-generado via secuencia `socios_numero_seq` (formato `0001`, `0002`…).
