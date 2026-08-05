# Design: Reconciliación de categorías, servicios y precios de Socios

> Revisión 2 — reemplaza el modelo de precios de servicio de la v1 (tabla `precios_servicio` o catálogo con variantes Mayor/Menor) por la decisión final de Agus: la app no factura, no modela reglas de precio propias. Ver proposal.md, sección "Historial de decisiones".

## 1. Fuente de verdad y método de matcheo

Todo el cruce va por `socios.numero_socio` = `nuvix_cod_cliente` de los 3 CSV. Nunca por nombre, nunca por DNI (hay DNI sintéticos `SD{código}` de la carga masiva, y nombres con variantes de tildes/mayúsculas).

Regla dura: si un `nuvix_cod_cliente` del CSV no matchea ningún `numero_socio` en la base, **no se crea nada**. El script clasifica cada fila del maestro en una de tres categorías, no dos:

1. **`excluido_institucional`** — `categoria_padron = 'Cliente'` en `socios_activos_maestra.csv`. Confirmado por Agus: son 6 cuentas de NUVIX que nunca fueron socios (Casino, Colegio Nuestra Tierra, UAR, Universidad Nacional del Centro, Nativa Compañía de Seguros, Gómez Marcelo — códigos 17033, 16809, 16810, 16990, 18175, 17629). Se excluyen **por regla explícita antes de intentar matchear**, no llegan a `no_matcheado`.
2. **`no_matcheado`** — el `numero_socio` no tiene `categoria_padron = 'Cliente'` pero tampoco existe en la base. Con los datos actuales esto debería dar 0 filas (1.534 − 6 institucionales = 1.528, que es exactamente el total de socios cargados) — si el dry-run muestra algo acá, es una señal real de que hay socios en el padrón que no llegaron a la carga masiva original, y hay que investigar antes de seguir.
3. **Matcheado** — sigue el flujo normal de diff (categorías, servicios, sin_liquidacion).

Idempotencia: correr el script dos veces con los mismos 3 CSV tiene que producir el mismo estado final la segunda vez sin generar diffs nuevos (la segunda corrida del dry-run debe reportar 0 cambios pendientes).

## 2. Precio de servicio — la app refleja, no calcula

### Por qué se descartó la matriz (servicio × categoría) y también el catálogo con variantes

La v1 de esta propuesta proponía o bien una tabla `precios_servicio(servicio_id, categoria_socio_id, importe)`, o bien (mi alternativa) dos filas de catálogo `Gimnasio`/`Gimnasio Menor`. Agus verificó los datos con más profundidad que el cruce de la v1 y encontró el problema real: **la variante Mayor/Menor de Gimnasio sigue la edad exacta del socio, no su categoría** — los "Menor" van de 11 a 18 años, los "Mayor" de 17 a 73, con superposición en el borde etario, y los socios en categoría "Dependiente Grupo Familiar" aparecen en ambas variantes indistintamente. Ninguna columna fija del schema (categoría, o incluso un flag "es menor" calculado una vez) sigue esa realidad sin desincronizarse la primera vez que alguien cumple 18 años.

Pero el punto no es sólo que la clave estaba mal elegida (categoría en vez de edad) — es que **la app no tiene por qué modelar ninguna regla de precio propia**. Mercado Pago está descartado, la app no cobra; toda la liquidación real ocurre en NUVIX y llega mensualmente vía este mismo tipo de import. Construir una regla de precios (por la clave que sea) es mantener una fuente de verdad paralela que hay que re-sincronizar a mano cada vez que cambia — exactamente el problema que esta reconciliación existe para resolver, no algo para reintroducir.

### Diseño final

**Catálogo (`servicios_opcionales`) — una sola fila por servicio, sin variantes.** El precio de catálogo (`monto_mensual`) es puramente informativo/de referencia — sirve, por ejemplo, para que Secretaría tenga una idea aproximada al vincular un socio nuevo antes de que exista un import de NUVIX que confirme el monto real. Ninguna lógica de la reconciliación depende de este valor para decidir qué cobrarle a nadie.

**Vínculo (`socio_servicios`) — el importe real vive acá:**

```sql
ALTER TABLE socio_servicios
  ADD COLUMN importe        numeric(10,2),   -- importe_liquidacion del CSV, autoritativo
  ADD COLUMN variante_nuvix text;             -- "GYM Mayor", "RUGBY CUOTA DEPORTIVA", etc. — sólo trazabilidad
```

- `importe`: el valor real que NUVIX liquidó para ese socio y ese servicio en el import más reciente (`importe_liquidacion` de `socios_servicios.csv`, tal cual, sin resolver contra ninguna regla). Manda siempre sobre `servicios_opcionales.monto_mensual`.
- `variante_nuvix`: el texto original de NUVIX (`GYM Mayor`, `GYM Menor`, `GYM Becado`, `RUGBY CUOTA DEPORTIVA`, `HOCKEY CUOTA DEPORTIVA`, `CARNET TENIS`, `HOCKEY INCLUSIVO`, `RUGBY INCLUSIVO`). Se guarda para trazabilidad y para que un reporte futuro pueda explicar "por qué este importe" sin adivinar — la app nunca lo interpreta ni deriva nada de él.

Mismo criterio para los 6 servicios, no sólo Gimnasio — aunque los otros 5 hoy tengan un único precio observado, no hay ninguna garantía de que seguirán siendo flat para siempre (ni falta que la app lo sepa de antemano).

### Qué resuelve esto que la v1 no resolvía

- El caso "GYM Becado" (1 socio, $0) no necesita ninguna regla especial — es sólo el `importe` que vino en su fila del CSV, igual que cualquier otro.
- Cuando un socio cumple 18 años y NUVIX empieza a facturarle la tarifa Mayor, la próxima sincronización actualiza `importe` sin que nadie tenga que tocar una regla de edad en la app.
- Cuando cambien los precios por inflación, lo mismo — llega en el próximo import, no en una migración.

### Consecuencia para código existente (fuera de esta change, documentada en proposal.md)

`socios-pagos` calcula hoy el monto de una cuota virtual sumando `categorias_socio.monto_mensual` + `servicios_opcionales.monto_mensual` de los servicios vinculados. Con el catálogo pasando a ser informativo, ese cálculo se desactualiza en cuanto el `importe` real de un vínculo difiera del catálogo (el caso esperado para Gimnasio). No se toca en esta change — ver proposal.md.

## 3. `categorias_socio` — vigencia de precio

A diferencia de los servicios (que ahora no modelan precio propio), la cuota por categoría sigue siendo un valor único que la app necesita mostrar/calcular (`useCuotas`) — acá sí aplica versionar el historial, no eliminar el precio de catálogo.

Propongo una tabla de historial liviana, poblada por trigger, sin tocar ningún punto de lectura existente de la app (`useCuotas`, la página de categorías del panel web, `socios-pagos` siguen leyendo `categorias_socio.monto_mensual` igual que hoy — el historial es sólo para no perder el valor anterior).

```sql
CREATE TABLE categorias_socio_historial (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id    uuid NOT NULL REFERENCES categorias_socio(id) ON DELETE CASCADE,
  monto_mensual   numeric(10,2) NOT NULL,  -- el valor que tuvo, no el nuevo
  vigente_desde   timestamptz NOT NULL,     -- cuándo empezó a regir ese monto
  vigente_hasta   timestamptz NOT NULL DEFAULT now(),  -- cuándo dejó de regir
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION log_categoria_precio_anterior()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.monto_mensual IS DISTINCT FROM OLD.monto_mensual THEN
    INSERT INTO categorias_socio_historial (categoria_id, monto_mensual, vigente_desde, vigente_hasta)
    VALUES (OLD.id, OLD.monto_mensual, OLD.updated_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categorias_socio_log_precio
  BEFORE UPDATE ON categorias_socio
  FOR EACH ROW EXECUTE FUNCTION log_categoria_precio_anterior();
```

Bajo costo, opcional a esta change — si Agus prefiere dejarlo para cuando el club realmente vuelva a cambiar precios, se saca de esta migración sin afectar nada más.

## 4. `reconciliaciones_socios` — trazabilidad de la corrida

```sql
CREATE TABLE reconciliaciones_socios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_en   timestamptz NOT NULL DEFAULT now(),
  dry_run        boolean NOT NULL,
  resumen        jsonb NOT NULL,   -- el mismo reporte que devuelve el script (ver §11)
  ejecutado_por  uuid REFERENCES profiles(id)
);

ALTER TABLE reconciliaciones_socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secretaria_admin_leen_reconciliaciones" ON reconciliaciones_socios
  FOR SELECT TO authenticated
  USING ((select get_rol()) IN ('secretaria', 'admin', 'subcomision'));
```

Guarda cada corrida (dry-run y real) con su reporte completo, incluida la lista de los 34 socios sin liquidación. No hay página nueva para leerla en esta change — es la base para que esa lista no se pierda apenas cierre la sesión de terminal, y quede lista si más adelante Secretaría quiere una pantalla de revisión (fuera de alcance acá).

## 5. Algoritmo de reconciliación de vínculos — diff declarativo, no deltas fijos

Confirmado por Agus (discrepancia #4): los deltas del pedido original describían el estado final esperado, no una secuencia de operaciones — el caso Tenis → Carnet Tenis mostraba que un delta fijo depende de saber de antemano el número exacto de vínculos actuales. Un diff contra el estado real de la base en el momento de la corrida no tiene ese problema: es correcto sea cual sea el número real, y es naturalmente idempotente.

```
objetivo = agrupar filas de socios_servicios.csv por (numero_socio, servicio_destino, importe, variante_nuvix)
           donde servicio_destino mapea "Tenis Carnet" -> "Carnet Tenis" (rename), resto igual

actual   = SELECT socio_servicios.*, servicios_opcionales.nombre
           FROM socio_servicios JOIN servicios_opcionales
           WHERE servicios_opcionales.nombre IN
             ('Tenis', 'Gimnasio', 'Rugby', 'Hockey',
              'Carnet Tenis', 'Hockey Inclusivo', 'Rugby Inclusivo')
           -- 'Tenis' se incluye a propósito: cualquier vínculo a Tenis
           -- que exista hoy se elimina sin excepción, esté o no en el objetivo
           -- (Tenis nunca aparece en el objetivo — no existe en socios_servicios.csv)

a_insertar   = objetivo - actual         (por numero_socio + servicio_destino)
a_eliminar   = actual - objetivo         (incluye TODOS los vínculos a "Tenis")
a_actualizar = actual ∩ objetivo, pero con importe o variante_nuvix distintos
               (vínculo ya existe y es el servicio correcto, pero el importe cambió)
sin_cambios  = actual ∩ objetivo, mismo importe y variante_nuvix
```

Esto reproduce el resultado esperado (Tenis: 0, Carnet Tenis: 156, de los cuales 155 son el mismo socio que antes tenía Tenis) sin necesitar saber de antemano cuál era el número base — el dry-run lo muestra igual, y sirve de paso como el chequeo real de que el número que tenía `CLAUDE.md` (405) seguía vigente.

Filas del CSV cuyo `numero_socio` no matchea contra la base (y no son una de las 6 institucionales, ya excluidas en §1): van al reporte como `no_matcheado`, no generan ningún insert/delete.

## 6. Categorías — las 59 reclasificaciones

```
objetivo_categoria(numero_socio) = categoria_liquidacion   (si no está vacío)
actual_categoria(numero_socio)   = categorias_socio.nombre vía socios.categoria_id

a_actualizar = { numero_socio : categoria_liquidacion
                  para cada fila donde categoria_liquidacion != ''
                  y categoria_liquidacion != actual_categoria(numero_socio) }
```

Esto da 59 filas (la etiqueta `CATEGORIA_DIFIERE` del propio CSV cuenta lo mismo). Las filas con `categoria_liquidacion` vacío **no entran acá** — son parte de los 34 "sin liquidación" (§7 de proposal.md), se dejan como están.

Todos los valores de `categoria_liquidacion` usados (`Activo Mayor`, `Activo Menor`, `Activo Unquitas`, `Dependiente Grupo Familiar`, `Titular de Grupo`) ya existen como filas en `categorias_socio` — no hace falta crear categorías nuevas para aplicar este cambio.

## 7. Becas como descuento — decisión a confirmar con el club, NO se implementa en esta change

### La evidencia

31 socios (confirmado por Agus como el número correcto) tienen `Becado Rugby`, `Becado Hockey` o `Becado Tenis` en el padrón (`categoria_padron`), pero la liquidación real (`categoria_liquidacion`) les factura la cuota normal de su categoría real:

| Padrón → Liquidación | Cantidad |
|---|---|
| Becado Rugby → Activo Menor | 12 |
| Becado Rugby → Activo Mayor | 9 |
| Becado Hockey → Activo Mayor | 3 |
| **Subtotal — aterrizan en Activo Mayor/Menor** | **26** |
| Becado Hockey → Dependiente Grupo Familiar | 3 |
| Becado Rugby → Dependiente Grupo Familiar | 1 |
| Becado Hockey → Titular de Grupo | 1 |
| Becado Tenis → Activo Menor | 1 |
| Becado Tenis → Activo Mayor | 1 |
| **Subtotal — aterrizan en otra categoría** | **5** |
| **Total** | **31** |

Todos tienen `beca_pct = 100` en el CSV de origen (no en la base — recordar que esa columna no existe en `socios` todavía). Esto es consistente con la lectura de Agus: la beca es un **descuento aplicado sobre una categoría real**, no una categoría en sí misma — hoy el schema la modela al revés (`Becado Rugby` como categoría propia, con `monto_mensual = 0` fijo, sin importar si la beca es 100% o parcial).

### Opción A — mantener como está (no tocar nada)

Las categorías `Becado Rugby/Hockey/Tenis` siguen existiendo en `categorias_socio` (hoy vacías — ningún socio activo del padrón liquida ahí), y estos 31 socios quedan con su categoría real (Activo Mayor/Menor/Dependiente/Titular) sin ningún registro de que están becados. Si mañana alguien pregunta "¿cuántos becados de rugby hay?", no hay forma de responder desde la base.

### Opción B — beca como descuento

- `socios.beca_pct smallint NOT NULL DEFAULT 0 CHECK (beca_pct BETWEEN 0 AND 100)` — nueva columna.
- Los 31 socios pasan a su categoría real (ya lo hace la reconciliación de categorías, §6) **más** `beca_pct = 100`.
- Las categorías `Becado Rugby/Hockey/Tenis` en `categorias_socio` se marcan `activa = false` (no se borran — evita romper el historial de `cuotas` de meses anteriores si alguna cuota vieja quedó referenciando esa categoría).
- El cálculo de cuota pasa a ser `categoria.monto_mensual * (1 - beca_pct / 100)` en vez de leer `monto_mensual` directo — esto sí toca código existente: `useCuotas` (mobile) y donde sea que el panel web o `socios-pagos` calculen el monto a cobrar.

### Mi lectura

La Opción B es más correcta a largo plazo (una beca del 50% hoy no tiene forma de representarse; con esta migración, sí). Pero es un cambio de modelo de negocio, no sólo de datos — toca el cálculo de cuota en al menos 2 lugares de código ya en producción. **No lo implemento en esta change.** Si Agus confirma que vale la pena, lo hago como change separada después de que el club confirme que "beca = descuento sobre la categoría real" es efectivamente cómo quieren que funcione, y qué pasa con los 5 casos que no aterrizan en Activo Mayor/Menor.

## 8. Servicio Tenis — desactivar, no borrar

```sql
UPDATE servicios_opcionales SET activo = false WHERE nombre = 'Tenis';
```

Con `socio_servicios` vacío para ese `servicio_id` tras el diff del §5, queda sin vínculos activos, visible en el catálogo histórico por si algo referencia el id (ninguna FK lo impide hoy, pero no hay necesidad de borrarlo).

## 9. Catálogo — filas nuevas y renombres

```sql
-- Nuevas (precio informativo de referencia, no autoritativo — ver §2)
INSERT INTO servicios_opcionales (nombre, descripcion, monto_mensual) VALUES
  ('Hockey Inclusivo', NULL, 18750.00),
  ('Rugby Inclusivo',  NULL, 18750.00);

-- Rename (preserva id y vínculos existentes — 0 vínculos hoy, pero preserva el id
-- por si alguna referencia externa ya lo usa)
UPDATE servicios_opcionales SET nombre = 'Carnet Tenis',
  descripcion = 'Acceso a las canchas de tenis sin ser socio del club'
  WHERE nombre = 'Tenis Carnet';

-- Precio de referencia actualizado (informativo — ver §2; no se crea variante Menor de catálogo)
UPDATE servicios_opcionales SET monto_mensual = 25000.00 WHERE nombre = 'Gimnasio';
UPDATE servicios_opcionales SET monto_mensual = 60000.00 WHERE nombre = 'Carnet Tenis';
-- Rugby (25000) y Hockey (31250) ya están correctos, sin cambios.
```

## 10. `categorias_socio` — corrección de precios

```sql
UPDATE categorias_socio SET monto_mensual = 25000.00 WHERE nombre = 'Activo Mayor';   -- era 50000
UPDATE categorias_socio SET monto_mensual = 50000.00 WHERE nombre = 'Titular de Grupo'; -- era 60000
-- Activo Menor (25000), Activo Unquitas (12500), Dependiente Grupo Familiar (0) ya correctos.
```

## 11. Modo dry-run — contrato del reporte

```jsonc
{
  "dry_run": true,
  "socios": {
    "en_maestro": 1534,
    "excluidos_institucionales": 6,       // Casino, Colegio Nuestra Tierra, UAR, etc. — regla explícita
    "esperados_en_base": 1528,
    "matcheados_en_base": 1528,           // el dry-run da el número real; si difiere de 1528, investigar antes de seguir
    "no_matcheados": []                   // debería dar vacío
  },
  "categorias": {
    "a_actualizar": 59,
    "detalle": [ { "numero_socio": "...", "categoria_actual": "Activo Unquitas", "categoria_nueva": "Activo Menor" }, ... ]
  },
  "servicios": {
    "por_servicio": {
      "Gimnasio":          { "agregar": 0,   "eliminar": 0,   "actualizar_importe": 0, "vigentes_post": 249 },
      "Rugby":             { "agregar": 1,   "eliminar": 33,  "actualizar_importe": 0, "vigentes_post": 258 },
      "Hockey":            { "agregar": 0,   "eliminar": 13,  "actualizar_importe": 0, "vigentes_post": 293 },
      "Hockey Inclusivo":  { "agregar": 8,   "eliminar": 0,   "actualizar_importe": 0, "vigentes_post": 8 },
      "Rugby Inclusivo":   { "agregar": 6,   "eliminar": 0,   "actualizar_importe": 0, "vigentes_post": 6 },
      "Carnet Tenis":      { "agregar": 156, "eliminar": 0,   "actualizar_importe": 0, "vigentes_post": 156 },
      "Tenis":             { "agregar": 0,   "eliminar": "TODOS", "actualizar_importe": 0, "vigentes_post": 0 }
    },
    "total_vinculos_post": 970
  },
  "precios_catalogo_informativo": {
    "categorias_socio": [ { "nombre": "Activo Mayor", "actual": 50000, "nuevo": 25000 }, ... ],
    "servicios_opcionales": [ { "nombre": "Gimnasio", "actual": 18750, "nuevo": 25000 }, ... ]
  },
  "revisar_secretaria": {
    "sin_liquidacion": 34,
    "detalle": [ { "numero_socio": "...", "nombre": "...", "motivo": "SIN_LIQUIDACION" | "SIN_CUOTA_EN_LIQUIDACION" }, ... ]
  },
  "becas_pendiente_decision": {
    "total": 31,
    "aterrizan_activo_mayor_menor": 26,
    "aterrizan_otra_categoria": 5
  },
  "facturacion_mensual_estimada": 57185000
}
```

El mismo reporte, con `dry_run: false`, es lo que efectivamente se aplicó — se guarda en `reconciliaciones_socios.resumen` en ambos casos.

## 12. Tests de aceptación — estado final confirmado

- **Socios activos: 1.528, sin cambios en el total.**
- **Socios excluidos explícitamente (institucionales, no socios): 6** — nunca se crean ni se tocan.
- **Socios marcados para revisión de Secretaría (sin liquidación): 34.**
- Categorías a actualizar: 59.
- Vínculos socio↔servicio: 970. Distribución: 681 socios con 0 · 736 con 1 · 117 con 2.
- Servicios: Hockey 293 · Rugby 258 · Gimnasio 249 · Carnet Tenis 156 · Hockey Inclusivo 8 · Rugby Inclusivo 6.
- Servicio Tenis: 0 vínculos activos, `activo = false`.
- Facturación mensual total del padrón activo: $57.185.000 (cuotas + servicios, sin aplicar becas — becas no se aplican en esta change). Este total se calcula sumando `socio_servicios.importe` real, no derivándolo del catálogo — es el chequeo de que la migración de precios de catálogo (que es sólo informativa) no se coló por error en ningún cálculo real.

## 13. Seguridad / checkpoints obligatorios

1. No tocar `auth.users`.
2. No tocar `profiles` salvo `nombre` si difiere (no relevado en esta pasada de análisis — si hace falta, se agrega como un diff más al mismo reporte, mismo patrón).
3. No tocar `numero_socio` — es la clave de matcheo.
4. No borrar ningún socio, ni siquiera las 6 institucionales — se excluyen, no se tocan.
5. Todo el matcheo por `numero_socio`, nunca por nombre ni DNI.
6. Nada de esto corre fuera de `dry_run: true` hasta confirmación explícita.
7. Ninguna migración SQL se escribe ni se corre `supabase db push` hasta confirmación explícita.
8. Ninguna política RLS se toca fuera de las nuevas tablas (`reconciliaciones_socios`, y `categorias_socio_historial` si se incluye).
