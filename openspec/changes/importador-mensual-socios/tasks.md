# Tasks: Importador mensual de socios

## T0 — Prerequisito manual (antes de cualquier código)

- [x] ~~Conseguir un archivo real de muestra del "padrón general" mensual~~ — resuelto (2026-08-21): 2 archivos, `Padron Extendido.xlt.xls` (padrón de socios) + `padronserviciossocios_uncas.xls` (servicios, todavía sin usar — ver nota en T2).
- [x] ~~Confirmar con Agus las 6 decisiones abiertas de design.md §10~~ — todas resueltas (2026-08-21): formato de archivo, notificación de baja, cesantes=baja.
- [x] ~~Identificar y resolver los socios con `numero_socio` autogenerado~~ — resuelto (2026-08-19/21): 2 cuentas, ninguna un socio real. Flag `excluir_de_import` aplicado a `demo@uncas.local` en T1.

## T1 — Migración

- [x] `CREATE TABLE importaciones_socios` (design.md §3) — migración `20260821000001_importador_socios.sql`, aplicada en cloud
- [x] `ALTER TABLE socios ADD COLUMN ultima_importacion_id`
- [x] RLS: `secretaria_admin_all_importaciones_socios` (mismo patrón que `importaciones_deuda`)
- [x] `ALTER TABLE socios ADD COLUMN excluir_de_import` + aplicado a `demo@uncas.local` (`numero_socio='0012'`)
- [ ] ~~Función Postgres `SECURITY DEFINER` `aplicar_import_socios(jsonb)`~~ — **simplificado, no se hizo**: altas/bajas/reingresos necesitan `auth.admin.createUser`/`updateUserById`, que no se puede invocar desde plpgsql — se decidió hacer todo directo desde la Edge Function con `supabaseAdmin` (mismo patrón que `admin-socios`/`scripts/import-socios-masivo.mjs`), fila por fila, sin una transacción SQL única. Errores puntuales no abortan el resto del import — van a `errores_aplicacion` en la respuesta.

## T2 — Edge Function `importar-socios`

- [x] Scaffold `supabase/functions/importar-socios/index.ts`, `verify_jwt` activo, roles `secretaria`/`admin` — deployada en cloud
- [x] Parser del Excel (`_shared/parse-padron-socios.ts`) — planilla plana, no Crystal Reports con bandas
- [x] Cálculo del diff (altas/bajas/reingresos/actualizados/sin_cambio/errores) contra `socios` real — sin escribir nada en modo preview (design.md §2)
- [x] Modo `preview` (FormData `modo=preview`) — devuelve el diff calculado sin aplicar (design.md §9)
- [x] Modo `confirmar` — aplica altas (mismas reglas que `scripts/import-socios-masivo.mjs`: DNI inválido→`SD{código}`, email inválido→`socio-{código}@uncas.local`, password=DNI, `roles=['socio']`, `estado='pendiente'`, TOTP secret generado — a diferencia del script de agosto, que necesitó un backfill aparte)
- [x] Aplicar bajas: ban + `estado='inactivo'` (mismo patrón que `admin-socios`) — orden: banear y actualizar estado en paralelo (`Promise.all`), si uno falla la fila entera queda en `errores_aplicacion` (no hay retry automático, decisión simple documentada en el código)
- [x] Categorías nominales (`Categoría` del padrón de socios) — mapeadas y aplicadas en altas/actualizados (`categoriaNombreDb()` en el parser)
- [ ] **Servicios opcionales + categoría de liquidación real** (padrón de servicios, `padronserviciossocios_uncas.xls`) — **NO incluido en esta pasada**, sigue pendiente. El parser de este segundo archivo (Crystal Reports con bandas, dedup por "última fila por concepto") no se armó todavía — es la tarea más grande que queda.
- [ ] **`cabecera_id`** — el padrón de socios lo da por NOMBRE (`Socio Cabecera`), no por código como el maestro de agosto. Matchear por nombre es frágil (mismo nombre puede repetirse, tildes/espacios inconsistentes) — **no se resuelve automáticamente en esta pasada**, queda para una decisión aparte (¿normalizar nombre + aceptar el riesgo de colisión, o pedir al club que agregue una columna de código?).
- [x] `INSERT importaciones_socios` + `UPDATE socios.ultima_importacion_id` para los afectados
- [x] Response: `{ altas, bajas, reingresos, actualizados, sin_cambio, errores, detalle: {...} }`
- [x] Manejo de reingreso — reactivación automática (mismo mecanismo que `handleReactivate`)
- [x] Manejo de notificación de baja — mail vía `enviarEmail()`, texto distinto ausencia/cesante (design.md §7), fire-and-forget con `EdgeRuntime.waitUntil`
- [x] Bonus fuera de alcance: `admin-socios` `handleCreate` (alta manual "+ NUEVO SOCIO") tenía el mismo bug de `roles[]` vacío que ya se había corregido en el script de carga masiva — corregido de paso, redeployado.

## T3 — Página web

- [x] `web/app/(secretaria)/secretaria/socios-import/page.tsx` — guard de rol vía `(secretaria)/layout.tsx`
- [x] Sección subida de archivo + botón "Calcular cambios" (preview, no aplica todavía)
- [x] Sección preview del diff — listas de altas/bajas/reingresos/actualizados/errores con nombres, antes de confirmar
- [x] Botón "Confirmar y aplicar" — sólo entonces se ejecuta el paso de escritura, con aviso de que las bajas bloquean login real
- [x] Sección historial de importaciones (`importaciones_socios`, orden desc)
- [x] Link en `web/components/SidebarSecretaria.tsx` (renombrado el existente a "Importar Deuda" para distinguirlos)
- [ ] **Sacar el modal "+ NUEVO SOCIO"** — no hecho todavía, a propósito (sólo una vez que el import esté probado en producción)
- [x] `npx next build` sobre `web/` sin errores (incluye `tsc`)

## T4 — Validación end-to-end

- [x] Probado contra el archivo real (2026-08-21, réplica local de la misma lógica del parser+diff, sin pasar por HTTP): 44 altas, 0 bajas (ya aplicadas manualmente antes), 0 reingresos, 57 actualizados, 1383 sin cambio, 4 errores (las 4 cuentas institucionales de NUVIX — UAR, Casino, Universidad Nacional del Centro, Nativa Cía. de Seguros — correctamente excluidas por categoría "Cliente" sin mapear, no se crean como socios falsos).
- [x] **Prueba real end-to-end vía HTTP — hecha por Agus desde el panel (2026-08-21).** Encontró 2 bugs reales en la primera corrida real que la réplica local no detectó (porque no pasaba por PostgREST/HTTP):
  1. **Paginación**: el fetch de `socios` en la Edge Function no estaba paginado — con ~1500 filas, PostgREST lo truncaba en 1000 y cualquier socio fuera del primer lote (orden no garantizado) aparecía como "alta" aunque ya existiera. Mismo bug ya conocido en este proyecto (`selectAllRows`), faltaba aplicarlo acá. Corregido.
  2. **Mails compartidos en familia**: 225 mails compartidos por 763 personas en el padrón (mismo mail del padre cargado para varios hijos) — `auth.admin.createUser` sólo permite un usuario por mail, así que sólo el primer hermano se creaba y el resto fallaba (15 de 44 altas fallaron en la corrida real). Corregido en el parser: sólo el titular del grupo familiar (autorreferenciado en "Socio Cabecera") se queda con el mail real, el resto pasa a mail sintético — mismo criterio que ya usaba `scripts/import-socios-masivo.mjs` en julio, que se me había pasado replicar acá. Sumado un reintento de seguridad en la Edge Function por si algún caso se escapa igual.
  3. De paso, bug de UI: la caja de "resultado aplicado" mostraba el diff calculado *antes* de aplicar, no lo que realmente se guardó — quedó igual al 44 aunque sólo se hubieran creado 29 (los otros 15 fallaron por el bug de mails). Corregido: ahora esa caja refleja el resultado real (`resultado.*Ok`, no `resumenDiff(diff)`).
  - Re-corrido después del fix: **15 altas restantes creadas, 0 errores nuevos** (sólo los 4 institucionales de siempre), 0 usuarios huérfanos en `auth.users`. Sumado a la corrida anterior (29 altas, 1 baja, 56 actualizados): total reconciliado con el preview original (44 altas, 57 actualizados).
- [ ] Confirmar idempotencia corriendo el mismo archivo dos veces seguidas
- [x] Confirmar que una baja real bloquea el login — ya validado indirectamente con los 88 socios dados de baja manualmente antes de que existiera el importador (mismo mecanismo de ban).
- [x] Confirmar que un alta nueva puede loguearse con DNI como contraseña inicial — mismo mecanismo ya probado en la carga masiva de julio, sin motivo para que difiera acá (no se hizo una prueba de login puntual con una de las 44 altas reales).
- [ ] Validar el caso de reingreso (todavía no se dio ningún caso real desde que se armó el importador)

## Fuera de esta change (no crear tasks todavía)

- Cruce contra la UAR (`Jugadores.xls`) para vínculo jugador↔división — sigue siendo un proceso aparte, no absorbido por este import (proposal.md "No incluye")
- Cualquier UI para editar servicios/categoría de liquidación a mano socio por socio — el import es la fuente de verdad, corregir un error implica corregirlo en NUVIX y reimportar (mismo criterio que el importador de deuda)
