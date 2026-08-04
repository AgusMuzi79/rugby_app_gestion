# Proposal: Importador de deuda NUVIX — Semáforo de morosidad

## Problema

1. **La morosidad real vive fuera de la app.** El club no cobra a través de la app (MercadoPago fue descartado por la directiva) — todo el registro de cuotas, vencimientos y pagos ocurre en NUVIX, el sistema de gestión externo del club. Secretaría no tiene forma de ver, desde el panel web, quién debe y hace cuántos meses.
2. **El enfoque anterior para estimarla no sirvió.** La hipótesis de derivar morosidad de `FechaInicioLiquidacion` (columna del padrón NUVIX) se descartó: correlación de -0,06 contra la deuda real, 39% de falsos morosos. No hay proxy confiable dentro del padrón — hace falta el reporte de deuda real.
3. **El reporte real existe pero no es consultable.** El 2026-07-28 se obtuvo `RPT_Vencimientos`, el reporte de cuentas corrientes de NUVIX (Crystal Reports, `.xls` binario con bandas). Es preciso pero está pensado para imprimirse, no para cruzarlo contra los 1528 socios cargados ni para que secretaría lo consulte por color/urgencia.

## Solución

Un importador recurrente (mensual): secretaría sube el `.xls` de `RPT_Vencimientos` desde el panel web, se parsea, se valida por reconciliación exacta contra el Total General del propio reporte, se guarda el detalle completo (comprobante por comprobante) y se recalcula el semáforo de morosidad de cada socio activo.

**Semáforo** (contando períodos con `vencido > 0`, no comprobantes ni fechas de vencimiento):
- 🟢 Verde — 0 períodos adeudados
- 🟡 Amarillo — 1 período adeudado
- 🔴 Rojo — 2 o más períodos adeudados
- ⚪ Exento — categoría sin cargo (becado 100%, vitalicio, dependiente de grupo familiar)

Test de aceptación (contra `todos_desde_el_2022.xls`, fecha de corte 28/07/2026): **verde 1.273 · amarillo 100 · rojo 108**, monto en rojo **$12.995.950**.

## Prerequisito — ya resuelto, no requiere migración nueva

El plan original asumía que hacía falta agregar `socios.nuvix_cod_cliente`. **No es así**: `socios.numero_socio` (`text`, `NOT NULL UNIQUE`) ya contiene el Cód. Cliente de NUVIX — lo pobló `scripts/import-socios-masivo.mjs` (`numero_socio: row.cod`) para los 1528 socios reales cargados en 2026-07-29/30. El cruce del importador de deuda va contra esta columna existente.

Riesgo conocido (no bloqueante, ver design.md): socios dados de alta manualmente *después* de la carga masiva reciben un `numero_socio` autogenerado por secuencia (4 dígitos), que no es un código NUVIX real — quedan sin match hasta que también existan en NUVIX.

## Alcance de esta change

- **1 migración**: tablas `importaciones_deuda` y `comprobantes_deuda`, columnas nuevas en `socios` (`semaforo`, `deuda_vencida`, `meses_impagos`, `mora_max_dias`, `deuda_actualizada_at`), índices y RLS.
- **1 Edge Function nueva**: `importar-deuda` (`verify_jwt` activo, rol `secretaria`/`admin`) — parsea, valida, guarda y recalcula el semáforo.
- **1 página web nueva**: `web/app/(secretaria)/secretaria/deuda/page.tsx` — subida de archivo, resultado del import, historial, listado de socios filtrable por color.

## No incluye

- **Ninguna pantalla existente se modifica** — ni mobile ni web. Esto incluye la pantalla de cuotas del socio (`(socio)/cuotas.tsx` / `useCuotas`), que sigue mostrando el flujo interino de alias + comprobante sin cambios, y el filtro "Moroso" que ya existe en `web/.../secretaria/socios/page.tsx` (hoy basado en `socios.estado = 'moroso'`, un valor que solo seteaba el flujo legacy de débito automático con tarjeta, descartado — ver design.md, es una inconsistencia a resolver en un follow-up, no acá).
- **La app del socio no muestra el semáforo de 3 colores** (ni ahora ni en el diseño de esta change se construye) — si en el futuro se decide mostrarle algo, sería una versión binaria (activo/pendiente), sin comparar contra otros socios. Esta change documenta esa idea en design.md como decisión de diseño para un follow-up, **no la implementa**.
- **La pantalla mobile de detalle de deuda del socio** (agrupada por período, con sello de frescura, sección de plan de regularización, "a vencer" informativo) se documenta en design.md a nivel de diseño para que quede lista para un follow-up — no se construye en esta change (no hay pantalla mobile en el alcance).
- **Portería no cambia** — nunca vio ni va a ver estado de pago.
- No se implementa aprobación/edición manual de comprobantes de deuda ni reglas de excepción caso por caso (ej. "descontar esta cuota a mano") — el importador es la única fuente de verdad; corregir un error implica corregirlo en NUVIX y reimportar.

## Impacto esperado

- Secretaría prioriza a quién llamar por color, sin cruzar manualmente contra NUVIX.
- Datos de morosidad reales (no un proxy) que además evitan castigar a los 5 socios activos en plan de regularización (`reg_cesantes`) tratándolos como si debieran cuota social.
- Base de datos (`comprobantes_deuda`) que habilita, más adelante y sin volver a tocar el parser, la pantalla de detalle del socio y reportes de evolución de mora mes a mes.
