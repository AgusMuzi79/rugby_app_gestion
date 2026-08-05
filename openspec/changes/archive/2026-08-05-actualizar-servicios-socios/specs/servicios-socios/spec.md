# Spec: Servicios y Categorías de Socios (nuevo capability)

> Delta propuesto por la change `actualizar-servicios-socios`. Al archivar la change, este archivo se incorpora como `openspec/specs/servicios-socios/spec.md` y se agrega una fila a `openspec/specs/README.md`.

## Dominio
`servicios-socios`

## Descripción
Corrección de los datos de categoría, servicios opcionales y precios de los 1.528 socios cargados en la carga masiva (2026-07-29/30), reconciliándolos contra el Padrón de Servicios real de NUVIX (la fuente que efectivamente liquida). No es un flujo nuevo de producto — es una corrección puntual de datos con reglas explícitas de seguridad (no crear, no borrar, matcheo por `numero_socio`).

## Actores
- **Secretaría / Admin** — dispara la reconciliación (vía script, no UI en esta change), revisa el reporte, decide si aplicar
- **Socio** — no interactúa directamente; ve el resultado reflejado en su categoría, sus servicios y el monto de su cuota

## Modelo de Datos (conceptual)

### Servicio opcional (catálogo)
- `nombre`, `descripcion`, `monto_mensual` (precio **informativo/de referencia**, no autoritativo — ver regla de negocio abajo), `activo`
- Nuevas filas: `Hockey Inclusivo`, `Rugby Inclusivo` — sin variantes por edad/categoría, una sola fila por servicio
- `Tenis Carnet` se renombra a `Carnet Tenis` (mismo registro, mismo id)
- `Tenis` pasa a `activo = false` (deprecado, no se borra)

### Vínculo socio↔servicio
- Relación N a N entre socio y servicio opcional
- **Nuevo**: `importe` — el monto real que NUVIX liquida para ese vínculo puntual (viene del Padrón de Servicios). **Manda siempre sobre el precio de catálogo.**
- **Nuevo**: `variante_nuvix` — texto original de NUVIX ("GYM Mayor", "GYM Menor", "RUGBY CUOTA DEPORTIVA", etc.), sólo trazabilidad, la app no lo interpreta

### Categoría de socio
- `nombre`, `monto_mensual`, `activa`
- Los precios de `Activo Mayor` y `Titular de Grupo` se corrigen a los valores reales
- **Nuevo** (opcional, ver design.md §3): historial de precios anteriores, para no perder el dato cuando `monto_mensual` cambie en el futuro

### Corrida de reconciliación
- Registro de cada ejecución (dry-run o real): cuándo, quién, y el reporte completo de diffs aplicados o simulados

## User Stories

### US-SRV-01 — Reconciliar categorías, servicios y precios contra el Padrón de Servicios real
**Como** Secretaría/Admin
**Quiero** correr una reconciliación contra el Padrón de Servicios de NUVIX (la fuente real de liquidación)
**Para** que la categoría, los servicios y los precios de cada socio en la app coincidan con lo que efectivamente se le cobra

**Criterios de aceptación:**
- Corro el script en modo `dry_run` primero — no escribe nada, devuelve un reporte completo de lo que cambiaría
- El reporte muestra: vínculos a agregar/eliminar por servicio, categorías a modificar, precios a actualizar, y filas del CSV que no matchean contra ningún socio de la base
- Sólo después de revisar el reporte y confirmarlo, se corre en modo real
- Correr la reconciliación dos veces con el mismo CSV da el mismo resultado la segunda vez (no duplica ni revierte nada)

### US-SRV-02 — Un socio nunca se crea ni se borra por esta reconciliación
**Como** Secretaría/Admin
**Quiero** que la reconciliación nunca cree ni borre un socio, sin importar lo que diga el CSV de origen
**Para** no automatizar altas/bajas reales sin revisión humana — eso ya tiene su propio flujo (alta manual, o una futura carga masiva)

**Criterios de aceptación:**
- Un `numero_socio` del CSV que no matchea ningún socio de la base, y que no es una cuenta institucional conocida, aparece en el reporte como "no matcheado", nunca genera un `INSERT`
- Las cuentas institucionales de NUVIX que nunca fueron socios (identificadas por `categoria_padron = 'Cliente'`) se excluyen por regla explícita antes de intentar matchear, distinguidas de un "no matcheado" genérico
- Ningún socio existente se marca como borrado o inactivo por esta reconciliación
- `auth.users`, `profiles` y `socios.numero_socio` no se modifican (salvo `profiles.nombre`, si aplica, con el mismo criterio de auditoría que el resto)

### US-SRV-03 — El precio real de un servicio siempre viene del vínculo, nunca se deriva en la app
**Como** Secretaría/Admin
**Quiero** que cada vínculo socio↔servicio guarde el importe real que NUVIX liquida, sin que la app calcule ni infiera ningún precio por su cuenta
**Para** que el total facturado coincida siempre con lo que NUVIX realmente cobra — la app no cobra cuotas, sólo refleja lo que otro sistema ya liquidó

**Criterios de aceptación:**
- Cada vínculo socio↔servicio guarda el importe real que corresponde a ese socio puntual (`importe`), no una referencia al precio de catálogo
- El precio de catálogo (`servicios_opcionales.monto_mensual`) es sólo informativo — ninguna lectura de facturación real depende de él
- Un caso que no encaja en ningún patrón esperado (ej. "GYM Becado" a $0) se guarda con su importe real tal cual viene del Padrón de Servicios, sin forzarlo a ningún valor estándar
- Cuando la edad, la categoría o cualquier otro factor del socio cambia y eso afecta lo que NUVIX le cobra, el importe del vínculo se corrige en la próxima sincronización del Padrón de Servicios, sin que la app tenga codificada ninguna regla de cuándo o por qué cambia

### US-SRV-04 — Socios sin liquidación quedan marcados para revisión, no se tocan
**Como** Secretaría
**Quiero** ver la lista de socios activos que no aparecen en el Padrón de Servicios o que aparecen sin un concepto de cuota
**Para** investigar por qué no se les está facturando nada, sin que la reconciliación los desactive o les asigne una categoría por default

**Criterios de aceptación:**
- Ningún socio en esta situación cambia de estado, categoría o servicios como resultado de la reconciliación
- La lista completa (con motivo: sin liquidación vs. sin concepto de cuota) queda guardada y disponible para revisión, no sólo impresa en la corrida

## Reglas de Negocio
- El matcheo entre el Padrón de Servicios (NUVIX) y la base es siempre por `socios.numero_socio` — nunca por nombre ni DNI.
- La reconciliación de vínculos socio↔servicio es un diff declarativo contra el estado objetivo del CSV, no una lista de incrementos/decrementos fijos — así es correcta sin importar cuál sea el estado exacto actual, y naturalmente idempotente.
- **La app no factura — refleja.** Ningún precio se calcula ni se deriva por regla propia (ni por categoría, ni por edad, ni por ningún otro eje). El importe real de un servicio vive siempre en el vínculo socio↔servicio, tal cual lo liquida NUVIX; el precio de catálogo es sólo informativo.
- Las cuentas institucionales de NUVIX (identificadas por `categoria_padron = 'Cliente'` en el padrón) se excluyen explícitamente del matcheo — nunca fueron socios, no son un caso de "no encontrado".
- Una categoría o servicio deprecado (ej. "Tenis") se desactiva, nunca se borra — puede tener historial referenciándolo.
- Ningún dato de auditoría/identidad (`auth.users`, `profiles`, `numero_socio`) se modifica por esta reconciliación.

## Requerimientos No Funcionales
- Modo `dry_run` obligatorio y default — cualquier ejecución sin ese flag explícito en `false` no debe escribir en la base.
- Idempotencia: dos corridas consecutivas con el mismo CSV de entrada no deben producir diffs distintos de cero en la segunda.
- Cada corrida (dry-run o real) queda registrada con su reporte completo, para trazabilidad de una corrección de datos financieros a esta escala (1.528 socios, ~$57M/mes de facturación involucrada).
