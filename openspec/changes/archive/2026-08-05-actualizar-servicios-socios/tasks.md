# Tasks: Reconciliación de categorías, servicios y precios de Socios

**Estado: COMPLETA (2026-08-05).** Aplicada en producción (`tlexvbattnzpmdftjsao`), verificada con un dry-run posterior que da 0 diffs pendientes contra los 8 tests de aceptación de `design.md` §12. Falta archivar la change (`/opsx:archive`) cuando Agus lo confirme.

## T0 — Confirmaciones previas — RESUELTO (revisión 2)

- [x] Total de referencia: **1.528 socios**, no 1.534. Las 6 filas de más son cuentas institucionales de NUVIX (Casino, Colegio Nuestra Tierra, UAR, Universidad Nacional del Centro, Nativa Compañía de Seguros, Gómez Marcelo) — se excluyen por regla explícita (`categoria_padron = 'Cliente'`), no como error silencioso.
- [x] Sin liquidación: **34**, no 40 ni 72 — descontadas las 6 institucionales del número de la v1.
- [x] Becados que cambian de categoría: **31**, confirmado correcto (26 aterrizan en Activo Mayor/Menor, 5 en Dependiente Grupo Familiar/Titular de Grupo — ambos subgrupos cuentan).
- [x] Diff declarativo confirmado — reemplaza los deltas fijos del pedido original.
- [x] Modelo de precio de Gimnasio: **descartada la matriz por combinación y también el catálogo con variantes Mayor/Menor.** Decisión final: catálogo con una sola fila por servicio, precio informativo; `socio_servicios.importe` (autoritativo) + `socio_servicios.variante_nuvix` (trazabilidad). Ver design.md §2.
- [x] `categorias_socio_historial` + trigger: incluido en la migración.
- [x] "Beca como descuento" (design.md §7): **no se implementa** — queda documentada, pendiente de hablarlo con el club. Ver "Fuera de esta change" abajo.

## T1 — Migración — APLICADA

- [x] `20260805000001_reconciliacion_servicios_socios.sql` — `socio_servicios.importe`/`.variante_nuvix`, catálogo (alta Hockey Inclusivo/Rugby Inclusivo, rename Tenis Carnet→Carnet Tenis, precios informativos, Tenis→`activo=false`), `categorias_socio` (precios corregidos), `categorias_socio_historial`+trigger, `reconciliaciones_socios`+RLS. Pusheada con `supabase db push --linked`.
- [x] `20260805000002_fix_gimnasio_catalogo_drift.sql` — migración extra, no prevista en el diseño original. Ver "Incidente" abajo.

## T2 — Script de reconciliación (`scripts/reconciliar-servicios-socios.mjs`) — CORRIDO

- [x] Dry-run por default, `--commit` para aplicar — sin transacción SQL única (ver nota de diseño en el script), pero idempotente: cortar a mitad de camino y volver a correr retoma sin duplicar.
- [x] Corrido en 2 tandas de `--commit` (la segunda después de resolver el incidente de catálogo) — 0 errores en ambas.
- [x] Idempotencia confirmada en la práctica: el dry-run final da 0 en todos los diffs.

## T3 — Validación del dry-run — CERRADA, 8/8 tests

| Métrica | Esperado | Obtenido |
|---|---|---|
| Socios matcheados en base | 1.528 | 1.528 ✓ |
| Excluidos institucionales | 6 | 6 ✓ |
| No matcheados | 0 | 0 ✓ |
| Categorías actualizadas | 59 | 59 ✓ |
| Sin liquidación (revisar Secretaría) | 34 | 34 ✓ |
| Vínculos socio↔servicio | 970 | 970 ✓ |
| Por servicio | Hockey 293 · Rugby 258 · Gimnasio 249 · Carnet Tenis 156 · Hockey Inclusivo 8 · Rugby Inclusivo 6 · Tenis 0 | exacto ✓ |
| Facturación mensual estimada | $57.185.000 | $57.185.000 ✓ |

## T4 — Ejecución real — COMPLETA

- [x] Corrida en 2 tandas (ver incidente abajo), sin errores en ninguna.
- [x] Tests de aceptación post-aplicación: 8/8 (tabla de arriba, confirmada con un dry-run posterior a la segunda tanda).
- [x] Los 34 socios sin liquidación no se tocaron (la reconciliación nunca los incluye en ningún diff, por diseño).
- [x] `database.types.ts` regenerado (`app/lib/database.types.ts`) — de paso se repitió el bug ya conocido de `CLAUDE.md` (stderr de la CLI mezclado en el archivo por no separar la redirección), corregido en el momento.

## Incidente durante T4 — catálogo de Gimnasio modificado fuera de migraciones

El primer `--commit` aplicó todo excepto Gimnasio: `servicios_opcionales` no tenía ninguna fila llamada exactamente "Gimnasio". El script detectó el problema y lo reportó como error sin escribir nada mal (ni duplicó, ni adivinó un id) — se comportó como estaba diseñado.

Investigando: la fila original "Gimnasio" (seed de `20260609000000`, con sus 115 vínculos ya existentes) había sido renombrada a "Gimnasio Mayor" **directo en producción, sin ninguna migración que lo registre**, y existían además "Gimnasio Menor" y "Alicuota Deporte Inclusivo" (ambas sin vínculos), tampoco documentadas en ningún lado del repo. Agus confirmó que los cambios eran suyos — exploración de la idea de catálogo con variantes que después se descartó en esta misma change (ver design.md §2).

Fix: `20260805000002_fix_gimnasio_catalogo_drift.sql` deshace el rename (mismo id, preserva los 115 vínculos) y desactiva (no borra) las otras dos filas sin uso. Con eso, el segundo `--commit` cerró los 249 vínculos de Gimnasio sin errores.

## Fuera de esta change (no crear tasks todavía)

- Beca como descuento (`socios.beca_pct`, deprecar categorías Becado *, tocar `useCuotas`/cálculo de cuota) — depende de confirmación del club, ver design.md §7. 31 socios documentados y sin tocar.
- Ajustar `socios-pagos` (`declarar-comprobante`/`handleCheckout`) para leer `socio_servicios.importe` en vez de recalcular desde `servicios_opcionales.monto_mensual` — necesario antes de confiar en ese flujo para servicios opcionales, pero el flujo está en pausa (ver proposal.md, "Consecuencia para código existente")
- Pantalla de revisión para los 34 socios "sin liquidación" en el panel de Secretaría — hoy sólo quedan en el reporte guardado en `reconciliaciones_socios`, sin UI dedicada
- Flujo recurrente de sincronización mensual del Padrón de Servicios (mismo espíritu que el importador de deuda NUVIX, pero para servicios/categorías en vez de morosidad) — esta change fue una reconciliación puntual, no un import recurrente
