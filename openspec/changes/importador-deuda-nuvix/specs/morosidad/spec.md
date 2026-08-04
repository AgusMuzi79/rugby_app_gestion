# Spec: Morosidad (nuevo capability)

> Delta propuesto por la change `importador-deuda-nuvix`. Al archivar la change, este archivo se incorpora como `openspec/specs/morosidad/spec.md` y se agrega una fila a `openspec/specs/README.md`.

## Dominio
`morosidad`

## Descripción
Visualización del estado de pago de cuotas sociales de cada socio, a partir de un importador recurrente del reporte de cuentas corrientes de NUVIX (`RPT_Vencimientos`), sistema externo del club donde ocurre el cobro real. La app no cobra — sólo refleja, con un semáforo de 3 colores, la deuda que NUVIX ya registró.

## Actores
- **Secretaría** — sube el archivo de deuda, ve el semáforo de todos los socios, prioriza a quién contactar
- **Admin** — mismo acceso que Secretaría
- **Socio** — (alcance futuro, no expuesto en UI todavía) podrá leer el detalle de su propia deuda vía RLS

## Modelo de Datos (conceptual)

### Importación de Deuda
- `fecha_corte` (única — identifica la importación), `periodo_desde`, `periodo_hasta`, `archivo_nombre`, totales (`vencido`, `a_vencer`, `general`), contadores (`comprobantes`, `personas`, `socios_matcheados`, `sin_match`), `reconcilia` (si cerró exacto contra el Total General del archivo), `importado_por`

### Comprobante de Deuda
- Pertenece a una Importación de Deuda. `cod_cliente` (código NUVIX), `socio_id` (nullable — no todo cód. cliente es un socio activo de la app), `tipo` (FAC/REC), `fecha`, `vencimiento`, `descripcion` (texto original NUVIX, solo trazabilidad), `periodo` (YYYY-MM, derivado de la descripción), `concepto` (`cuota` | `reg_cesantes` | `otro`), `mora_dias`, `vencido`, `a_vencer`

### Semáforo del Socio
- Campos derivados en el socio: `semaforo` (`verde` | `amarillo` | `rojo` | `exento`), `deuda_vencida`, `meses_impagos`, `mora_max_dias`, `deuda_actualizada_at` — recalculados en cada importación, para todos los socios activos (no sólo los que aparecen en el archivo nuevo).

## User Stories

### US-MOR-01 — Importar el reporte de deuda de NUVIX
**Como** Secretaría
**Quiero** subir el archivo `.xls` de `RPT_Vencimientos` desde el panel web
**Para** que el semáforo de morosidad de todos los socios se actualice con datos reales, sin cruzarlos a mano

**Criterios de aceptación:**
- Subo el archivo desde `secretaria/deuda`
- El sistema valida que la suma de subtotales por cuenta coincida exactamente con el Total General del propio archivo
- Si no coincide, el import se aborta completo (no se guarda nada) y veo el detalle del desbalance
- Si coincide, veo un resumen: comprobantes leídos, socios matcheados, sin match, y cuántos socios quedaron en cada color
- Si ya existe una importación con la misma fecha de corte, se reemplaza (no se duplica)

### US-MOR-02 — Ver el semáforo de morosidad de los socios
**Como** Secretaría
**Quiero** ver la lista de socios con su color de semáforo
**Para** priorizar a quién contactar por deuda

**Criterios de aceptación:**
- Veo cada socio con su color (verde/amarillo/rojo/exento), monto vencido, meses impagos y mora máxima en días
- Puedo filtrar la lista por color
- El color refleja únicamente la última importación cargada

### US-MOR-03 — Ver el historial de importaciones
**Como** Secretaría
**Quiero** ver las importaciones anteriores
**Para** confirmar cuándo se actualizó el semáforo por última vez y con qué totales

**Criterios de aceptación:**
- Veo una lista de importaciones ordenada por fecha de corte, con fecha de importación, quién la subió, totales y si reconcilió
- No puedo editar ni eliminar una importación desde la UI — sólo re-subir el archivo para esa fecha de corte

### US-MOR-04 — Un socio en plan de regularización no cuenta como moroso por eso
**Como** Secretaría
**Quiero** que la deuda de "REG. CESANTES" no sume meses impagos al semáforo
**Para** no castigar a un socio que se está poniendo al día con un plan aparte de la cuota social

**Criterios de aceptación:**
- Un comprobante con concepto `reg_cesantes` nunca cuenta para `meses_impagos` ni cambia el color del socio
- Sigue guardado en el detalle, disponible para reportes

### US-MOR-05 — Un socio exento nunca aparece como moroso
**Como** Secretaría
**Quiero** que los socios en categorías sin cargo (becado 100%, vitalicio, dependiente de grupo familiar) se muestren como "exento"
**Para** no perseguir cobranza donde no corresponde

**Criterios de aceptación:**
- Un socio cuya categoría vigente tiene `monto_mensual = 0` se muestra como `exento`, independientemente de si NUVIX generó algún comprobante a su nombre

## Reglas de Negocio
- El semáforo se calcula por **cantidad de períodos distintos con `vencido > 0`**, derivados de la descripción del comprobante — nunca por fecha de vencimiento ni por cantidad de comprobantes (un mismo período puede tener varios comprobantes).
- Umbrales: 0 períodos = verde, 1 = amarillo, 2 o más = rojo.
- `reg_cesantes` (plan de regularización) se excluye siempre del conteo de meses impagos.
- Sólo participan del semáforo los socios con `estado = 'activo'` cuyo `cod_cliente` matchea contra `socios.numero_socio` (el Cód. Cliente de NUVIX).
- El semáforo se recalcula para **todos** los socios activos en cada importación — un socio que salda su deuda y no vuelve a aparecer en el archivo siguiente pasa a verde.
- No hay edición manual del semáforo ni de comprobantes desde la app — la única fuente de verdad es la última importación reconciliada.
- La app no cobra cuotas — el importador es de solo lectura respecto del sistema externo (NUVIX). Cualquier corrección ocurre en NUVIX y se refleja en la próxima importación.

## Requerimientos No Funcionales
- El import es transaccional: si falla la reconciliación o cualquier paso posterior, no se escribe nada — nunca queda una importación a medio guardar.
- El import es idempotente por `fecha_corte`: volver a subir el mismo archivo reemplaza la importación existente para esa fecha, sin duplicar comprobantes.
- El parseo corre en memoria (volumen actual ~6.100 filas, crecimiento ~650 comprobantes/año) — sin streaming ni paginación en esta escala.
- Sólo `secretaria` y `admin` pueden importar y ver el detalle completo. El socio (cuando se exponga en UI, fuera de alcance de esta change) sólo puede leer sus propios comprobantes.
