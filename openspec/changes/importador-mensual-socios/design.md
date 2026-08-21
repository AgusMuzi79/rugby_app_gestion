# Design: Importador mensual de socios

## 1. Formato del archivo — resuelto, ya hay muestra real de los 2 archivos (2026-08-21)

**Arquitectura confirmada: 2 archivos**, ambos con muestra real ya validada contra producción.

### 1.1 Padrón de socios — `Padron Extendido.xlt.xls`

Planilla plana normal (no Crystal Reports con bandas — headers en fila 1, 1 fila por persona/cuenta), **3121 filas**, mismo vocabulario de ERP de ventas que "Tabla de datos.txt" (`Vendedor`, `Lista`, `Condición Venta`). Columnas relevantes: `Cód. Cliente` (=`numero_socio`), `Estado`, `Categoría`, `Categoría Comercial`, `Número Documento` (DNI), `FechaNacimiento`, `Mail1`, `Socio Cabecera` (=`cabecera_id`), `Fecha Alta`, `Fecha Baja` (sentinel `1/1/80` = sin baja real, cuando trae otra fecha es una baja real).

**`Estado` resuelve los 3 filtros en un solo archivo — no hacen falta 3 exports separados, es histórico completo con un campo de clasificación:**

| Estado | Filas | Qué hacer |
|---|---|---|
| `SOCIO` | 1489 | población real de `socios` — presencia/ausencia = alta/baja |
| `BAJA` | 1529 | ya dado de baja en NUVIX — nunca crea/mantiene cuenta |
| `CESANTES` | 57 | plan de regularización de deuda — **decidido con el club (2026-08-21): tratar como baja** (ver más abajo) |
| `CLIENTE GYM` | 41 | cliente de gimnasio sin ser socio — no crea cuenta en la app |
| `ALQUILERES` / `PROVEEDORES` | 3 / 2 | no son personas/socios, descartar |

`Categoría` es la nominal del padrón (incluye `BECADO RUGBY/HOCKEY/TENNIS` como categoría propia — a diferencia del padrón de servicios, donde el becado se factura por su categoría real sin descuento visible; confirma la distinción categoría-padrón vs. categoría-liquidación ya documentada en la reconciliación de agosto). `Categoría Comercial` es **un solo servicio por fila** (`Carece`/`Hockey`/`Tenis`/`Rugby`/`Gym`/`Tenis Carnet`/`Rugby Femenino`/`Hockey Inclusivo`/`Rugby Inclusivo`/`Cliente`) — mismo límite de "Tabla de datos.txt", confirma por qué sigue haciendo falta el padrón de servicios aparte para multi-servicio (§1.2/§5).

Como es histórico con clasificación explícita (no filtrado a "solo vigentes" en el server de NUVIX), **el filtro a "socios vigentes" lo hace nuestro parser por `Estado='SOCIO'`** — no hace falta pedirle al club una versión pre-filtrada. Descartada también la idea de usar el import de deuda como señal de alta/baja: cubre sólo 536 de 1529 socios activos en el último corte, mucho menos completo que este padrón.

**Cruce contra producción (`socios.estado='activo'`, n=1529) — números reales, no estimados:**
- 1440 matchean sin cambios.
- **82 socios activos en la app hoy figuran `BAJA` en NUVIX** — dejaron el club y siguen con acceso vigente.
- **6 socios activos en la app hoy figuran `CESANTES`** — con la regla de cesantes=baja, van a perder acceso apenas corra el importador: `10961, 11955, 16476, 16619, 16666, 18031`.
- **49 códigos con `Estado=SOCIO` en el padrón que no están cargados en la app** — varios con `Fecha Alta` de agosto 2026, gente que se asoció después de la carga masiva de julio y nunca entró al sistema.
- La única excepción real es la cuenta demo (`0012`), que no aparece en el padrón (esperado, no es un socio real de NUVIX — sigue aplicando el flag de exclusión permanente de §4).

**Aplicado en producción (2026-08-21, confirmado por Agus antes de ejecutar):** los 88 (82 `BAJA` + 6 `CESANTES`) se dieron de baja manualmente — mismo mecanismo que "Desactivar socio" (`socios.estado='inactivo'` + `auth.users.banned_until = now() + interval '876000 hours'`), aplicado directo vía SQL contra producción (no por el importador, que todavía no existe). Verificado después: `socios` pasó de 1529/0 a 1441 activo / 88 inactivo, y los 88 `profile_id` quedaron baneados. Reversible con "Reactivar socio" si alguno vuelve a aparecer como `SOCIO` vigente en un padrón futuro.

### 1.2 Padrón de servicios — `padronserviciossocios_uncas.xls`

Reporte NUVIX "Padrón de Servicios por Socio" (`RPT_PadronServiciosSocios_uncas.rpt`, mismo tipo de export Crystal Reports con bandas que `RPT_Vencimientos`, no una tabla plana). Verificado contra producción:

- **1 fila por socio+concepto**: cabecera de grupo (código de socio + nombre) seguida de una fila por cada concepto liquidado — la cuota de categoría (`CUOTA ACTIVO MAYOR`, `CUOTA ACTIVO MENOR`, `CUOTA DEPENDIENTE GRUPO FAMILIAR`, `CUOTA TITULARES GRUPO`, `ACTIVO UNQUITAS`) y cada servicio opcional (`RUGBY/HOCKEY CUOTA DEPORTIVA`, `GYM Mayor/Menor/Alicuota/Becado/Cliente`, `CARNET TENIS`, `RUGBY/HOCKEY INCLUSIVO`), con fecha de "Inic. Liq." y un campo "Bonificación" (casi siempre `1.00`). **Esto resuelve la granularidad de §5** — es el reemplazo de `socios_servicios.csv` de agosto, en un solo export reproducible mes a mes. Sin columna de importe — el monto sigue derivándose del catálogo/nombre de concepto, no viene en el archivo.
- Concepto nuevo sin mapear todavía: `CUOTA RINCON DEL HINCHA` (3 casos en la muestra).
- Confirma un hallazgo pendiente de agosto (ver `openspec/changes/archive/2026-08-05-actualizar-servicios-socios/design.md` §7): los becados **no** tienen un concepto "BECADO" propio — figuran liquidados por el nombre completo de su categoría real (ej. `CUOTA ACTIVO MAYOR`), sin descuento visible en este reporte.
- Cruce contra `socios` (estado activo, n=1529): **1517 matchean por `numero_socio`**. Los 12 que no aparecen son casi todos categorías `$0` que aparentemente no generan línea de liquidación (5 Vitalicio, y la cuenta demo `0012`) — **no sirve por sí solo como señal de alta/baja**, para eso está el padrón de socios (§1.1).
- El archivo de muestra se exportó **histórico** (confirmado por Agus, 2026-08-21) — trae conceptos con "Inic. Liq." desde 2002, mezclados con 2026, sin ninguna columna de estado/vigencia (rango de la hoja es sólo `A:G`). El parser debería quedarse sólo con la fila más reciente por socio+tipo-de-concepto (mismo criterio de "la última manda" que ya usa el importador de deuda para reemplazar cortes completos).

### Cesantes = baja — decidido con el club (2026-08-21)

Cesantes = gente con plan de regularización de deuda (mismo concepto `reg_cesantes` que ya excluye el importador de deuda del conteo de `meses_impagos`, ver `_shared/parse-deuda-nuvix.ts`). **Decidido: pasan a ser baja — pierden acceso a la app**, mismo mecanismo que cualquier otra baja del importador (§2 — `estado='inactivo'` + ban). Los 6 casos reales de hoy están identificados arriba (§1.1) — confirmar con Agus/secretaría antes de aplicar.

No armar el parser (mapeo de columnas, reglas de limpieza) hasta decidir qué hacer con los 82 `BAJA`/6 `CESANTES` reales de arriba. **Sigue siendo blocker de T1** en tasks.md, pero ya no por falta de archivo — ahora es una decisión de producto sobre gente real.

## 2. Diff: altas, bajas, cambios

A diferencia del importador de deuda (que siempre reemplaza el corte completo), acá el archivo mensual es un **padrón vigente**, no un delta — el diff se calcula comparando contra `socios.numero_socio` existente:

```
archivo = { numero_socio → fila }          (parseado del Excel)
base    = SELECT numero_socio, estado, categoria_id, dni, email, ...
          FROM socios WHERE estado IN ('activo', 'pendiente')

altas      = numero_socio ∈ archivo, ∉ base                        → crear
bajas      = numero_socio ∈ base, ∉ archivo                        → estado='inactivo' + ban
actualizar = numero_socio ∈ archivo ∩ base, con datos distintos    → UPDATE campo por campo
sin_cambio = numero_socio ∈ archivo ∩ base, datos iguales          → no tocar
```

Mismo criterio de idempotencia que `importar-deuda`: correr el mismo archivo dos veces seguidas da 0 altas/0 bajas/0 cambios la segunda vez.

### Altas — mismas reglas que `scripts/import-socios-masivo.mjs`

- DNI inválido/faltante → `SD{numero_socio}`.
- Email faltante/duplicado dentro del archivo → `socio-{numero_socio}@uncas.local`.
- `auth.admin.createUser({ email, password: dni, email_confirm: true })`, `profiles.roles = ['socio']`, `socios.estado = 'pendiente'` (mismo criterio que hoy — falta validar foto).
- **No crea `jugadores`** (eso es el cruce UAR, fuera de esta change — ver proposal.md "No incluye").
- **No resuelve `cabecera_id`** salvo que el archivo mensual traiga una columna equivalente a `cabecera_cod_cliente` — a confirmar cuando exista el archivo de muestra (§1).

### Bajas — mismo mecanismo que "Desactivar socio"

```ts
// Mismo patrón que admin-socios/index.ts:162-165 y admin-usuarios/index.ts:~231
await supabaseAdmin.auth.admin.updateUserById(socio.profile_id, { ban_duration: '876000h' })
await supabaseAdmin.from('socios').update({ estado: 'inactivo' }).eq('id', socio.id)
```

Corrido en bloque, dentro de la misma transacción SQL que las altas (ver §3 — función `SECURITY DEFINER`, igual que `importar_deuda_nuvix`, salvo que acá además hay que llamar a `auth.admin.updateUserById` por cada baja — **eso no se puede hacer desde una función SQL pura**, tiene que quedar en la Edge Function, fuera de la transacción de Postgres. Implica que si la función SQL confirma la baja en `socios.estado` pero el `updateUserById` posterior falla para algún socio puntual, ese socio queda `inactivo` en la tabla pero *no* baneado — hay que decidir el orden correcto (¿banear primero, actualizar `estado` después? ¿tolerar la inconsistencia y loguearla para reintento manual?). Detallar en T2 de tasks.md, no bloqueante para el resto del diseño.

### Cambios — categoría general y datos básicos

Directo: si `categoria_padron`/nombre/fecha de nacimiento/etc. cambiaron en el archivo, `UPDATE socios`. **Nunca se toca `dni` ni `email` de un socio existente por este import** — son las credenciales de login; un archivo con un error de tipeo no debería trabar a alguien afuera de su cuenta. Corregir DNI/email de un socio existente sigue siendo manual (ver [[project-limpieza-mails-dnis-sinteticos]] si aplica — mismo criterio que ya se usó ahí).

## 3. Schema

Reutiliza `socios.estado` existente (`'activo' | 'pendiente' | 'inactivo'`, ya soporta esto). Se agrega:

```sql
CREATE TABLE importaciones_socios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre    text,
  altas             int NOT NULL DEFAULT 0,
  bajas             int NOT NULL DEFAULT 0,
  actualizados      int NOT NULL DEFAULT 0,
  sin_cambio        int NOT NULL DEFAULT 0,
  importado_por     uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE socios
  ADD COLUMN ultima_importacion_id uuid REFERENCES importaciones_socios(id);
```

`ultima_importacion_id` sirve para trazabilidad ("¿por qué se dio de baja este socio? → import del DD/MM") y para responder la pregunta de reingreso (§6) sin adivinar.

Mismo patrón de RLS que `importaciones_deuda` (`secretaria_admin_all_importaciones_socios`, `FOR ALL TO authenticated USING (get_rol() IN ('secretaria','admin'))`) — la escritura real siempre pasa por `service_role` desde la Edge Function.

## 4. Safeguard obligatorio antes de la primera corrida

**Resuelto (2026-08-19) — el `socios_numero_seq` llegó a 12, pero sólo 2 filas siguen `activo`/`pendiente` hoy** (las otras 10 eran cuentas de prueba ya limpiadas). Verificado con query directa a producción:

| `numero_socio` | email | dni | creado | qué es |
|---|---|---|---|---|
| `0012` | `demo@uncas.local` | `99999999` | 2026-08-07 | Cuenta demo para reviewers de App Store/Play Store (ver CLAUDE.md, "App Review Information") — **necesaria de forma permanente**, no es basura a limpiar. |
| ~~`9998`~~ | ~~`testfreeze@uncas.local`~~ | ~~`88888888`~~ | 2026-08-15 | **Borrada (2026-08-19)** — cuenta de prueba del freeze de iOS, sin dependientes (0 jugadores/comprobantes/cabecera), `DELETE FROM auth.users` cascadeó sobre `profiles`/`socios` limpio. |

Ninguna de las dos era un socio real del club — el riesgo original ("la primera corrida los da de baja por error, gente real pierde acceso") no aplica. Lo único pendiente ahora:

**`demo@uncas.local` tiene que quedar excluida permanentemente** de la lógica de "baja por ausencia" del importador. Importante: el riesgo acá **no es que colisione** con un `numero_socio` real de NUVIX — los códigos NUVIX son un espacio numérico totalmente aparte (ya en el rango 15000-18000+, siempre creciente, nunca va a bajar a `0012`; Agus lo confirmó y es correcto). El riesgo real es otro: `demo@uncas.local` **nunca va a aparecer en ningún archivo mensual** porque nunca fue ni va a ser un socio real en NUVIX — con la lógica de diff tal como está diseñada ("está en la base pero no en el archivo → baja"), el importador la marcaría como baja **todos los meses**, bloqueando el login que usan los revisores de Apple/Google cada vez que se re-envía una versión para revisión. Un flag simple alcanza (ej. `socios.excluir_de_import boolean default false`, o hardcodear el DNI `99999999` como excepción — la primera opción escala mejor si aparece otra cuenta especial a futuro).

Deja de ser un blocker real de T0, baja de prioridad en tasks.md — sólo falta aplicar el flag cuando se implemente T2.

## 5. Servicios opcionales y categoría de liquidación — resuelto por el padrón de servicios (§1.2)

Agus confirmó que el import también debe mantener actualizados servicios opcionales y categoría de liquidación (no sólo altas/bajas). El precedente (`scripts/reconciliar-servicios-socios.mjs`, agosto 2026) hace exactamente esto, pero contra **3 archivos** con una granularidad que "Tabla de datos.txt" no tenía:

| Archivo (agosto) | Granularidad | Reemplazado por... |
|---|---|---|
| `socios_activos_maestra.csv` | 1 fila por socio, incluye `categoria_padron` y `categoria_liquidacion` | `Padron Extendido.xlt.xls` (§1.1, columna `Categoría`) para categoría nominal — categoría de liquidación la sigue dando el padrón de servicios |
| `socios_servicios.csv` | 1 fila por socio **+ servicio + importe** | `padronserviciossocios_uncas.xls` (§1.2) — misma granularidad de socio+concepto, sin importe explícito (se deriva del catálogo, igual que hoy) |
| `precios_conceptos.csv` | catálogo de precios (informativo, no crítico) | catálogo existente `servicios_opcionales`/`categorias_socio`, sin cambios |

Regla ya vigente y que **debe mantenerse** en el importador mensual (`reconciliar-servicios-socios.mjs:17-25`): el `importe` de cada vínculo socio↔servicio es siempre el que trae el archivo, nunca se deriva de una regla propia ni del catálogo (`servicios_opcionales.monto_mensual` es sólo informativo) — **ojo, esto cambia**: el padrón de servicios nuevo no trae importe explícito (§1.2), así que acá el importe SÍ va a tener que derivarse del catálogo por nombre de concepto. Documentar el cambio de criterio cuando se implemente T2 — ya no es "nunca calculado", es "calculado, porque la fuente no lo trae".

**Mapeo concepto→catálogo para gimnasio — resuelto (2026-08-21), migration `20260821000000_gimnasio_variantes_padron_servicios.sql` aplicada en cloud:**

| Concepto (`padronserviciossocios_uncas.xls`) | `servicios_opcionales.nombre` | Precio |
|---|---|---|
| `GYM Mayor` | `Gimnasio` | $25.000 |
| `GYM Menor` | `Gimnasio Menor` (reactivado, estaba `activo=false`) | $18.750 |
| `GYM ALICUOTA` | `Gimnasio Alícuota` (nuevo) | $60.000 |
| `CLIENTE GYM` | `Cliente Gimnasio` (nuevo) | $0 — sólo diferencia a un cliente de gimnasio de un socio común, no es un cargo |
| `GYM Becado` | `Gimnasio Becado` (nuevo) | $0 — mismo criterio que el resto de las becas |

**`GYM ALICUOTA` — aclaración de Agus (2026-08-21): quien paga alícuota de gimnasio paga sólo eso, no paga cuota social.** Verificado cruzando los dos padrones: de los 207 casos con este concepto, **ninguno es `Estado=SOCIO`** — 166 son `BAJA` (histórico) y 41 son `CLIENTE GYM` (los clientes actuales de gimnasio). Como los clientes de gimnasio ya están excluidos de crear cuenta en la app (§1.1), esta regla no debería llegar a afectar ningún cálculo real del importador de socios — queda documentada por si algún día aparece un caso mixto (socio real que además paga alícuota), pero no se vio ninguno en la muestra.

Faltan por confirmar los mapeos del resto de conceptos del padrón de servicios cuando se arme el parser (T1/T2): `CUOTA RINCON DEL HINCHA` no tiene catálogo todavía (§1.2), y el resto (`RUGBY/HOCKEY CUOTA DEPORTIVA`, `CARNET TENIS`, `RUGBY/HOCKEY INCLUSIVO`) deberían mapear directo por nombre contra el catálogo existente — sin verificar letra por letra todavía.

## 6. Reingreso — decidido (2026-08-19)

**Reactivación automática.** Un socio dado de baja por este importador (`estado='inactivo'`, login bloqueado) que vuelve a aparecer en un archivo de un mes futuro se reactiva solo, mismo mecanismo que ya usa "Reactivar socio" (`admin-socios/index.ts` `handleReactivate` — desbanea + `estado` vuelve a `'activo'` o `'pendiente'` según `foto_validada`). Misma cuenta, mismo DNI como contraseña, recupera acceso sin intervención manual de secretaría.

Decisión explícita de Agus: "si se borra de la app, se desactiva, si se vuelve a agregar, puede volver a acceder a la app" — trata la baja/reingreso como un espejo directo de si la persona está en el padrón vigente del club o no, sin capa extra de revisión humana en el reingreso.

## 7. Notificación de baja — decidido (2026-08-21)

**Sí, se manda mail.** A diferencia de "Desactivar socio" manual (que hoy no notifica a nadie), el import mensual sí tiene que avisar — decisión de Agus con el club. El mail distingue el motivo:
- **Baja por ausencia del padrón** (dejó de ser socio) — mail genérico de baja.
- **Baja por `CESANTES`** (§1.1) — mail específico: aclara que la baja es por estar en situación de cesante (plan de regularización de deuda), no una baja general del club.

Implementación: reusar `enviarEmail()` de `supabase/functions/_shared/email.ts` (mismo patrón fire-and-forget que ya usan `admin-usuarios` y `socios-pagos` — si faltan `RESEND_API_KEY`/`CLUB_EMAIL_FROM` no rompe el import, sólo no manda el mail). El motivo (`ausencia` vs `cesante`) tiene que viajar por socio desde el diff (§2) hasta el paso de envío — agregar un campo `motivo` a las filas de baja calculadas, no sólo `estado='inactivo'`. El mail del socio sale de `profiles`/`auth.users.email` (ojo con los emails sintéticos `socio-{codigo}@uncas.local` — ver [[project-limpieza-mails-dnis-sinteticos]] — esos socios no van a recibir nada real, aceptar la limitación por ahora).

## 8. Edge Function `importar-socios` — flujo (borrador, sujeto a §1/§5)

```
Deno.serve
  1. Verificar rol del caller (secretaria | admin)
  2. Leer el Excel del FormData, parsear con SheetJS (mismo patrón que importar-deuda)
  3. Calcular el diff completo contra socios activos/pendientes (§2) SIN escribir nada todavía
  4. Devolver el diff a la web para preview (altas: N, bajas: N, cambios: N) —
     a diferencia del importador de deuda, acá SÍ vale la pena un paso de confirmación
     explícita antes de aplicar, dado que "baja" bloquea logins reales.
     Ver §9 sobre si esto es un segundo request (confirmar) o un solo request con flag.
  5. Sólo al confirmar: aplicar altas + cambios + bajas dentro de una función Postgres
     SECURITY DEFINER (igual que importar_deuda_nuvix) para lo que es puramente SQL,
     más las llamadas a auth.admin (createUser / updateUserById ban) desde la Edge
     Function, fuera de esa transacción (ver §2 nota sobre orden altas/bajas vs. auth)
  6. INSERT importaciones_socios (resumen) + UPDATE socios.ultima_importacion_id
  7. Devolver resumen final: { altas, bajas, actualizados, sin_cambio, errores }
```

## 9. Página web — preview antes de aplicar

Dado que este import puede bloquear logins reales (a diferencia del de deuda, que sólo actualiza números), la página debería mostrar el diff calculado **antes** de escribir nada — lista de altas (nombres nuevos), lista de bajas (nombres que van a quedar bloqueados), lista de cambios — y pedir una confirmación explícita ("Aplicar N altas y M bajas") antes de ejecutar el paso 5 de §8. Mismo principio de seguridad que ya rige `importar-deuda` (aborta si no reconcilia, nunca escribe a medias), llevado un paso más allá porque acá el error no es "un número mal calculado", es "alguien real se queda sin poder entrar a la app".

## 10. Decisiones a confirmar con Agus (resumen)

1. ~~Formato exacto del Excel mensual~~ — **resuelto (§1, 2026-08-21)**: 2 archivos con muestra real, `Padron Extendido.xlt.xls` (altas/bajas) + `padronserviciossocios_uncas.xls` (servicios/categoría), ambos validados contra producción.
2. ~~Servicios/categoría de liquidación~~ — **resuelto por el padrón de servicios** (§1.2/§5): trae una fila por socio+concepto, igual granularidad que `socios_servicios.csv` de agosto (sin importe explícito, a diferencia de agosto — ver nota en §5).
3. ~~Reingreso~~ — **decidido**: reactivación automática (§6).
4. ~~Notificación de baja~~ — **decidido con el club (2026-08-21)**: sí, mail — distinto texto si es por ausencia del padrón o por `CESANTES` (§7).
5. **Orden banear-vs-actualizar-estado** en la baja, y qué hacer si uno de los dos falla para un socio puntual dentro de una corrida grande (§2) — decisión técnica, no de producto, pero vale que Agus sepa el trade-off.
6. ~~Los 12 socios con `numero_socio` de secuencia~~ — **resuelto**: son 2 cuentas, ninguna es un socio real (§4).
7. ~~Cesantes = baja~~ — **decidido con el club (2026-08-21)**: sí, pierden acceso (§1.1). ~~Revisar con Agus/secretaría la lista real de 82+6~~ — **hecho (2026-08-21)**: los 88 se dieron de baja manualmente en producción, confirmado por Agus antes de ejecutar (§1.1).
