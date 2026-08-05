# Proposal: Reconciliación de categorías, servicios y precios de Socios (post-carga masiva)

> Revisión 2 — incorpora las confirmaciones de Agus sobre las 4 discrepancias de la v1 y la decisión final de modelo de precios (ver "Historial de decisiones" al final).

## Problema

1. **La carga masiva (2026-07-29/30) usó una fuente que no podía representar la realidad.** `scripts/import-socios-masivo.mjs` leyó una columna `categoria_socio` y una columna `servicio_opcional` — ambas de **valor único** — del maestro viejo. Un socio con Gimnasio + Rugby a la vez no tiene forma de expresarse en una columna simple; quedó con uno de los dos, o con el que ganó en el mapeo.
2. **Los precios cargados en la migración `20260714000000` son incorrectos.** Activo Mayor quedó en $50.000 (real: $25.000), Titular de Grupo en $60.000 (real: $50.000), Gimnasio en $18.750 (real: $25.000 para la variante Mayor).
3. **Apareció la fuente correcta.** El Padrón de Servicios es la tabla que alimenta la liquidación mensual real de NUVIX — una fila por socio y por concepto, con el importe que efectivamente se cobra. A diferencia del padrón general (que ya se usó en la carga masiva), esta fuente sí representa múltiples servicios por socio.

## Solución

Una **reconciliación**, no una recarga: un script con `dry_run` obligatorio que corrige lo ya cargado contra los 3 CSV de entrada (`socios_activos_maestra.csv`, `socios_servicios.csv`, `precios_conceptos.csv`), matcheando exclusivamente por `socios.numero_socio`. Nadie se crea, nadie se borra, no se toca `auth.users`.

El algoritmo de reconciliación de vínculos socio↔servicio es un **diff declarativo contra el CSV** (estado actual en la base vs. estado objetivo descrito por `socios_servicios.csv`), no una lista de incrementos/decrementos fijos — confirmado con Agus (discrepancia #4). Detalle en `design.md` §5.

## Prerequisito — corrección de dos supuestos del pedido original

Mismo patrón que ya se resolvió para el importador de deuda NUVIX (`openspec/changes/importador-deuda-nuvix`):

- **No existe `socios.nuvix_cod_cliente`, y no hace falta crearla.** `socios.numero_socio` (`text`, `NOT NULL UNIQUE`) ya es el Cód. Cliente de NUVIX — lo pobló el propio `import-socios-masivo.mjs` (`numero_socio: row.cod`). El matcheo de esta change va contra esa columna existente.
- **No existe `socios.beca_pct`.** Es una columna del CSV de origen (`socios_activos_maestra.csv`), no de la base. Si se aprueba la propuesta de "beca como descuento" (ver más abajo), ahí sí haría falta agregarla — pero esta change no la agrega ni la aplica todavía.

Verificado contra el schema real (`supabase gen types typescript --linked`; sin Docker corriendo no se pudo hacer `db dump`, pero `gen types` da la misma información de columnas): confirmado, ninguna de las dos columnas existe hoy.

## Cambio de schema — la app refleja el precio, no lo calcula

Decisión final de Agus, que reemplaza la propuesta original de la v1 (tabla `precios_servicio` por combinación, y también mi alternativa de dos filas de catálogo `Gimnasio`/`Gimnasio Menor`): **ninguna de las dos modela precios**. La app no cobra — Mercado Pago está descartado y toda la liquidación real ocurre en NUVIX. Modelar una regla de precio propia (por categoría, por edad, por lo que sea) es construir una fuente de verdad paralela a la que ya existe y que de todos modos hay que re-sincronizar todos los meses.

Evidencia que confirma esto (verificada por Agus además de por mí): la variante Mayor/Menor de Gimnasio sigue la edad real del socio (Menor: 11 a 18 años; Mayor: 17 a 73 años, con superposición en el borde), y los "Dependiente de Grupo Familiar" aparecen en ambas variantes — ninguna columna fija del schema (ni categoría, ni un flag de edad estático) va a seguir esa realidad sin desincronizarse la primera vez que alguien cumpla años.

**Diseño**: catálogo con una sola fila por servicio (sin variantes — nada de "Gimnasio Menor"), precio de catálogo puramente informativo/de referencia. El importe real vive en el vínculo socio↔servicio (`socio_servicios.importe`, ya viene en `socios_servicios.csv` como `importe_liquidacion`, un valor por socio) y manda siempre sobre el catálogo. Se guarda además `socio_servicios.variante_nuvix` (texto — "GYM Mayor", "GYM Menor", "GYM Becado", "RUGBY CUOTA DEPORTIVA", etc.) para trazabilidad, sin que la app interprete ni derive nada de ese texto. Mismo criterio para los 6 servicios, no sólo Gimnasio. Detalle completo en `design.md` §2.

Para `categorias_socio.monto_mensual` (la otra pata de precios, con vigencia por inflación): propongo una tabla de historial liviana poblada por trigger, no versionar cada lectura existente de la app — detalle en `design.md` §4. A diferencia de los servicios, la cuota por categoría sí es un valor único que la propia app necesita mostrar/calcular hoy (`useCuotas`), así que no aplica el mismo criterio de "no modelarlo".

## Alcance de esta change (propuesta — nada de esto está escrito todavía)

- **1 migración** (no escrita en esta pasada): `socio_servicios.importe` + `socio_servicios.variante_nuvix`, catálogo (`Hockey Inclusivo`, `Rugby Inclusivo` nuevos; rename `Tenis Carnet` → `Carnet Tenis`; `Tenis` pasa a `activo = false`), `categorias_socio_historial` + trigger, `reconciliaciones_socios` (guarda cada corrida del reporte, dry-run o real, con quién y cuándo).
- **1 script con `dry_run: true` por default** — hace el diff contra los 3 CSV y devuelve el reporte sin escribir nada.
- **El reporte dry-run** — vínculos a agregar/eliminar por servicio, categorías a cambiar (las 59), precios de catálogo a actualizar (informativos), filas que no matchean o quedan excluidas explícitamente.

## No incluye

- **Beca como descuento no se aplica.** Documento la propuesta completa (`design.md` §7) porque la evidencia la sugiere fuertemente (31 socios becados en el padrón facturados con la cuota normal, confirmado por Agus como el número correcto — discrepancia #3), pero es un cambio de modelo de negocio que hay que confirmar con el club antes de tocar código.
- **No se crea ni se borra ningún socio**, ni siquiera las 6 cuentas institucionales del padrón que nunca fueron socios (ver "Exclusión explícita" abajo).
- **No se toca `auth.users` ni `profiles`** salvo un `UPDATE` de `nombre` si difiere (no relevado en esta pasada — a confirmar si hace falta).
- **No se escribe SQL de migración ni se corre nada fuera de `dry_run`** hasta que confirmes esta propuesta.
- **No se recalcula el flujo de pago de cuotas existente** (`socios-pagos`, `useCuotas`) en esta change — ver "Consecuencia para código existente" abajo, queda documentado como dependencia a resolver antes de confiar en ese flujo para servicios opcionales, no como tarea de esta change.
- Los conceptos "Cliente Gym" ($0, 198 filas vigentes en NUVIX) y "Gimnasio Alícuota" ($60.000, 200 filas) de `precios_conceptos.csv` no aparecen en ningún socio del maestro — son clientes/facturación de NUVIX ajenos a la app. "Rincón del Hincha" ($4.000) tampoco tiene ningún socio activo hoy. Los tres quedan fuera de esta reconciliación (documentados, no bloquean).

## Exclusión explícita — las 6 cuentas institucionales

Confirmado por Agus: Casino, Colegio Nuestra Tierra, UAR, Universidad Nacional del Centro, Nativa Compañía de Seguros y Gómez Marcelo (códigos NUVIX 17033, 16809, 16810, 16990, 18175, 17629) son cuentas institucionales que NUVIX guarda en la misma tabla de clientes que los socios reales — no personas, nunca fueron socios, la carga masiva original las excluyó a propósito.

A diferencia de la v1 de esta propuesta (donde quedaban indistinguibles de un "no matcheado" genérico), el script las **excluye por regla explícita** (`categoria_padron = 'Cliente'` en `socios_activos_maestra.csv`), no por la ausencia de match — quedan en el reporte como `excluidos_institucionales`, separadas de `no_matcheado` (que sería, por ejemplo, un socio real dado de baja de NUVIX pero no de la app) y separadas de `sin_liquidacion` (socios reales activos a quienes no se les está facturando nada). El total de referencia de esta change es **1.528 socios**, no 1.534.

## Consecuencia para código existente — fuera de esta change, pero documentada

`socios-pagos` (acción `declarar-comprobante`/`handleCheckout`) calcula hoy el monto a cobrar de una cuota virtual sumando `categorias_socio.monto_mensual` + `SUM(servicios_opcionales.monto_mensual)` de los servicios del socio. Una vez que el catálogo pasa a ser sólo informativo y el importe real vive en `socio_servicios.importe`, ese cálculo queda desactualizado para cualquier socio cuyo importe real difiera del catálogo (que va a ser el caso normal para Gimnasio, por diseño). No lo toco en esta change — es un cambio de código en un flujo que ya está en pausa según `CLAUDE.md` ("evaluar si vale la pena vs. esperar Banco Macro") — pero cualquier trabajo futuro sobre ese flujo tiene que leer `socio_servicios.importe`, no recalcular desde el catálogo.

## Historial de decisiones (v1 → v2)

Las 4 discrepancias de la v1 quedaron así, confirmadas por Agus:

1. **Total de socios: 1.528**, confirmado. Las 6 filas de más en el maestro son cuentas institucionales de NUVIX, no socios — se excluyen por regla explícita (ver arriba), no como error silencioso.
2. **Sin liquidación: 34**, no 40 y no 72. Los 40 originales incluían las 6 institucionales (que ya no cuentan como "socios sin liquidación" — nunca fueron socios). Quedan 34 socios reales activos sin ningún concepto de cuota en la liquidación, marcados para revisión de Secretaría.
3. **Becados que cambian de categoría: 31**, confirmado como correcto (no un error mío) — Agus había contado sólo el subconjunto que aterriza en Activo Mayor/Menor (26), y confirma que los otros 5 (que aterrizan en Dependiente Grupo Familiar o Titular de Grupo) también cuentan.
4. **Diff declarativo, confirmado.** Los deltas de la v1 describían el estado final esperado, no una secuencia de operaciones — el script calcula el objetivo desde los 3 CSV y diffea contra el estado real de la base al momento de correr, sin asumir un número base de partida.

Además, la v1 proponía modelar el precio de Gimnasio con una tabla de precios por combinación o con dos filas de catálogo (Mayor/Menor) — **descartado por Agus**: la app no factura, no debe modelar ninguna regla de precio propia. Ver "Cambio de schema" arriba.

## Impacto esperado

- Los 970 vínculos socio↔servicio y las categorías de socio reflejan lo que NUVIX realmente liquida — deja de haber una fuente de verdad propia de la app que se desincroniza con lo que el socio efectivamente paga en ventanilla.
- Los 34 socios sin liquidación quedan visibles para que Secretaría investigue (probablemente altas nuevas o bajas no reflejadas en NUVIX), sin tocarlos ni desactivarlos.
- El precio de cada vínculo se actualiza solo en la próxima sincronización mensual del Padrón de Servicios (cuando exista ese flujo recurrente — no es parte de esta change, ver `tasks.md`), sin que la app tenga que anticipar reglas de categoría o edad.
