# Spec: Servicios y Categorías de Socios

## Dominio
`servicios-socios`

## Descripción
Categoría, servicios opcionales y precios de cada socio, sincronizados contra el Padrón de Servicios real de NUVIX (la fuente que efectivamente liquida el club). La app no cobra cuotas — refleja lo que NUVIX ya liquidó, nunca calcula ni infiere un precio por regla propia.

## Actores
- **Secretaría / Admin** — dispara la reconciliación (vía script — no hay UI dedicada todavía), revisa el reporte, decide si aplicar
- **Socio** — no interactúa directamente; ve el resultado reflejado en su categoría, sus servicios y el monto de su cuota

## Modelo de Datos (conceptual)

### Servicio opcional (catálogo)
- `nombre`, `descripcion`, `monto_mensual` (precio **informativo/de referencia**, no autoritativo — ver regla de negocio abajo), `activo`
- Catálogo vigente: Gimnasio, Rugby, Hockey, Carnet Tenis (acceso a canchas sin ser socio — no es lo mismo que jugar al tenis, que está incluido en la cuota social), Hockey Inclusivo, Rugby Inclusivo — sin variantes por edad/categoría, una sola fila por servicio
- Un servicio deprecado (ej. "Tenis", reemplazado por el hecho de que jugar al tenis ya está en la cuota social) pasa a `activo = false`, nunca se borra

### Vínculo socio↔servicio
- Relación N a N entre socio y servicio opcional
- `importe` — el monto real que NUVIX liquida para ese vínculo puntual (viene del Padrón de Servicios). **Manda siempre sobre el precio de catálogo.**
- `variante_nuvix` — texto original de NUVIX ("GYM Mayor", "GYM Menor", "RUGBY CUOTA DEPORTIVA", etc.), sólo trazabilidad, la app no lo interpreta

### Categoría de socio
- `nombre`, `monto_mensual`, `activa`
- `monto_mensual` es el precio vigente; los cambios quedan además registrados en un historial (`categorias_socio_historial`) para no perder el valor anterior

### Corrida de reconciliación
- Registro de cada ejecución (dry-run o real): cuándo, quién, y el reporte completo de diffs aplicados o simulados — vive en `reconciliaciones_socios`

## User Stories

### US-SRV-01 — Reconciliar categorías, servicios y precios contra el Padrón de Servicios real
**Como** Secretaría/Admin
**Quiero** correr una reconciliación contra el Padrón de Servicios de NUVIX (la fuente real de liquidación)
**Para** que la categoría, los servicios y los precios de cada socio en la app coincidan con lo que efectivamente se le cobra

**Criterios de aceptación:**
- Corro el script en modo dry-run primero — no escribe nada, devuelve un reporte completo de lo que cambiaría
- El reporte muestra: vínculos a agregar/eliminar por servicio, categorías a modificar, precios de catálogo desactualizados, y filas del CSV que no matchean contra ningún socio de la base
- Sólo después de revisar el reporte y confirmarlo, se corre en modo real (`--commit`)
- Correr la reconciliación dos veces con el mismo CSV da el mismo resultado la segunda vez (no duplica ni revierte nada)

### US-SRV-02 — Un socio nunca se crea ni se borra por esta reconciliación
**Como** Secretaría/Admin
**Quiero** que la reconciliación nunca cree ni borre un socio, sin importar lo que diga el CSV de origen
**Para** no automatizar altas/bajas reales sin revisión humana — eso ya tiene su propio flujo (alta manual, o una futura carga masiva)

**Criterios de aceptación:**
- Un `numero_socio` del CSV que no matchea ningún socio de la base, y que no es una cuenta institucional conocida, aparece en el reporte como "no matcheado", nunca genera un `INSERT`
- Las cuentas institucionales de NUVIX que nunca fueron socios (identificadas por `categoria_padron = 'Cliente'` en el padrón — comparten la misma tabla de clientes que la gente real) se excluyen por regla explícita antes de intentar matchear, distinguidas de un "no matcheado" genérico
- Ningún socio existente se marca como borrado o inactivo por esta reconciliación
- `auth.users`, `profiles` y `socios.numero_socio` no se modifican (salvo `profiles.nombre`, si aplica, con el mismo criterio de auditoría que el resto)

### US-SRV-03 — El precio real de un servicio siempre viene del vínculo, nunca se deriva en la app
**Como** Secretaría/Admin
**Quiero** que cada vínculo socio↔servicio guarde el importe real que NUVIX liquida, sin que la app calcule ni infiera ningún precio por su cuenta
**Para** que el total facturado coincida siempre con lo que NUVIX realmente cobra — la app no cobra cuotas, sólo refleja lo que otro sistema ya liquidó

**Criterios de aceptación:**
- Cada vínculo socio↔servicio guarda el importe real que corresponde a ese socio puntual, no una referencia al precio de catálogo
- El precio de catálogo (`servicios_opcionales.monto_mensual`) es sólo informativo — ninguna lectura de facturación real depende de él
- Un caso que no encaja en ningún patrón esperado (ej. un socio becado en un servicio a $0) se guarda con su importe real tal cual viene del Padrón de Servicios, sin forzarlo a ningún valor estándar
- Cuando la edad, la categoría o cualquier otro factor del socio cambia y eso afecta lo que NUVIX le cobra, el importe del vínculo se corrige en la próxima sincronización del Padrón de Servicios, sin que la app tenga codificada ninguna regla de cuándo o por qué cambia

### US-SRV-04 — Socios sin liquidación quedan marcados para revisión, no se tocan
**Como** Secretaría
**Quiero** ver la lista de socios activos que no aparecen en el Padrón de Servicios o que aparecen sin un concepto de cuota
**Para** investigar por qué no se les está facturando nada, sin que la reconciliación los desactive o les asigne una categoría por default

**Criterios de aceptación:**
- Ningún socio en esta situación cambia de estado, categoría o servicios como resultado de la reconciliación
- La lista completa (con motivo: sin liquidación vs. sin concepto de cuota) queda guardada en `reconciliaciones_socios`, disponible para revisión — sin pantalla dedicada todavía

## Reglas de Negocio
- El matcheo entre el Padrón de Servicios (NUVIX) y la base es siempre por `socios.numero_socio` (el Cód. Cliente de NUVIX) — nunca por nombre ni DNI.
- La reconciliación de vínculos socio↔servicio es un diff declarativo contra el estado objetivo del CSV, no una lista de incrementos/decrementos fijos — así es correcta sin importar cuál sea el estado exacto actual, y naturalmente idempotente.
- **La app no factura — refleja.** Ningún precio se calcula ni se deriva por regla propia (ni por categoría, ni por edad, ni por ningún otro eje). El importe real de un servicio vive siempre en el vínculo socio↔servicio, tal cual lo liquida NUVIX; el precio de catálogo es sólo informativo.
- Las cuentas institucionales de NUVIX se excluyen explícitamente del matcheo — nunca fueron socios, no son un caso de "no encontrado".
- Una categoría o servicio deprecado se desactiva, nunca se borra — puede tener historial referenciándolo.
- Ningún dato de auditoría/identidad (`auth.users`, `profiles`, `numero_socio`) se modifica por una reconciliación de este tipo.

## Requerimientos No Funcionales
- Modo dry-run obligatorio y default — cualquier ejecución sin `--commit` explícito no debe escribir en la base.
- Idempotencia: dos corridas consecutivas con el mismo CSV de entrada no deben producir diffs distintos de cero en la segunda.
- Cada corrida (dry-run o real) queda registrada con su reporte completo, para trazabilidad de correcciones de datos financieros a esta escala (1.528 socios, ~$57M/mes de facturación involucrada).

## Historial
- **2026-08-05** — Reconciliación inicial contra el Padrón de Servicios NUVIX, aplicada en producción. Corrigió una carga masiva previa (2026-07-29/30) que había usado una fuente de valor único (no podía representar más de un servicio por socio) y precios incorrectos. 970 vínculos, 59 categorías reclasificadas, 34 socios marcados sin liquidación para revisión de Secretaría. Ver `openspec/changes/archive/2026-08-05-actualizar-servicios-socios/`.
