# Tasks: Importador mensual de socios

## T0 — Prerequisito manual (antes de cualquier código)

- [ ] Conseguir un archivo real de muestra del "padrón general" mensual que va a subir secretaría — bloquea T1 y T3 por completo (design.md §1). **Pendiente — Agus lo habla con secretaría.**
- [x] ~~Confirmar con Agus las 6 decisiones abiertas de design.md §10~~ — reingreso (§6) y los 12 socios de secuencia (§4) ya resueltos (2026-08-19); formato de archivo (§1/§2) y notificación de baja (§7) siguen pendientes, se resuelven junto con el archivo de muestra.
- [x] ~~Identificar y resolver los socios con `numero_socio` autogenerado~~ — resuelto (2026-08-19, design.md §4): eran sólo 2 cuentas, ninguna un socio real. `testfreeze@uncas.local` ya se borró. Queda pendiente para T2: agregar el flag de exclusión permanente de `demo@uncas.local` (necesaria para las revisiones de Apple/Google, nunca va a estar en ningún padrón real).

## T1 — Migración

- [ ] `CREATE TABLE importaciones_socios` (design.md §3)
- [ ] `ALTER TABLE socios ADD COLUMN ultima_importacion_id`
- [ ] RLS: `secretaria_admin_all_importaciones_socios` (mismo patrón que `importaciones_deuda`)
- [ ] Función Postgres `SECURITY DEFINER` `aplicar_import_socios(jsonb)` — altas + cambios + bajas de `estado`/`categoria_id`/servicios en una sola transacción (NO incluye las llamadas a `auth.admin`, que quedan en la Edge Function — ver design.md §8 nota)
- [ ] **Depende de T0** — no craftear el payload real de la función hasta tener el formato del archivo confirmado

## T2 — Edge Function `importar-socios`

- [ ] Scaffold `supabase/functions/importar-socios/index.ts`, `verify_jwt` activo, roles `secretaria`/`admin`
- [ ] Parser del Excel mensual (columnas a definir tras T0 — design.md §1)
- [ ] Cálculo del diff (altas/bajas/cambios) contra `socios` real — sin escribir nada (design.md §2)
- [ ] Endpoint/modo de "preview" — devuelve el diff calculado sin aplicar (design.md §9)
- [ ] Endpoint/modo de "confirmar" — aplica altas (mismas reglas de síntesis que `scripts/import-socios-masivo.mjs`: DNI→`SD{código}`, email→`socio-{código}@uncas.local`, password=DNI, `roles=['socio']`, `estado='pendiente'`)
- [ ] Aplicar bajas: `auth.admin.updateUserById(profile_id, { ban_duration: '876000h' })` + `socios.estado='inactivo'` (mismo patrón que `admin-socios/index.ts:162-165`) — resolver el orden y manejo de fallos parciales (design.md §2)
- [ ] Aplicar cambios de categoría/servicios — **depende de la respuesta a design.md §5**, no empezar antes
- [ ] `INSERT importaciones_socios` + `UPDATE socios.ultima_importacion_id` para los afectados
- [ ] Response: `{ altas, bajas, actualizados, sin_cambio, errores }`
- [ ] Manejo de reingreso — reactivación automática (mismo mecanismo que `handleReactivate`), decisión ya tomada en design.md §6
- [ ] Manejo de notificación de baja — implementación depende de la decisión en design.md §7

## T3 — Página web

- [ ] `web/app/(secretaria)/secretaria/socios-import/page.tsx` (o ruta que se defina) — guard de rol vía `(secretaria)/layout.tsx`, mismo patrón que el resto
- [ ] Sección subida de archivo + botón "Calcular cambios" (preview, no aplica todavía)
- [ ] Sección preview del diff — listas de altas/bajas/cambios con nombres, antes de confirmar
- [ ] Botón "Confirmar y aplicar" — sólo entonces se ejecuta el paso de escritura
- [ ] Sección historial de importaciones (`importaciones_socios`, orden desc)
- [ ] Link en `web/components/SidebarSecretaria.tsx`
- [ ] **Sacar el modal "+ NUEVO SOCIO"** de `web/app/(secretaria)/secretaria/socios/page.tsx` (creación manual) — sólo una vez que el import esté probado y funcionando en producción, no antes (no dejar a secretaría sin ninguna forma de dar de alta mientras el import todavía se está validando)
- [ ] `npx tsc --noEmit` sobre `web/` sin errores

## T4 — Validación end-to-end

- [ ] Probar contra el primer archivo real: comparar altas/bajas/cambios calculados contra lo que secretaría espera manualmente para una muestra chica antes de confiar en el resultado completo (mismo criterio que se usó para validar el importador de deuda contra el archivo de referencia)
- [ ] Confirmar idempotencia: correr el mismo archivo dos veces seguidas → 0 altas/0 bajas/0 cambios la segunda vez
- [ ] Confirmar que una baja real bloquea el login (probar con una cuenta de prueba, no con un socio real)
- [ ] Confirmar que un alta nueva puede loguearse con DNI como contraseña inicial
- [ ] Validar el caso de reingreso según la decisión tomada en design.md §6

## Fuera de esta change (no crear tasks todavía)

- Cruce contra la UAR (`Jugadores.xls`) para vínculo jugador↔división — sigue siendo un proceso aparte, no absorbido por este import (proposal.md "No incluye")
- Cualquier UI para editar servicios/categoría de liquidación a mano socio por socio — el import es la fuente de verdad, corregir un error implica corregirlo en NUVIX y reimportar (mismo criterio que el importador de deuda)
