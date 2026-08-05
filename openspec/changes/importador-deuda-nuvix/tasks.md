# Tasks: Importador de deuda NUVIX — Semáforo de morosidad

## T1 — Migración

- [x] Crear migración `20260804000000_importador_deuda_nuvix.sql`
- [x] `CREATE TABLE importaciones_deuda` (ver design.md §3)
- [x] `CREATE TABLE comprobantes_deuda` (ver design.md §3), con `CHECK` de `periodo` y `concepto`
- [x] Índices: `comprobantes_deuda (importacion_id)`, `comprobantes_deuda (socio_id)`, `socios (semaforo)`
- [x] `ALTER TABLE socios` — agregar `semaforo`, `deuda_vencida`, `meses_impagos`, `mora_max_dias`, `deuda_actualizada_at`
- [x] RLS: `secretaria_admin_all_importaciones`, `secretaria_admin_all_comprobantes`, `socio_select_own_comprobantes` (design.md §3)
- [x] Función Postgres `SECURITY DEFINER` `importar_deuda_nuvix(jsonb)` para el paso transaccional del import (delete-por-fecha-corte + insert importación + insert comprobantes bulk + recálculo de semáforo de todos los socios activos) — misma migración, `EXECUTE` restringido a `service_role`
- [x] Validación offline del parser contra el archivo real (`data/import/todos desde el 2022.xls`, sin tocar Supabase) — ver detalle en el ítem de T2 más abajo
- [x] **Checkpoint superado (OK de Agus)** — `supabase db push` corrido, migración aplicada en cloud (`tlexvbattnzpmdftjsao`) sin errores
- [x] `database.types.ts` regenerado (`app/lib/database.types.ts`) — de paso corrigió una corrupción preexistente del archivo (un `supabase gen types` anterior había volcado el log de PowerShell adentro en vez de redirigir sólo stdout)

## T2 — Edge Function `importar-deuda`

- [x] Scaffold `supabase/functions/importar-deuda/index.ts`, `verify_jwt` activo (default, no se pasó `--no-verify-jwt`)
- [x] Validar rol del caller (`secretaria` | `admin`) contra `profiles`, no confiar en el body
- [x] Parser NUVIX en `_shared/parse-deuda-nuvix.ts`: clasificación de filas por posición (design.md §1), máquina de estados "cuenta actual" abre/cierra
- [x] Derivación de `periodo`/`concepto` desde `descripcion` — **reescrita tras probar contra el archivo real**: las 4 reglas literales originales dejaban 433/1792 comprobantes sin clasificar (mucha variedad de redacción que el spec no anticipaba: "Mes de" ausente, año duplicado en el medio del texto, meses sin año, medio-mes de gimnasio con otro orden de palabras). Generalizada a 3 señales por confiabilidad — código M-YYYY en cualquier parte del texto → nombre de mes en cualquier parte → fallback a vencimiento — sin tocar la prioridad absoluta de `REG. CESANTES`. Bajó a 57/1792 sin clasificar, y esos 57 resultaron ser genuinamente otra cosa (cuentas de Proveedores: "COBRO A CLIENTES", "Distribuidora Espora", "Publicidad" — no son cuota social)
- [x] Validación de reconciliación (`Σ subtotales === Total General`) — aborta sin llamar al RPC si falla, devuelve el detalle del desbalance. **Verificado contra el archivo real: reconcilia exacto**
- [x] Resolución de `cod_cliente` → `socio_id` vía `socios.numero_socio` (un solo `SELECT ... WHERE numero_socio IN (...)`, no N+1)
- [x] Invocar la función Postgres transaccional (RPC `importar_deuda_nuvix`) con el payload parseado
- [x] Response: `{ comprobantes, personas, socios_matcheados, sin_match, verde, amarillo, rojo, exento }` — `comprobantes` excluye las filas SALDO ANTERIOR (verificado: 1792 filas de detalle − 53 SALDO ANTERIOR = 1739, el número que dio el club)
- [x] Validación offline (Node, sin tocar Supabase) contra `todos_desde_el_2022.xls`: reconcilia ✓, personas = 536 ✓ (exacto), comprobantes = 1739 ✓ (exacto)
- [ ] **Todavía pendiente**: el conteo final verde/amarillo/rojo/exento y el monto en rojo ($12.995.950) — esto necesita el cruce contra `socios.numero_socio` real en la base, no se puede simular offline. Falta correrlo importando el archivo real desde la página ya deployada.
- [x] **Checkpoint superado (OK de Agus)** — `supabase functions deploy importar-deuda` corrido, deployada en cloud (`tlexvbattnzpmdftjsao`)

## T3 — Página web `secretaria/deuda`

- [x] `web/app/(secretaria)/secretaria/deuda/page.tsx` — guard de rol ya lo resuelve `(secretaria)/layout.tsx` (mismo patrón que el resto de las páginas del grupo)
- [x] Sección subida de archivo (`.xls`) + botón importar + loading state
- [x] Sección resultado del import (resumen de la Edge Function; error prominente si `reconcilia = false`)
- [x] Sección historial de importaciones (tabla de `importaciones_deuda`, orden desc por `fecha_corte`)
- [x] Sección listado de socios filtrable por color (chips texto rojo/amarillo/verde/exento, mismo patrón visual que el filtro de estado en `secretaria/socios/page.tsx`)
- [x] Identidad visual: tokens Tailwind ya definidos en `globals.css` (`bg-papel`, `text-tinta`, `bg-card`, `border-gris-claro`, `text-oro`, `text-oro-hondo`, `font-playfair`/`font-lora` — mapean a la paleta de CLAUDE.md, `--font-playfair`/`--font-lora` ya apuntan a Barlow pese al nombre de la clase)
- [x] `npx tsc --noEmit` sobre `web/` — sin errores de tipos
- [x] Link "Importar" agregado a `web/components/SidebarSecretaria.tsx` (confirmado por Agus — excepción puntual a "una página nueva, nada más")

## T4 — Validación end-to-end

Corrido en producción real (commit+push a Vercel, import real vía `/secretaria/deuda` con el archivo `todos_desde_el_2022.xls`, usando la sesión de Agus ya logueada en el navegador). Encontró y corrigió 2 bugs reales que no aparecían en la validación offline (esa validación no cruza contra `socios` real):

- [x] **Bug 1 — semáforo vacío (0/0/0/0)**: `estado = 'activo'` no matcheaba a casi ningún socio real — los 1528 socios de la carga masiva quedaron en `pendiente` (falta validar foto en bulk, un paso manual separado). Fix: migración `20260804000001` — el semáforo participa para `estado IN ('activo', 'pendiente')`, decisión explícita de Agus.
- [x] **Bug 2 — exento infló a 653**: "exento" estaba definido por `categorias_socio.monto_mensual = 0`, que también incluye "Dependiente Grupo Familiar" (la categoría de la mayoría de los socios — se factura a través del titular, no significa exento de deuda). Fix: migración `20260804000002` — exento ahora es por nombre de categoría (`Vitalicio`, `Becado Rugby`, `Becado Hockey`, `Becado Tenis`), no por monto.
- [x] Importar `todos_desde_el_2022.xls` desde la página real: comprobantes 1739 ✓, personas 536 ✓ (exactos). **rojo 102 / amarillo 96 / verde 1278 / exento 52** — vs. target rojo 108 / amarillo 100 / verde 1273 (exento no tiene target explícito del club). Diferencia de ~5-6 por balde (~0.4% del total), suma exacta a 1528. No se investigó más a fondo — requeriría acceso de lectura directo a la base (no se usó `SUPABASE_SERVICE_ROLE_KEY` en esta sesión por decisión de no pedirla por chat).
- [ ] Decidir con Agus si esta precisión es aceptable o si vale la pena seguir cerrando el ~0.4% de diferencia
- [ ] Reimportar el mismo archivo (misma fecha de corte) y confirmar que no duplica (idempotencia) — implícitamente ya validado: se reimportó 3 veces durante este debugging y `comprobantes_deuda`/`importaciones_deuda` nunca duplicaron (siempre 1739 comprobantes, 1 fila en historial)
- [ ] Importar un archivo con fecha de corte distinta y confirmar que no borra la importación anterior — no probado (sólo se tiene el archivo de referencia)
- [ ] Confirmar que un socio con deuda saldada en el archivo nuevo (no aparece más) vuelve a verde — no probado (necesita un segundo archivo)
- [ ] **Hallazgo colateral, sin resolver**: el botón "IMPORTAR" no respondía a clicks via automatización estándar de browser (`computer` tool) después de que `file_upload` seteara el archivo — el estado de React (`archivo`) sí se actualizaba correctamente (confirmado por JS), pero el clic no disparaba el handler hasta invocarlo directo con `element.click()` vía JS. Podría ser un artefacto específico de la automatización, no necesariamente un bug real para un click humano normal — no se pudo confirmar ninguna de las dos cosas.

## Fuera de esta change (no crear tasks todavía)

- ~~Semáforo binario en `(socio)/cuotas.tsx` / `useCuotas`~~ — **implementado 2026-08-04** (follow-up separado, ver CLAUDE.md). `useCuotas` lee `socios.semaforo`/`deuda_actualizada_at`, expone `alDia` (booleano) + `deudaActualizadaAt`. `cuotas.tsx` muestra un tercer banner sólo si `!alDia`, con la fecha de corte; si está al día no muestra nada (decisión de Agus). Cambio 100% JS — requiere build/OTA nueva del mobile, no se pudo probar visualmente en un dispositivo real en esta sesión.
- ~~Pantalla mobile de detalle de deuda del socio~~ — **implementada 2026-08-05**. Modal en `(socio)/cuotas.tsx` (`DeudaClubModal`), disparado al tocar el banner de deuda. `useDeudaDetalle.ts` trae la última `importaciones_deuda` + `comprobantes_deuda` propios y agrupa por período. Las 3 reglas del diseño original (sello de frescura, reg_cesantes aparte, a_vencer informativo) implementadas tal cual. Requirió una migración nueva (`20260804000004`) — la RLS de `importaciones_deuda` sólo tenía policy para secretaria/admin, un socio no podía leer ni la `fecha_corte` para el sello de frescura. Cambio 100% JS + 1 migración — requiere build/OTA nueva del mobile, no se probó visualmente en un dispositivo real en esta sesión.
- Resolver la inconsistencia con el filtro "Moroso" legacy en `secretaria/socios/page.tsx` — ver design.md §7.3
