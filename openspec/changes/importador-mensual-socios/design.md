# Design: Importador mensual de socios

## 1. Formato del archivo — pregunta abierta, bloqueante

No hay todavía un archivo de muestra del "padrón general" que el club va a exportar mes a mes. Se sabe:

- Es **un solo Excel** (`.xlsx`), no el `.txt` de NUVIX original ni los 3 CSV que usó la reconciliación de agosto.
- Es el "padrón general" — probablemente el mismo tipo de export que `Tabla de datos.txt` (vocabulario de ERP de ventas: "Vendedor", "Lista", "Condición Venta", ~52 columnas, una fila por socio), pero en `.xlsx`.

Esto alcanza de sobra para altas/bajas/cambios básicos (identidad, categoría general, datos de contacto) — es exactamente lo que ya procesaba `scripts/import-socios-masivo.mjs` en su primera etapa. **No alcanza, casi seguro, para categoría de liquidación y servicios opcionales con importe** (ver §5) — eso vino en agosto de dos archivos con granularidad de renglón-por-concepto que "Tabla de datos.txt" no tiene.

No armar el parser (mapeo de columnas, reglas de limpieza) hasta tener un archivo real. **Blocker de T1** en tasks.md.

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

## 5. Servicios opcionales y categoría de liquidación — pregunta abierta bloqueante

Agus confirmó que el import también debe mantener actualizados servicios opcionales y categoría de liquidación (no sólo altas/bajas). El precedente (`scripts/reconciliar-servicios-socios.mjs`, agosto 2026) hace exactamente esto, pero contra **3 archivos** con una granularidad que "Tabla de datos.txt" no tenía:

| Archivo (agosto) | Granularidad | Reemplazado por... |
|---|---|---|
| `socios_activos_maestra.csv` | 1 fila por socio, incluye `categoria_padron` y `categoria_liquidacion` | ¿el Excel mensual nuevo? |
| `socios_servicios.csv` | 1 fila por socio **+ servicio + importe** | sin equivalente confirmado todavía |
| `precios_conceptos.csv` | catálogo de precios (informativo, no crítico) | — |

Regla ya vigente y que **debe mantenerse** en el importador mensual (`reconciliar-servicios-socios.mjs:17-25`): el `importe` de cada vínculo socio↔servicio es siempre el que trae el archivo, nunca se deriva de una regla propia ni del catálogo (`servicios_opcionales.monto_mensual` es sólo informativo).

**No se diseña el parser de servicios/categoría de liquidación hasta confirmar**: el Excel mensual real, ¿trae una fila por socio+servicio (como `socios_servicios.csv`), o una fila por socio con los servicios listados en columnas/celda (como parte de "Tabla de datos.txt", donde cada socio tenía un único `servicio_opcional`, no varios)? Si es lo segundo, no alcanza para representar un socio con más de un servicio (ej. Rugby + Gimnasio a la vez, caso real y común hoy en `socio_servicios`). Confirmar con el primer archivo real antes de tocar esta parte — diseño de esta sección queda pendiente en tasks.md como T-bloqueada.

## 6. Reingreso — decidido (2026-08-19)

**Reactivación automática.** Un socio dado de baja por este importador (`estado='inactivo'`, login bloqueado) que vuelve a aparecer en un archivo de un mes futuro se reactiva solo, mismo mecanismo que ya usa "Reactivar socio" (`admin-socios/index.ts` `handleReactivate` — desbanea + `estado` vuelve a `'activo'` o `'pendiente'` según `foto_validada`). Misma cuenta, mismo DNI como contraseña, recupera acceso sin intervención manual de secretaría.

Decisión explícita de Agus: "si se borra de la app, se desactiva, si se vuelve a agregar, puede volver a acceder a la app" — trata la baja/reingreso como un espejo directo de si la persona está en el padrón vigente del club o no, sin capa extra de revisión humana en el reingreso.

## 7. Notificación de baja — pregunta abierta

¿Un socio dado de baja recibe algún aviso (push/mail) o es silencioso? Hoy "Desactivar socio" manual no notifica a nadie. Si el import mensual va a dar de baja en bloque (potencialmente varias personas de una), vale la pena decidir esto antes de implementar — mandar 0 avisos es la opción más simple y consistente con el comportamiento actual, pero puede generar sorpresa/reclamos si alguien intenta loguearse y descubre que no puede sin que nadie le haya avisado. **Confirmar con Agus.**

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

1. **Formato exacto del Excel mensual** (§1) — bloqueante para empezar a codear el parser. Pendiente, se habla con secretaría.
2. **Servicios/categoría de liquidación**: ¿el archivo mensual tiene la granularidad de `socios_servicios.csv` (una fila por socio+servicio) o sólo la de `Tabla de datos.txt` (un servicio por socio)? (§5) — bloqueante para esa parte del alcance específicamente, no para altas/bajas/cambios básicos. Pendiente, se habla con secretaría (mismo tema que el punto 1, probablemente se resuelven juntos cuando exista un archivo de muestra real).
3. ~~Reingreso~~ — **decidido**: reactivación automática (§6).
4. **Notificación de baja**: ¿silenciosa o avisa al socio? (§7) — sigue abierto.
5. **Orden banear-vs-actualizar-estado** en la baja, y qué hacer si uno de los dos falla para un socio puntual dentro de una corrida grande (§2) — decisión técnica, no de producto, pero vale que Agus sepa el trade-off.
6. ~~Los 12 socios con `numero_socio` de secuencia~~ — **resuelto**: son 2 cuentas, ninguna es un socio real (§4).
