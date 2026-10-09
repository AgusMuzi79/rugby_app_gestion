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
| `20260610000000_fix_push_tokens_delete_policy.sql` | DELETE policy `push_tokens` → `USING (true)` para fix de re-asignación entre usuarios | ✅ aplicada |
| `20260617000000_profiles_rls_secretaria_porteria.sql` | RLS SELECT en `profiles` para rol `secretaria` y `porteria` | ✅ aplicada |
| `20260617000001_fix_roles_array.sql` | Repara `profiles.roles[]` para socios sin `'socio'` en el array | ✅ aplicada |
| `20260618000000_fix_roles_includes_active_rol.sql` | Repara `profiles` donde el `rol` activo no estaba en `roles[]` | ✅ aplicada |
| `20260618000001_push_token_upsert_fn.sql` | Función `register_push_token(TEXT, TEXT)` SECURITY DEFINER — DELETE+INSERT bypasseando RLS | ✅ aplicada |
| `20261011000000_deuda_debito_antes_del_22.sql` | Redefine `importar_deuda_nuvix`: con fecha de corte antes del corte del débito (fecha de débito del mes + 3 días; si no hay fecha cargada, el 20), la cuota del mes (`concepto='cuota'`, período de la fecha de corte) de socios con `cobro_con_tarjeta` pasa de `vencido` a `a_vencer`, con vencimiento = `GREATEST(fecha de débito, fecha de corte)` (o el 20 si no hay fecha cargada; así no queda "a vencer" con fecha pasada dentro del margen de 3 días); se hace antes del semáforo. Totales de `importaciones_deuda` quedan como los informa NUVIX | ⏳ sin aplicar |
| `20261011000001_recordatorios_deuda_envios.sql` | Tabla `recordatorios_deuda_envios` (una fila por corrida del aviso de deuda: `mes` 'YYYY-MM' + `enviando`/`enviado`/`salteado`/`error`, motivo, conteos; índice único parcial en `mes` WHERE estado IN ('enviando','enviado') = reserva atómica del envío del mes, `error` no bloquea reintentar; una fila trabada en `enviando` se corrige a mano), RLS SELECT secretaria/admin/subcomision; `cron.schedule` documentado como comentario (`'0 13 22 * *'`, registrar a mano) | ⏳ sin aplicar |
| `20261015000000_eventos_financieros_manager.sql` | `eventos_financieros`: nuevas policies `eventos_financieros_insert_manager` (rol manager, tipo viaje/tercer_tiempo, `division_id` no nulo con `tiene_acceso_division`, `creado_por = auth.uid()`) y `eventos_financieros_update_manager` (mismas condiciones en USING y WITH CHECK: no puede convertirlo en recaudación ni moverlo de división; sin DELETE). Redefine `eventos_financieros_insert_subcomision`: sólo `tipo = recaudacion` (mismo filtro de disciplina). Trigger `guard_eventos_financieros_update` (función `guard_evento_financiero_update`, SECURITY DEFINER, mismo diseño que `guard_cuota_update`): el Manager sólo puede pasar `estado` 'activo' → 'cerrado', cualquier otra columna (o reabrir) tira excepción; service_role y demás roles exentos. Coordinador/admin sin cambios. Test de escenario: `supabase/tests/eventos_financieros_manager_rls.sql` (Postgres descartable en Docker) | ⏳ sin aplicar |

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
| `supabase/functions/admin-usuarios/` | ✅ completo | `create` / `assign-role` / `deactivate` / `reactivate` / `delete` / `getUser` |
| `supabase/functions/notifications/` | ✅ completo | lesión→Subcomisión, fichaje→Subcomisión, 4 ausencias consecutivas→Coordinador via Expo Push API |
| `supabase/functions/admin-socios/` | ✅ deployada | `create` / `deactivate` / `reactivate` / `validate-photo` (Rekognition con fallback manual si AWS no configurado) |
| `supabase/functions/socios-qr/` | ✅ deployada | `get-secret` (socio) / `validate` (portería) — TOTP server-side |
| `supabase/functions/socios-pagos/` | ✅ deployada (`--no-verify-jwt`) | `checkout` / `webhook` / `manual` / `associate-card` / `remove-card` / `charge-card` / `cobro-mensual` (cron) |
| `supabase/functions/importar-servicios/` | ⏳ escrita, sin deployar | Padrón de Servicios NUVIX desde el panel de Secretaría (FormData `archivo` + `modo` preview/confirmar + `bajas_aprobadas`). Espejo de `socio_servicios` para Gimnasio/Rugby/Hockey/Carnet Tenis/Rugby Inclusivo/Hockey Inclusivo: agrega, actualiza importe/variante y borra lo que no figura (incluidas filas manuales). Si el archivo no trae ninguna fila de un servicio mapeado (`servicios_ausentes`, p. ej. export parcial), la vista previa avisa y sus bajas arrancan destildadas. Tope de bajas masivas: si las bajas de un servicio presente superan el 30% de sus vínculos actuales (`servicios_baja_masiva`, p. ej. export cortado por socio), también avisa y arrancan destildadas. Las bajas se borran en lotes de 100 ids (van en la query string). Importe = `monto_mensual` del catálogo de la variante. Parser/diff puro en `_shared/parse-padron-servicios.ts` (+ `.check.ts`). Historial en `importaciones_servicios` (migración `20261009000000_importaciones_servicios.sql`, sin aplicar, ver `odd/tasks/import-servicios-panel.md`). Sólo secretaria/admin |
| `supabase/functions/importar-deuda/` | ✅ deployada (cambio ⏳ sin deployar) | Reporte de deuda NUVIX → semáforo. Desde 2026-10-07 resuelve socios por `numero_socio` en lotes (`buscarSociosPorNumero`, antes un `.in()` cortado en 1000 filas) y **ya no manda push** (no devuelve `recordatorios_deuda`) |
| `supabase/functions/recordatorio-deuda/` | ⏳ escrita, sin deployar (`--no-verify-jwt`) | Cron del día 22 (10:00 ART, `x-cron-secret`): push "Cuotas pendientes" a amarillo+rojo (menores al titular y a cada tutor activo de `tutores_menores`, sin repetir el mismo socio a un destinatario), sólo si el último reporte tiene 2 días o menos; una vez por mes de forma atómica (inserta una fila `enviando` del mes antes de mandar; si choca con el índice único saltea con motivo "ya se envió o está en curso") y al final la pasa a `enviado` (≥1 entregado) o `error` (ninguno entregado con fallas, o una consulta falló: libera el mes); si ese UPDATE final falla, lo loguea y la fila queda `enviando` (bloquea el mes, corregir a mano); `forzar=true` (query o body) saltea sólo el chequeo del día. Registra cada corrida en `recordatorios_deuda_envios`. Lógica en `_shared/recordatorio-deuda.ts` (check: `npx --yes tsx supabase/functions/_shared/recordatorio-deuda.check.ts`) |
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

- **`create`**: crea auth user con DNI como contraseña inicial + inserta `profiles` con `rol` y `roles:[rol]`. Email de bienvenida via Resend (fire & forget). Sin invite email.
- **`assign-role`**: busca socio por `socioId`, obtiene `nombre` via join `profiles!socios_profile_id_fkey`. Agrega `nuevoRol` a `roles[]` del perfil existente. **`socios` no tiene columnas `nombre` ni `email` — siempre se obtienen de `profiles`.**
- **`deactivate` / `reactivate`**: ban/unban usuario (876000h).
- **`delete`**: `supabaseAdmin.auth.admin.deleteUser(userId)` — cascade borra perfil y socio si existe.
- **`getUser`**: `supabaseAdmin.auth.admin.getUserById(userId)` → retorna `{ email }`. El email vive en `auth.users`, no en `profiles`.

### `_shared/cors.ts` — headers CORS

```ts
'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey'
```
`x-client-info` y `apikey` son necesarios cuando se llama via `supabase.functions.invoke()` (el SDK los agrega automáticamente).

### `register_push_token` — función SECURITY DEFINER

```sql
CREATE OR REPLACE FUNCTION register_push_token(p_token TEXT, p_plataforma TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER ...
BEGIN
  DELETE FROM push_tokens WHERE token = p_token;
  INSERT INTO push_tokens (usuario_id, token, plataforma) VALUES (auth.uid(), p_token, p_plataforma);
END;
```
Llamada desde `app/lib/notifications.ts` via `supabase.rpc('register_push_token', {...})`. Bypass de RLS necesario porque las policies de UPDATE e INSERT bloqueaban tanto upsert como delete+insert directo cuando el token pertenecía a otro usuario en el mismo dispositivo.

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
- Quién crea cada tipo (desde `20261015000000_eventos_financieros_manager.sql`): `viaje`/`tercer_tiempo` → Manager de la división; `recaudacion` → Subcomisión.

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

## Tutores de menores (2026-10-07, rama `worktree-tutor-menores`, sin aplicar)

- Migración `20261010000000_tutor_menores.sql`: rol `tutor` en los CHECK de `profiles`; tabla `tutores_menores` (tutor_profile_id, socio_id, relacion; sólo lectura propia + staff, escrituras sólo service role); tabla `tutor_verificaciones` (hash del código, vencimiento, intentos; RLS sin policies); `tutor_menores_ids()` SECURITY DEFINER; RPC `tutor_verificacion_consumir_intento` (consumo atómico del intento, sólo service_role).
- Policies SELECT para `tutor` sobre socios, profiles (del menor), cuotas, pagos_socios, socio_servicios, comprobantes_deuda, storage `comprobantes`, noticias (`todos`), eventos y resultados. No exigen menor de 13: el vínculo es la autorización. `jugadores` sin policy (igual que socio).
- Edge Function `registro-tutor` (pública, deploy con `--no-verify-jwt`): `solicitar` (match del mail contra `auth.users` del menor, código por Resend, 3/hora) y `verificar` (5 intentos, pasa al menor a `socio-{numero_socio}@uncas.local`, crea al tutor y el vínculo, rollback completo si algo falla).
- `socios-qr` `get-secret` con rama tutor; pushes de noticias, división, deuda (`importar-deuda`) y débito (`recordatorio-debito`) también llegan a los tutores.
