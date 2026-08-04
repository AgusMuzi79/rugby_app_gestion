# Design: Importador de deuda NUVIX — Semáforo de morosidad

## 1. Parser del reporte NUVIX

### Por qué SheetJS y no xlrd

`RPT_Vencimientos` es un `.xls` binario real (OLE2/BIFF), igual que `Jugadores.xls` en la carga masiva de socios — `xlrd` no lo abre de forma confiable (compdoc corruption). Se usa `SheetJS` (`npm:xlsx`), leyendo la hoja `RPT_Vencimientos.rpt` como array de arrays:

```ts
import * as XLSX from 'npm:xlsx'
const wb = XLSX.read(bytes, { type: 'array', cellDates: true })
const sheet = wb.Sheets['RPT_Vencimientos.rpt']
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, cellDates: true, raw: true })
```

Volumen actual: 6.107 filas, 1.739 comprobantes, 536 personas, crece ~650 comprobantes/año. Cabe entero en memoria — sin streaming, sin paginación.

El parámetro del reporte es fijo (sin filtro de estado, período desde 01/01/2022) y no se parametriza desde la UI — cada archivo subido es siempre "todo lo que hay".

### Tipos de fila, identificados por posición de columna

No es una tabla plana — es un reporte Crystal Reports con bandas. Cada fila se clasifica por lo que tiene en columnas específicas (0-indexed):

| Tipo | Se reconoce por | Se extrae |
|---|---|---|
| Período informado | `col0 === 'Período Informado:'` | `col1` desde, `col2` hasta, `col4` fecha de corte |
| Cabecera de cuenta | `col0 === 'Cta. Cte.:'` | `col1` cód. cliente, `col2` nombre, `col4` teléfono — **abre** la "cuenta actual" |
| Saldo anterior | `col5 === 'SALDO ANTERIOR'` | `col7` monto vencido |
| Detalle (comprobante) | `col0` es fecha **y** `col1 ∈ {FAC, REC}` | `col2` prefijo, `col3` número, `col4` vencimiento, `col5` descripción, `col6` mora en días, `col7` vencido, `col8` a vencer |
| Subtotal de cuenta | `col0` y `col1` vacías, `col2/3/4` numéricos, `col5` vacía | `col2` vencido, `col3` a vencer, `col4` total — **cierra** la "cuenta actual" |
| Total general | `col0 === 'Total General:'` | `col1` vencido, `col2` a vencer, `col3` total |
| Ignorar | `Cond. Venta:`, `Divisa:`, fila de encabezados de columna, pie `Solicitado Por: ... Terminal: NUVIX.` | — |

El parser mantiene un puntero a "cuenta actual" (cód. cliente + nombre), abierto por la cabecera y cerrado por el subtotal. Todo comprobante de detalle leído entre medio pertenece a esa cuenta.

### Validación obligatoria: reconciliación exacta

`Σ(subtotales por cuenta) === Total General` (vencido, a vencer y total, cada uno por separado). Probado contra 5 archivos reales: siempre cierra al peso.

Si no reconcilia: **abortar el import completo, no escribir nada en la base**, devolver el detalle del desbalance a secretaría (qué total no cerró y por cuánto). Nunca queda una importación a medio guardar.

### Derivación de período y concepto

Se deriva de `descripcion` (el texto del comprobante), **no de la fecha de vencimiento**. Regla explícita: hay socios con varios comprobantes emitidos el mismo día y con el mismo vencimiento — si se contaran períodos por fecha de vencimiento en lugar de por descripción, 5 socios que hoy dan rojo pasarían a amarillo.

Orden de prioridad (primer match gana):

1. `REG. CESANTES - {M}-{YYYY}` → `concepto = 'reg_cesantes'`, período del match
2. `Liquidación Mes de {MesEnEspañol} {MM}-{YYYY}` → `concepto = 'cuota'`, período del match
3. `DEUDA {MES}` (`ENE`, `FEB`, ...) → `concepto = 'cuota'`, año tomado de `vencimiento`
4. Variantes de gimnasio (`Liquidación {Mes} Gym`, `Liquidacion Gym {Mes}`) → `concepto = 'cuota'`, año de `vencimiento`
5. Sin match → `concepto = 'otro'`, período = año-mes de `vencimiento`

`periodo` se guarda como `text` `YYYY-MM` (mismo formato que `cuotas.periodo`, `CHECK (periodo ~ '^\d{4}-\d{2}$')`).

Los strings de NUVIX son inconsistentes entre sí (`"Liquidación Mes de Junio 6-2026"` vs `"07-2026"`, `"Liquidación mayo"` sin año) — se guarda el original en `descripcion` para trazabilidad, pero **ninguna UI muestra ese string crudo**: siempre se renderiza desde `periodo` + `concepto` (ej. "Cuota Junio 2026").

## 2. Qué entra al cálculo del semáforo

Todo comprobante se guarda en `comprobantes_deuda` (sirve para reportes y trazabilidad), pero el cálculo del semáforo sólo cuenta lo que corresponde a un socio activo y a deuda de cuota social real:

1. **Cruce por `cod_cliente` contra `socios.numero_socio`.** Sin match → `socio_id = NULL`, se guarda igual, no participa del semáforo. Esto cubre Proveedores (2 cuentas, $8.748.967, incluye la concesión del buffet), Bajas (227 personas, $4.488.990, incobrable) y, en la práctica, Cesantes (86 personas, $12.184.700): ninguno de los tres formó parte de la carga masiva de socios activos (que filtró `Estado: SOCIO` en el padrón), así que no tienen `numero_socio` que matchee. **Nota**: el reporte no trae un campo explícito de "tipo de cuenta" — este filtro funciona por ausencia de match, no por clasificación directa. Ver "Decisiones a confirmar" más abajo.
2. **`socios.estado = 'activo'`.** Socios con match pero en `pendiente`/`inactivo` no participan.
3. **`concepto = 'reg_cesantes'` se excluye del conteo de meses** aunque el socio sí matchee y esté activo — es un plan de regularización, no cuota social. Castigar a alguien que se está poniendo al día sería el error opuesto al que se busca resolver. (5 socios activos hoy tienen su única deuda en este concepto.)
4. **Exento por categoría.** Si la categoría vigente del socio tiene `monto_mensual = 0` (Becado Rugby/Hockey/Tenis, Vitalicio, Dependiente de Grupo Familiar), el socio es `exento` — se evalúa **antes** que los comprobantes y gana sobre cualquier resultado que darían los comprobantes. Esta regla de "exento = categoría en $0" es una inferencia mía a partir del schema existente (`categorias_socio.monto_mensual`), no viene explícita en el pedido original — confirmar con Agus (ver "Decisiones a confirmar").

### Cálculo (por socio activo, no exento)

```
periodos_distintos = COUNT(DISTINCT periodo)
  FROM comprobantes_deuda
  WHERE socio_id = X
    AND vencido > 0
    AND concepto != 'reg_cesantes'
    AND importacion_id = <última importación>

0 períodos  → verde
1 período   → amarillo
2+ períodos → rojo
```

## 3. Schema

```sql
CREATE TABLE importaciones_deuda (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_corte       date NOT NULL UNIQUE,
  periodo_desde     date,
  periodo_hasta     date,
  archivo_nombre    text,
  total_vencido     numeric(14,2),
  total_a_vencer    numeric(14,2),
  total_general     numeric(14,2),
  comprobantes      int,
  personas          int,
  socios_matcheados int,
  sin_match         int,
  reconcilia        boolean NOT NULL,
  importado_por     uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comprobantes_deuda (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id    uuid NOT NULL REFERENCES importaciones_deuda(id) ON DELETE CASCADE,
  socio_id          uuid REFERENCES socios(id),
  cod_cliente       text NOT NULL,
  nombre_origen     text,
  tipo              text,                 -- FAC | REC
  prefijo           text,
  numero            text,
  fecha             date,
  vencimiento       date,
  descripcion       text,                 -- string original NUVIX, solo trazabilidad
  periodo           text CHECK (periodo ~ '^\d{4}-\d{2}$'),
  concepto          text CHECK (concepto IN ('cuota', 'reg_cesantes', 'otro')),
  mora_dias         int,
  vencido           numeric(14,2) NOT NULL DEFAULT 0,
  a_vencer           numeric(14,2) NOT NULL DEFAULT 0,
  es_saldo_anterior boolean NOT NULL DEFAULT false
);

CREATE INDEX ON comprobantes_deuda (importacion_id);
CREATE INDEX ON comprobantes_deuda (socio_id);

ALTER TABLE socios
  ADD COLUMN semaforo text CHECK (semaforo IN ('verde', 'amarillo', 'rojo', 'exento')),
  ADD COLUMN deuda_vencida numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN meses_impagos int NOT NULL DEFAULT 0,
  ADD COLUMN mora_max_dias int NOT NULL DEFAULT 0,
  ADD COLUMN deuda_actualizada_at timestamptz;

CREATE INDEX ON socios (semaforo);
```

`socio_id` es nullable en `comprobantes_deuda` a propósito: Proveedores/Bajas/Cesantes se guardan igual (sirven para reportes de deuda total del club), simplemente no arrastran un socio.

### Idempotencia

`fecha_corte` es `UNIQUE` en `importaciones_deuda`. Reimportar el mismo archivo (misma fecha de corte) borra la importación anterior de esa fecha — `ON DELETE CASCADE` se lleva puesto sus `comprobantes_deuda` — y reinserta. Nunca duplica. Importar un archivo con fecha de corte distinta es una importación nueva, independiente de las anteriores (no las borra).

### RLS

```sql
ALTER TABLE importaciones_deuda ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprobantes_deuda ENABLE ROW LEVEL SECURITY;

-- importaciones_deuda: secretaria/admin leen y escriben
CREATE POLICY "secretaria_admin_all_importaciones" ON importaciones_deuda
  FOR ALL TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'))
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));

-- comprobantes_deuda: secretaria/admin leen y escriben todo
CREATE POLICY "secretaria_admin_all_comprobantes" ON comprobantes_deuda
  FOR ALL TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin'))
  WITH CHECK ((select get_rol()) IN ('secretaria', 'admin'));

-- comprobantes_deuda: el socio lee sólo lo propio (para una futura pantalla de detalle)
CREATE POLICY "socio_select_own_comprobantes" ON comprobantes_deuda
  FOR SELECT TO authenticated
  USING (
    socio_id IN (SELECT id FROM socios WHERE profile_id = auth.uid())
  );
```

La escritura real ocurre siempre desde la Edge Function con `service_role` (exenta de RLS) — las policies de `secretaria`/`admin` cubren el caso de que alguna consulta de lectura se haga directo desde el cliente web (ej. la página de historial).

Índice ya cubierto: `comprobantes_deuda (socio_id)` sirve tanto para la policy del socio como para las queries de la página de secretaría.

## 4. Edge Function `importar-deuda`

A diferencia de `socios-pagos` (`--no-verify-jwt`, pensada para webhooks/cron), esta función tiene `verify_jwt` **activo** — la llama un humano autenticado desde el panel web.

```
Deno.serve
  1. Verificar rol del caller (secretaria | admin) — get profile del JWT, no confiar en el body
  2. Leer el archivo del FormData
  3. Parsear con SheetJS → filas tipadas (ver sección 1)
  4. Validar reconciliación (sección 1) — si falla: 400 con el detalle, no tocar la DB
  5. Resolver socio_id por cod_cliente → socios.numero_socio (bulk, un solo SELECT con .in())
  6. Transacción (RPC en Postgres o inserciones secuenciales con rollback manual — ver nota):
     a. DELETE importaciones_deuda WHERE fecha_corte = <la del archivo>  (cascade se lleva comprobantes_deuda)
     b. INSERT importaciones_deuda (resumen)
     c. INSERT comprobantes_deuda (bulk)
     d. Recalcular semaforo/deuda_vencida/meses_impagos/mora_max_dias/deuda_actualizada_at
        de TODOS los socios activos (no sólo los que aparecen en el archivo nuevo —
        un socio que salda su deuda y desaparece del reporte siguiente tiene que volver a verde)
  7. Devolver resumen: { comprobantes, personas, socios_matcheados, sin_match, verde, amarillo, rojo, exento }
```

**Nota sobre transacción**: Supabase JS no expone transacciones multi-statement directamente — la forma estándar en este proyecto es envolver los pasos 6a-6d en una función Postgres (`plpgsql`, `SECURITY DEFINER`) invocada una sola vez vía RPC desde la Edge Function, para que todo el paso 6 sea atómico a nivel de base (si algo falla a mitad, Postgres hace rollback solo). Se detalla en tasks.md — no se implementa en esta pasada.

Invocación desde la web:

```ts
const { data, error } = await supabase.functions.invoke('importar-deuda', { body: formData })
```

## 5. Página web — `web/app/(secretaria)/secretaria/deuda/page.tsx`

Identidad visual vigente (sin cambios de tema): fondo `#15110A`, card `#1C1710`, oro `#F5B41C`, texto `#F3EFE4`, muted `#8E8574`, fuentes Barlow / Barlow Semi Condensed / JetBrains Mono, Tailwind (la web usa Tailwind; NativeWind fue eliminado del mobile, no aplica acá).

Secciones:

1. **Subida de archivo** — input `.xls`, botón "Importar", loading state mientras corre la Edge Function.
2. **Resultado del import** — el resumen que devuelve la función: comprobantes leídos, socios matcheados, sin match, conteo por color. Si `reconcilia = false`, mostrar el error de forma prominente (no es un warning, es un fallo del import completo).
3. **Historial de importaciones** — tabla de `importaciones_deuda` ordenada por `fecha_corte` desc: fecha de corte, cuándo se importó, quién, totales, si reconcilió.
4. **Listado de socios filtrable por color** — chips 🟢🟡🔴⚪ (mismo patrón visual que el filtro de estado ya usado en `secretaria/socios/page.tsx`), tabla con nombre, `numero_socio`, `deuda_vencida`, `meses_impagos`, `mora_max_dias`. Pensada para que secretaría arme la lista de a quién llamar.

## 6. Fuera de alcance de build — documentado para un follow-up

### Semáforo binario en la app del socio

La app del socio no ve el semáforo de 3 colores ni se compara contra otros socios — si en el futuro se muestra algo, sería binario: "al día" / "con pagos pendientes", derivado de `socios.semaforo NOT IN ('verde', 'exento')`. Tocaría `useCuotas` y `(socio)/cuotas.tsx` — **no se implementa en esta change** (restricción explícita: no tocar pantallas existentes).

### Pantalla de detalle de deuda del socio

Agrupada por período (no lista plana — hay 49 casos de socios con 2+ comprobantes en el mismo mes, hasta 6, mediana 2, porque se factura una línea por disciplina o por integrante del grupo familiar), con los conceptos desplegados debajo de cada período. Reglas para cuando se construya:

1. **Sello de frescura obligatorio y visible**: "datos al {fecha_corte}". El import es periódico — si alguien paga por ventanilla el día 3, la app le sigue mostrando la deuda hasta el próximo import. Sin el sello, eso se lee como un bug de la app, no como una limitación esperada.
2. **`reg_cesantes` en una sección aparte** ("Plan de regularización"), nunca mezclado con cuotas — hay 5 socios activos cuya única deuda es esa; verían un saldo sin explicación si se mezcla con cuotas normales (aunque, correctamente, no cuenta para su semáforo).
3. **`a_vencer` se muestra como informativo, no como deuda**: "Cuota Agosto — vence el 10", nunca sumado a lo que "debe". Son 12 socios hoy.

Esta sección queda como especificación lista para implementar, no como tarea de esta change.

## 7. Decisiones a confirmar con Agus

1. **Exento = categoría con `monto_mensual = 0`.** Es una inferencia mía (Becado Rugby/Hockey/Tenis, Vitalicio, Dependiente de Grupo Familiar), no vino explícita en el pedido. Si un becado igual genera comprobantes en NUVIX por algún motivo (ej. servicio opcional no cubierto por la beca), esta regla lo exime igual del semáforo — ¿es lo que se quiere, o exento debería ser sólo si además no tiene comprobantes con `vencido > 0`?
2. **Filtro de Proveedores/Bajas/Cesantes por ausencia de match**, no por un campo explícito del reporte (el formato descripto no incluye un campo de "tipo de cuenta" en la cabecera). Si en algún archivo futuro un cód. cliente de un Proveedor coincidiera por casualidad con un `numero_socio` real (mismo número, distinta persona), se colaría al semáforo. Bajo riesgo dado que `numero_socio` es único y viene de la carga real, pero vale que Agus lo sepa.
3. **Inconsistencia con el filtro "Moroso" ya existente** en `web/.../secretaria/socios/page.tsx` (`socios.estado = 'moroso'`, seteado únicamente por el flujo legacy de débito automático con tarjeta, ya descartado por la directiva). Esta change no lo toca — queda un filtro "Moroso" en la pantalla de socios que no va a reflejar el semáforo nuevo. Corregirlo (¿eliminar el filtro legacy? ¿unificarlo con `semaforo`?) es decisión de un follow-up, no de esta change.
4. **Riesgo de `numero_socio` no-NUVIX en altas manuales post-carga-masiva** (ver proposal.md) — no bloquea el diseño, pero cuando ocurra un alta manual nueva, ese socio no va a matchear contra NUVIX hasta que alguien lo dé de alta ahí también. ¿Hace falta un campo o alerta en el import ("sin match: nombre X, numero_socio Y no visto en NUVIX") para que secretaría lo note? Hoy el resumen del import ya devuelve `sin_match` (cantidad), pero no el detalle — evaluar si conviene loguearlo en `importaciones_deuda` o en el response, no en una tabla nueva.
