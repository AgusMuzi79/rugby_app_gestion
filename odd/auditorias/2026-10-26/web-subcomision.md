# Auditoría — web-subcomision-buffet-publicas

**Alcance (leído completo, repo en `5a0ce4c`):** 3037 líneas.

| Archivo | Líneas |
|---|---|
| `web/app/(subcomision)/layout.tsx` | 59 |
| `web/app/(subcomision)/dashboard/page.tsx` | 139 |
| `web/app/(subcomision)/divisiones/page.tsx` | 453 |
| `web/app/(subcomision)/informes/page.tsx` | 364 |
| `web/app/(subcomision)/noticias/page.tsx` | 325 |
| `web/app/(subcomision)/usuarios/page.tsx` | 710 |
| `web/app/(buffet)/layout.tsx` | 56 |
| `web/app/(buffet)/buffet/promos/page.tsx` | 260 |
| `web/app/login/page.tsx` | 135 |
| `web/app/soporte/page.tsx` | 59 |
| `web/app/privacidad/page.tsx` | 115 |
| `web/app/eliminar-cuenta/page.tsx` | 66 |
| `web/app/page.tsx`, `web/app/layout.tsx`, `web/app/globals.css` | 5 + 30 + 26 |
| `web/components/Sidebar.tsx`, `SidebarBuffet.tsx`, `SidebarLector.tsx` | 84 + 75 + 76 |

**Leído como soporte (no auditado como UI):** `web/lib/{supabase,edgeFunction,noticiaSubcomision}.ts`, `web/app/(porteria)/layout.tsx`, `supabase/functions/admin-usuarios/index.ts`, `supabase/functions/admin-socios/index.ts` (validate-photo), `supabase/functions/socios-pagos/index.ts` (MP), migraciones `20260506000000`, `20260601000000/01`, `20260616000001`, `20260910000002`, `20260911000002`, `20260914000000`, `20261014000000`, `20261020000000`, `supabase/config.toml`, `app/components/shared/SobreScreen.tsx:1-40`, `app/lib/solicitudBaja.ts`, `odd/tasks/auditoria-ux-socio.md` (T11), `CLAUDE.md`.

**Detector impeccable:** corrió (`impeccable detect --json` sobre todo el alcance, exit 0) y devolvió `[]` — también `[]` sobre archivos sueltos con problemas evidentes, así que no está parseando TSX. Todo lo de abajo es verificación manual.

**Contexto importante que cambia el brief:** el brief dice que la baja "se pide a Secretaría vía `solicitudes_baja`". **Ya no es así:** desde el 2026-10-14 (PR #26, `SobreScreen.tsx:18-24`, `CLAUDE.md`) el botón "SOLICITAR BAJA DE LA CUENTA" abre `uncasapp.com/eliminar-cuenta` y la baja se pide por mail; el flujo `solicitudes_baja` quedó en el código sin usar. La página `eliminar-cuenta` es coherente con *ese* flujo, pero no con la base de datos (ver hallazgo #10).

---

# Pasada 1 — auditor-ux

## Veredicto

Audité por código el panel de Subcomisión (5 pantallas + layout), el de Buffet, el login y las tres páginas públicas que miran Apple y Google. **No sale así.** Hay un botón que borra un socio entero (cuotas y pagos incluidos) con un `confirm()` que no lo dice. Los informes muestran porcentajes calculados sobre una muestra truncada a 1000 filas. La alerta de 4 faltas no salta nunca. Y la política de privacidad no menciona que las fotos de los socios se mandan a AWS Rekognition. Lo visual (contraste, teclado, 320px) está en el mismo nivel: falla AA de punta a punta. Cuidado: es una pasada única con un solo evaluador, así que la cobertura real es parcial (~35 % según Nielsen).

**S4:** 2 · **S3:** 9 · **S2:** 1 · **S1:** 0

## Hallazgos

### S4 — "ELIMINAR" en Usuarios borra el socio completo, cuotas y pagos incluidos

**Dónde:** `web/app/(subcomision)/usuarios/page.tsx:189-194` (handler), `:352` (botón); `supabase/functions/admin-usuarios/index.ts:245-253` (`auth.admin.deleteUser`); cascada `20260506000000_init_schema.sql:51` (`profiles.id → auth.users ON DELETE CASCADE`) → `20260601000000_socios_schema.sql:86` (`socios.profile_id ON DELETE CASCADE`) → `:114, :128, :152` (cuotas, pagos_socios, etc. `ON DELETE CASCADE`).
**Rompe:** Nielsen #5 Prevención de errores · Nielsen #3 Control y libertad · WCAG 2.2 SC 3.3.4 Prevención de errores (legal, financiero, datos)
**Por qué:** casi todo el staff se da de alta "DESDE SOCIO EXISTENTE" (`assign-role`, que suma `socio` a `roles[]`), así que eliminar a un entrenador borra en cascada su fila de `socios`, sus cuotas, pagos, accesos y turnos. No se puede deshacer y Supabase está en plan Free, sin backups automáticos. El `confirm` dice "¿Eliminar a X?", no "vas a borrar su registro de socio". Lo puede hacer una cuenta de Subcomisión, no solo admin (`admin-usuarios/index.ts:41`). Es la misma trampa que T11 documentó para el socio (`learnings`: no borrar profiles desde código).

**Fix:** que la función se niegue a borrar a quien es socio y que la UI ofrezca "Quitar rol de staff":
```ts
// admin-usuarios/index.ts — handleEliminar
const { data: socio } = await supabaseAdmin.from('socios').select('id').eq('profile_id', userId).maybeSingle()
if (socio) return jsonError(409, 'Es socio del club: no se puede eliminar la cuenta. Quitale el rol de staff.')
if (callerRol !== 'admin') return jsonError(403, 'Sólo admin elimina cuentas.')
```
Agregar la acción `remove-role` (saca `nuevoRol` de `roles[]` y pone `rol = 'socio'`), y en la UI: `ELIMINAR` solo se muestra si `isAdmin && !p.roles.includes('socio')`. Si no, el botón pasa a ser `QUITAR ROL DE STAFF`. Mover `ELIMINAR` lejos de `DESACTIVAR` (hoy están pegados, mismo estilo rojo, `:350-352`).

---

### S4 — No se puede adjuntar una imagen con teclado (noticias y promos)

**Dónde:** `web/app/(subcomision)/noticias/page.tsx:283-292`, `web/app/(buffet)/buffet/promos/page.tsx:222-231`
**Rompe:** WCAG 2.2 SC 2.1.1 Teclado (A)
**Por qué:** el `<input type="file">` tiene `className="hidden"` (`display:none`) y queda envuelto en un `<label>`, que no es focusable. Con Tab no se llega a "+ AGREGAR IMAGEN / FOTO". La función queda bloqueada para quien usa teclado.

**Fix:**
```tsx
<label className="flex items-center justify-center border border-dashed border-gris-claro py-6 cursor-pointer hover:border-tinta/40 focus-within:outline focus-within:outline-2 focus-within:outline-oro">
  <span className="font-lora text-xs tracking-widest text-oro">+ AGREGAR IMAGEN</span>
  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleElegirImagen} className="sr-only" />
</label>
```
(`sr-only` en vez de `hidden`: queda en el orden de tabulación, Enter/Espacio abre el selector.)

---

### S3 — Informes y Portada calculan sobre las primeras 1000 filas y lo muestran como total

**Dónde:** `web/app/(subcomision)/informes/page.tsx:43-50` (divisiones, jugadores, eventos, **asistencias**, resultados, fichajes sin paginar), `web/app/(subcomision)/dashboard/page.tsx:30-33, 42-44, 50-53` (eventos, cobranzas, asistencias). Tope: `supabase/config.toml:18` `max_rows = 1000`.
**Rompe:** Nielsen #1 Visibilidad del estado del sistema · Nielsen #9 (el error ni se detecta: se muestran números falsos)
**Por qué:** con 17 planteles y entrenamientos 3 veces por semana, `asistencias` pasa las 1000 filas en pocas semanas (solo el cronograma post temporada son 36 eventos × 5 divisiones). PostgREST corta en 1000 filas, en orden arbitrario. Desde ahí, "ASISTENCIA GLOBAL", el % por jugador y "COBRANZAS PENDIENTES" muestran un número parcial y nada lo indica. Además los 7 + 4 `{ data }` ignoran `error` (lección #2): si falla la red, se ve "0 %" y "Sin datos de asistencia". El helper correcto ya existe y no se usa: `web/lib/supabase.ts:10` `selectAllRows`.

**Fix:** usar `selectAllRows` y mostrar el error.
```ts
const asis = await selectAllRows<AsistenciaDB>((from, to) =>
  supabase.from('asistencias').select('evento_id, jugador_id, estado').order('evento_id').range(from, to))
```
Lo mismo para `jugadores`, `eventos`, `fichajes`, `resultados` y, en el dashboard, `cobranzas` y `asistencias`. Mejor todavía para el dashboard: un RPC `resumen_dashboard()` que devuelva los 5 números agregados en SQL. Agregar `const [error, setError] = useState('')`: si cualquier respuesta trae `error`, mostrar "No se pudieron cargar los informes. Reintentar" en vez de las tablas. Ojo con los límites del `in(...)` del dashboard (`:53`): con cientos de ids la URL se va de largo, y es otra razón para el RPC.

---

### S3 — La alerta "4 AUS." no se dispara nunca

**Dónde:** `web/app/(subcomision)/informes/page.tsx:82-88`
**Rompe:** Nielsen #1 Visibilidad del estado del sistema (un dato de negocio falso: la ausencia de alerta se lee como "nadie faltó 4 veces")
**Por qué:** `last4` son los 4 eventos más *lejanos en el futuro* de `eventosFiltrados`: no hay filtro `fecha <= hoy`, y hoy hay eventos cargados hasta el 12/12. Encima, con el filtro por defecto "Todas las divisiones", son eventos de *cualquier* división, no de la del jugador. Un evento futuro o de otra división no tiene asistencia del jugador, así que `a?.estado === 'ausente'` da false. Resultado: la alerta queda apagada para todos.

**Fix:**
```ts
const hoy = new Date().toISOString().slice(0, 10)
const pasadosPorDiv = new Map<string, Evento[]>()
for (const e of eventosFiltrados) {
  if (e.fecha.slice(0, 10) > hoy) continue
  const l = pasadosPorDiv.get(e.division_id) ?? []; l.push(e); pasadosPorDiv.set(e.division_id, l)
}
pasadosPorDiv.forEach(l => l.sort((a, b) => b.fecha.localeCompare(a.fecha)))
const asisPorClave = new Map(asistencias.map(a => [`${a.evento_id}|${a.jugador_id}`, a.estado]))
// en el map de jugadores:
const last4 = (pasadosPorDiv.get(j.division_id) ?? []).slice(0, 4)
const cuatroConsec = last4.length === 4 && last4.every(ev => asisPorClave.get(`${ev.id}|${j.id}`) === 'ausente')
```
Extraer a `web/lib/informesAsistencia.ts` con un `.check.ts` (convención `test:*` del web) con 3 casos: evento futuro, otra división, 4 ausentes reales.

---

### S3 — Usuarios: editar rol o divisiones muestra éxito aunque falle, y la lista esconde staff

**Dónde:** `web/app/(subcomision)/usuarios/page.tsx:164-168` (`saveRol`), `:176-179` (`saveDiv`), `:122-127` (filtro), `:196-207` + `:350-351` (activar/desactivar)
**Rompe:** Nielsen #1 Visibilidad del estado · Nielsen #9 Recuperarse de errores · WCAG 2.2 SC 4.1.3 Mensajes de estado
**Por qué:**
1. `saveRol` y `saveDiv` no miran `error`: si RLS o el guard rechazan, la UI pinta el valor nuevo igual (lección #2).
2. `saveRol` cambia solo `rol` y no toca `roles[]`. Si cambiás Entrenador → Manager, `roles` sigue `['socio','entrenador']`: en la app, el selector VISTA ACTIVA (`SobreScreen.tsx`) no ofrece Manager, y la primera vez que cambie de vista pierde el rol para siempre.
3. La lista filtra por el rol **activo** (`.neq('rol','socio')`). Un entrenador que en la app cambió a "vista socio" (`profiles.rol = 'socio'`) desaparece de Gestión de Usuarios.
4. `activo` nunca se carga (`select` en `:123` no lo pide): DESACTIVAR y REACTIVAR se muestran siempre juntos, sin estado. No se sabe si el usuario está desactivado.

**Fix:**
```ts
// :123 — traer roles y activo, filtrar por roles[] (staff = algún rol no-socio)
supabase.from('profiles').select('id, nombre, rol, roles, divisiones, deporte, activo')
  .overlaps('roles', admin ? ROLES_ADMIN : ROLES_SUBCO).order('nombre')
// saveRol: reemplazar el rol de staff en roles[] y validar
const roles = [...new Set([...(p.roles ?? []).filter(r => r !== p.rol), p.tempRol])]
const { error } = await supabase.from('profiles').update({ rol: p.tempRol, roles }).eq('id', p.id)
if (error) { setAviso(`No se pudo cambiar el rol: ${error.message}`); return }
// saveDiv: idem con error
```
Mostrar un chip "DESACTIVADO" si `activo === false` y renderizar **un solo** botón (`activo ? DESACTIVAR : REACTIVAR`). El aviso va en un `<p role="status">` arriba de la lista.

---

### S3 — Divisiones: el formulario deja crear divisiones que la asignación automática ignora sin avisar

**Dónde:** UI `web/app/(subcomision)/divisiones/page.tsx:378-389` (RAMA con default "—"), `:410-423` (RECIBE ADULTOS); lógica `supabase/migrations/20261014000000_division_automatica_por_servicio.sql:205-215` (`d.rama = v_rama`), `:265-280` (`recibe_adultos`, `rama is distinct from 'mixto'`, `v_n > 1 → 'adultos_ambiguo'`)
**Rompe:** Nielsen #5 Prevención de errores · Ley de Tesler (la complejidad la está pagando el usuario sin saberlo)
**Por qué:** para un socio con sexo cargado (casi todos), la asignación automática solo considera divisiones con `rama = 'damas'|'caballeros'`. Una división creada con RAMA "—" (el default) **nunca recibe a nadie** por rango ni como "recibe adultos". Una con rama Mixto se excluye siempre. Y si dos divisiones del mismo deporte y rama tienen RECIBE ADULTOS, nadie se asigna (`adultos_ambiguo`). El texto de ayuda dice "Marcar una sola", pero nada lo impide ni lo avisa. El síntoma, socios que no aparecen en ninguna división ni en su Agenda, se ve días después y en otra pantalla.

**Fix (client, OTA web):** en `handleGuardar`, antes de guardar:
```ts
if (nuevaRecibeAdultos) {
  const otra = divisiones.find(d => d.activa && d.recibe_adultos && d.id !== editandoId
    && d.deporte === nuevaDeporte && (d.rama ?? '') === nuevaRama)
  if (otra) return setError(`"${otra.nombre}" ya recibe adultos de ${DEPORTE_LABEL[nuevaDeporte]} ${RAMA_LABEL[nuevaRama] ?? 'sin rama'}. Desmarcala primero.`)
  if (nuevaRama === 'mixto') return setError('Una división Mixta no recibe adultos automáticamente.')
}
```
Y debajo del select RAMA, cuando `nuevaRama === ''`: *"Sin rama: la asignación automática no le manda jugadores (sólo carga manual)."*. **Backend:** índice único parcial `create unique index on divisiones (deporte, rama) where activa and recibe_adultos;`. **[decision]** ¿una división sin rama tiene que matchear a cualquier sexo? Hoy no matchea.

---

### S3 — Noticias de Subcomisión lista y deja borrar noticias de otros, sin decir de quién son

**Dónde:** `web/app/(subcomision)/noticias/page.tsx:47-52` (sin filtro), `:186` ("N publicadas"), `:210-229`; mismo patrón en `web/app/(buffet)/buffet/promos/page.tsx:35-38` para admin. RLS `20260601000001_socios_rls.sql:144-163` (staff ve y borra todo).
**Rompe:** Nielsen #5 Prevención de errores · Nielsen #6 Reconocimiento antes que recuerdo · Ley de similitud
**Por qué:** la lista trae **todas** las noticias del club: las de Secretaría, las promos del Buffet, las de hockey vistas desde la subco de rugby, las de audiencia cuerpo técnico y los borradores (`publicada = false`, que staff ve). Todas se ven iguales y todas tienen ELIMINAR. "N publicadas" cuenta borradores y se clava en 100 (`LIMITE`). La subco de rugby puede borrar la noticia de Secretaría del día pensando que es suya. En Buffet, un admin que entra a `/buffet/promos` ve como "promociones" todas las noticias del club y puede borrarlas. Además, en promos, `fetchPromos` y `handleEliminar` tragan errores (`:35-52`, `:72` `if (error) return`): sin red se ve "SIN PROMOCIONES TODAVÍA" y un borrado fallido no avisa nada.

**Fix:**
```ts
// noticias:48 — solo las propias por defecto, con toggle "Ver todas"
.select('id, titulo, cuerpo, etiquetas, created_at, imagen_path, publicada, audiencia, autor_id, profiles!noticias_autor_id_fkey(nombre)')
.eq('autor_id', userId)     // toggle "TODAS" quita este filtro, solo lectura (sin ELIMINAR)
```
Mostrar el autor y el chip `BORRADOR` / `CUERPO TÉCNICO` en la línea de fecha. El contador pasa a ser `{noticias.length} noticias tuyas`. En promos: `.eq('autor_id', user.id)` y manejar `error` en lectura y borrado como ya hace noticias (`:54-58`, `:108-114`). Si hace falta el nombre de la FK, verificarlo en `database.types.ts`.

---

### S3 — El panel no se puede usar en un celular: sidebar fija de 224px

**Dónde:** `web/app/(subcomision)/layout.tsx:56` y `web/app/(buffet)/layout.tsx:53` (`ml-56`), `web/components/Sidebar.tsx:31`, `SidebarBuffet.tsx:25`, `SidebarLector.tsx:26` (`fixed w-56`, sin breakpoint)
**Rompe:** WCAG 2.2 SC 1.4.10 Reflow (AA) · SC 1.4.4 Cambio de tamaño de texto
**Por qué:** a 320px, `main` mide 320 − 224 = **96px**, menos 64 de `p-8`: **32px** de contenido. A 768px quedan 480. Nadie de la subcomisión o del buffet puede publicar una noticia o una promo desde el teléfono, que es donde está cuando pasa algo ("se suspende el entrenamiento"). Las páginas públicas (`soporte`, `privacidad`, `eliminar-cuenta`, `login`) sí reflowean bien a 320.

**Fix:** sidebar off-canvas debajo de `lg`.
```tsx
// layout
<div className="min-h-screen bg-papel lg:flex">
  <Sidebar ... />
  <main className="flex-1 lg:ml-56 p-4 sm:p-8 min-h-screen">{children}</main>
</div>
// Sidebar: barra superior con botón en mobile
<button className="lg:hidden fixed top-3 left-3 z-30 min-h-11 min-w-11" aria-expanded={open} aria-controls="nav-panel" onClick={() => setOpen(o => !o)}>MENÚ</button>
<aside id="nav-panel" className={`fixed inset-y-0 left-0 w-56 z-20 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
```
Cerrar al navegar (`useEffect` sobre `pathname`) y con Escape. Además los encabezados con `flex items-end justify-between` (`noticias:183`, `promos:132`, `usuarios:225`) necesitan `flex-wrap gap-4`, y la grilla `grid-cols-2` de Usuarios (`:266`) debe pasar a `grid-cols-1 sm:grid-cols-2`.

---

### S3 — Contraste: textos secundarios, errores y botones destructivos debajo de AA

**Dónde:** `text-tinta/40` en 62 lugares (labels de cards, subtítulos, fechas, headers de tabla, "VER" del login `login/page.tsx:112`), `text-tinta/30` en 4 (`informes:234,303`, `usuarios:261,553`), `text-rojo` en todos los mensajes de error (`login:120`, `noticias:196,202,297`, `promos:236`, `divisiones:425`, `usuarios:541,611,694`), `text-rojo/60` ELIMINAR (`noticias:226`, `promos:166`), `text-rojo/70` QUITAR (`noticias:277`, `promos:216`), `hover:text-papel` sobre `hover:bg-rojo` (`divisiones:240`, `usuarios:350,352`), badge "4 AUS." (`informes:222`). Bordes de inputs `border-tinta/30` (todos los formularios) y `border-gris-claro` en textareas (`noticias:263`, `promos:202`).
**Rompe:** WCAG 2.2 SC 1.4.3 Contraste mínimo (AA) · SC 1.4.11 Contraste no textual (AA)
**Por qué:** medido con `contraste.py` (tabla abajo). El caso más caro es el rojo de error: 3.69:1 sobre la card, justo en el texto que tiene que leerse cuando algo salió mal. La app mobile ya resolvió exactamente esto con `rojoTexto: '#E5634A'` (`app/constants/theme.ts:14`). El web no lo heredó.

**Fix:** tokens semánticos en `globals.css` (mismo valor que la app, fuente única de la paleta):
```css
@theme {
  --color-rojo-texto: #E5634A;   /* texto de error/destructivo sobre fondos oscuros */
  --color-texto-2: #9D998F;      /* = tinta/60 sobre card, reemplaza tinta/40 y /30 */
  --color-borde-control: #7A7060;/* borde de inputs/textarea, 3.66:1 sobre card */
}
```
Reemplazar `text-tinta/40` y `text-tinta/30` → `text-texto-2`; `text-rojo`, `text-rojo/60` y `text-rojo/70` → `text-rojo-texto`; `hover:bg-rojo hover:text-papel` → `hover:bg-rojo-texto hover:text-papel`; badge `bg-rojo text-papel` → `bg-rojo-texto text-papel`; `border-tinta/30` y el `border-gris-claro` de textareas → `border-borde-control`. Los bordes decorativos de cards (`border-gris-claro`, 1.16:1) pueden quedar: no son componentes de UI.

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| Labels/fechas `text-tinta/40` sobre card `#1C1710` | `#726D65` | 3.47:1 | `#9D998F` (texto-2) | 6.26:1 |
| `text-tinta/40` sobre papel `#191309` | `#706B61` | 3.48:1 | `#9D998F` | 6.34:1 |
| `text-tinta/30` sobre card | `#5C5850` | 2.52:1 | `#9D998F` | 6.26:1 |
| Error `text-rojo` sobre card | `#CC4127` | 3.69:1 | `#E5634A` | 5.27:1 |
| Error `text-rojo` sobre papel | `#CC4127` | 3.82:1 | `#E5634A` | 5.46:1 |
| ELIMINAR `text-rojo/60` sobre papel | `#8A2E1A`≈ | 2.11:1 | `#E5634A` | 5.46:1 |
| QUITAR `text-rojo/70` sobre card | ≈ | 2.40:1 | `#E5634A` | 5.27:1 |
| Hover destructivo / badge "4 AUS." `#15110A` sobre `#CC4127` | | 3.90:1 | `#15110A` sobre `#E5634A` | 5.57:1 |
| Rol chip `text-tinta/50` sobre `bg-gris-claro` (`usuarios:257`) | `#8D887D`≈ | 4.46:1 | `text-texto-2` sobre `#2C2418` | ≥5.3 (verificar) |
| Borde de input `border-tinta/30` vs card (1.4.11) | `#5C5850` | 2.52:1 | `#7A7060` | 3.66:1 |
| Borde textarea `border-gris-claro` vs card (1.4.11) | `#2C2418` | 1.16:1 | `#7A7060` | 3.66:1 |
| Foco de input (oro vs subrayado tinta/30) | | 3.85:1 | sin cambio + outline (ver #10) | — |

OK y sin cambios: `text-gris` en sidebar 5.45:1; `text-oro` sobre card 9.69:1; `text-papel` sobre `bg-oro` 10.24:1; `text-oro-hondo` sobre papel 6.21:1 (links de soporte/eliminar-cuenta); `text-tinta/50` 4.73–4.76:1; `/60` 6.26:1.

---

### S3 — Páginas públicas: la privacidad omite a AWS (rostro) y a Mercado Pago (tarjetas), y "Eliminar cuenta" promete algo que la base no hace

**Dónde:** `web/app/privacidad/page.tsx:47-56` (datos), `:78-88` (proveedores), `:99-111` (contacto sin canal), `:28-32` (banner BORRADOR); `web/app/eliminar-cuenta/page.tsx:44-58`. Evidencia: `supabase/functions/admin-socios/index.ts:8,17,212-271` (AWS Rekognition `DetectFaces`) llamado desde la app del socio al subir su foto (`app/hooks/useSobre.ts:197`); `supabase/functions/socios-pagos/index.ts:861-1043` (tokenización de tarjeta y `customers/cards` de Mercado Pago, usado desde `web/app/(secretaria)/secretaria/socios/page.tsx`); cascadas en `20260601000000_socios_schema.sql:86,128,152`.
**Rompe:** Nielsen #2 Relación con el mundo real (lo que dice la política tiene que ser lo que pasa). Sale del marco WCAG: es exposición frente a la revisión de las stores (App Store 5.1.1/5.1.2, Google Play User Data policy y Data safety) y a la Ley 25.326.
**Por qué:**
1. Cada foto de perfil de un socio, menores incluidos, se manda a **AWS Rekognition** para detectar un rostro. La política lista solo Supabase, Expo y Resend. Ese es exactamente el tipo de proveedor que un revisor busca.
2. Secretaría asocia **tarjetas** a Mercado Pago para el débito (`associate-card`, `charge-card`). La política no menciona datos de pago con tarjeta ni a Mercado Pago.
3. Las secciones 7 y 8 dicen "contactate con Secretaría" sin email ni WhatsApp. Google Play exige un contacto en la política; el que está en `/soporte` no se linkea.
4. "Qué se conserva: los registros de cuotas y pagos… de forma disociada" es falso respecto del modelo de datos: borrar el perfil borra en cascada `socios`, `cuotas` y `pagos_socios`. No existe ningún proceso de "disociar".
5. El banner "BORRADOR — pendiente de revisión" en la URL que figura en la ficha de las stores le dice al revisor que la política no está vigente.

**Fix (copy, OTA web):**
- `privacidad:83-87` agregar: `<li>Amazon Web Services (Rekognition) — verificación automática de que la foto de carnet muestra un rostro. No se usa para reconocerte ni se guarda en AWS.</li>` (confirmar el "no se guarda" con la doc de `DetectFaces`) y `<li>Mercado Pago — procesamiento de pagos y, si lo pedís en Secretaría, la tarjeta adherida al débito automático. El Club no guarda los datos de la tarjeta.</li>`.
- `privacidad:52` agregar "tarjeta adherida al débito (la guarda Mercado Pago)"; `:50` "foto de carnet (verificada automáticamente)".
- `privacidad:106-110` poner el mail y el WhatsApp de `/soporte` y un link a `/eliminar-cuenta`.
- `eliminar-cuenta:52-58` decir la verdad operativa o cambiar el proceso: **[decision]** (ver tarea).
- Banner BORRADOR: **[decision]** sacarlo de la página pública o publicar la revisión legal.

---

### S3 — Formularios y modales sin semántica: labels sueltos, foco invisible, errores mudos, modales sin Escape

**Dónde:**
- Labels sin `htmlFor`/`id` en **todos** los formularios: `login/page.tsx:81,96`, `divisiones/page.tsx:290-419` (8 campos), `noticias:246,258,269`, `promos:186,197,208`, `usuarios:521,567,585,603,638,650,668,686`.
- Foco invisible: `usuarios/page.tsx:278` `<select … outline-none>` sin ningún estilo de foco. El resto de los inputs solo cambia el color de un subrayado de 1px (`outline-none focus:border-oro`).
- Errores sin `role="alert"`: `login:120`, `noticias:196,297`, `promos:236`, `divisiones:425`, `usuarios:541,611,694`.
- Botones-toggle sin estado: pills de división (`usuarios:65-73`), disciplina (`:297-305`, `:587-596`, `:670-680`), rol (`:569-578`, `:652-661`); tabs de Informes (`informes:184-196`) y del modal (`usuarios:492-504`) sin `role="tab"`/`aria-selected`; links activos del sidebar sin `aria-current` (`Sidebar.tsx:48-59`).
- Modales: `noticias:236-241`, `promos:176-181`, `usuarios:481-486`. Sin `role="dialog"`/`aria-modal`, sin Escape, sin mover el foco adentro ni devolverlo, el Tab se escapa al contenido de atrás, y el `×` no tiene nombre accesible.
**Rompe:** WCAG 2.2 SC 1.3.1 Info y relaciones (A) · SC 4.1.2 Nombre, función, valor (A) · SC 2.4.7 Foco visible (AA) · SC 4.1.3 Mensajes de estado (AA) · SC 2.4.3 Orden del foco (A) · Nielsen #3 (Escape)
**Por qué:** un lector de pantalla anuncia "campo de texto" sin nombre en el login. Las pills seleccionadas solo se distinguen por color (`bg-oro/20` vs card = 1.53:1; el borde oro sí da 8.33:1). En los modales, el usuario de teclado sigue tabulando por la página de atrás.

**Fix:**
```tsx
// patrón para cada campo
<label htmlFor="noticia-titulo" className={labelClass}>TÍTULO</label>
<input id="noticia-titulo" … className="… outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oro" />
// errores
{formError && <p role="alert" className="font-lora text-rojo-texto text-sm">{formError}</p>}
// toggles
<button type="button" aria-pressed={sel} …>
// sidebar
<Link aria-current={active ? 'page' : undefined} …>
```
Global en `globals.css`: `:focus-visible { outline: 2px solid var(--color-oro); outline-offset: 2px; }` (oro sobre card 9.69:1). Modales: usar `<dialog>` nativo, que da Escape, foco atrapado y `::backdrop`:
```tsx
const ref = useRef<HTMLDialogElement>(null)
useEffect(() => { if (showModal) ref.current?.showModal(); else ref.current?.close() }, [showModal])
<dialog ref={ref} onClose={closeModal} aria-labelledby="titulo-modal" className="bg-card w-full max-w-xl p-8 backdrop:bg-dark/70">
  <h2 id="titulo-modal" …>NUEVA NOTICIA</h2>
  <button type="button" onClick={closeModal} aria-label="Cerrar" className="min-h-11 min-w-11">×</button>
```

---

### S2 — "Turnos" en la sidebar de Subcomisión te saca de tu panel sin camino de vuelta

**Dónde:** `web/components/Sidebar.tsx:13` → `web/app/(porteria)/layout.tsx:29,52` (acepta `subcomision` y renderiza `SidebarLector`, que dice "GIMNASIO" y solo tiene Accesos/Turnos)
**Rompe:** Nielsen #3 Control y libertad · Nielsen #4 Consistencia (la navegación cambia de lugar entre secciones)
**Por qué:** la subco hace clic en Turnos y le cambia la sidebar entera, con otro título de rol y sin Portada, Usuarios ni Noticias. Solo vuelve con el botón atrás o tipeando la URL.

**Fix:** en `(porteria)/layout.tsx`, elegir la sidebar según el rol: `{['subcomision','admin'].includes(profile.rol) ? <Sidebar nombre=… rol=… /> : <SidebarLector … />}`. Si no, marcar el link como externo al panel ("TURNOS ↗") y agregar "← VOLVER AL PANEL" en `SidebarLector` cuando el rol no es `porteria`.

## Patrones oscuros

### S3 — Obstrucción asimétrica en la baja de cuenta (no intencional)

**Dónde:** `app/components/shared/SobreScreen.tsx:18-40` (el botón abre la web) → `web/app/eliminar-cuenta/page.tsx:33-42` (mandar un mail con nombre y DNI).
**Por qué:** la cuenta se crea dentro de la app en un flujo (`(auth)/registro.tsx`, registro de tutor). Darla de baja exige salir de la app, escribir un mail desde la casilla registrada (los menores y los tutores vinculados tienen mail **sintético**: no tienen desde dónde escribir) y esperar hasta 30 días. Es el patrón "fácil entrar, difícil salir". La intención es la contraria (el club quiere confirmar la baja como socio), pero el efecto es este. Además, la propia nota de T11 dice que Apple rechaza los flujos "solo escribinos". El flujo in-app ya está construido (`solicitudes_baja`, `useSolicitudBaja`, `SolicitudesBaja.tsx` en Secretaría) y quedó apagado.
**Fix:** **[decision]** volver a encender el flujo in-app de T11 (la página pública queda como alternativa para quien no tiene la app). Si se mantiene el mail: agregar a `eliminar-cuenta` una vía para quien tiene mail sintético ("o por WhatsApp al +54 9 249 452-2888") y el paso en la app ("Mi perfil › Cuenta › Solicitar baja").

## Lo que está bien

- **Noticias de Subcomisión maneja bien los errores de escritura**: borra la imagen huérfana si falla el insert (`noticias:161`), detecta el borrado de 0 filas por RLS (`:110-113`) y separa "se publicó pero no salió el push" (`:174`). Es el modelo a copiar en promos.
- **Divisiones previene errores de edad en vivo**: valida "ambas o ninguna" y desde ≤ hasta (`divisiones:121-133`), muestra "Nacidos 2016–2017 en 2026" mientras escribís (`:203-207`, cálculo correcto: año − edad), y no pierde una división siguiente inactiva ya guardada (`:190-191`). Eso es Nielsen #5 y #6 bien resueltos.
- **Login**: `autoComplete="email"`/`"current-password"`, permite pegar y gestores de contraseña (SC 3.3.8 OK), botón deshabilitado con "INGRESANDO…" mientras está en vuelo (sin doble submit), y el mensaje de credenciales no revela cuál de los dos campos falló.
- **Páginas públicas**: estáticas, `<main>` + un `<h1>` + `<h2>` en orden, `lang="es"`, `metadata` propia, links subrayados (no solo color, SC 1.4.1), reflow correcto a 320px. `soporte` tiene mail y WhatsApp clickeables.
- **Acciones destructivas con confirmación**: eliminar noticia, promo y usuario piden `confirm` (el problema de #1 es lo que *no* dice, no la ausencia).

## No pude verificar

- **Renderizado real** a 320px, foco con Tab y lector de pantalla: no levanté el panel (necesita env de Supabase). Todo lo de teclado y reflow sale del código.
- **Cuántas filas tiene hoy `asistencias`/`cobranzas` en producción** (#3): sé que el tope es 1000 (`config.toml:18`, y es el default de Supabase hosted), no si ya se pasó. `select count(*) from asistencias;` lo confirma.
- **Si `AWS_ACCESS_KEY_ID` está seteada en producción** (`admin-socios:251`): si no está, la función no llama a AWS y la omisión en la política pesa menos (aun así, el código está deployado).
- **Si la RLS de `profiles` deja a Subcomisión hacer el `update({ rol, roles })`** que propongo en #5: el guard (`20260914000000:79-85`) se lo permite, pero no vi la policy de UPDATE de `profiles` para subcomisión.
- **Estado del review de Apple de la 1.0.9** respecto de la baja por mail (patrón oscuro): si ya fue aprobada con este flujo, el riesgo inmediato es menor.
- Dejé afuera (S2, por el tope de 12): el guard del layout desloguea ante cualquier error de red (`(subcomision)/layout.tsx:26-35`, `(buffet)/layout.tsx:23-32`); el login dice "No tenés acceso" cuando en realidad falló la lectura del perfil (`login:28-46`); "Ya puede ingresar con su email y DNI" al asignar un rol a un socio existente es falso si el socio ya cambió su contraseña, o si tiene mail sintético (`usuarios:513`); no hay "olvidé mi contraseña" en el login web; EDITAR en Divisiones no lleva al formulario (a < lg queda debajo de toda la lista, `divisiones:233`); DESACTIVAR división sin confirmación y con error tragado (`divisiones:81-90`); la Portada usa el mismo borde oro para "asistencia ≥70 %" (bueno) y para "hay lesiones" (malo) (`dashboard:90,102`).

---

# Pasada 2 — impeccable audit (web)

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1 | Sin `:focus-visible` en todo el alcance (0 ocurrencias), file inputs inalcanzables, contraste AA roto en 66 textos (= auditor-ux #2, #9, #11) |
| 2 | Performance | 2 | Informes trae tablas enteras al cliente y cruza O(jugadores × asistencias) en cada render; miniaturas de 64px bajan la imagen original |
| 3 | Responsive Design | 1 | Panel desktop-only: sidebar fija de 224px sin breakpoint (= auditor-ux #8); las públicas están bien |
| 4 | Theming | 2 | Tokens en `@theme`, pero hex duplicados inline en las sidebars y el body, jerarquía de texto por opacidad, nombres de fuente que mienten |
| 5 | Implementation Integrity | 2 | 4 sidebars casi idénticas, `callEdgeFunction` duplicada, `as any`, italic sintética; detector sin cobertura TSX |
| **Total** | | **8/20** | **Poor** |

### Implementation Integrity Verdict

**Falla.** El sistema visual es propio y coherente: paleta crema/oro sobre marrón rayado, mayúsculas espaciadas, Barlow. No es una plantilla. Pero la implementación se copió en vez de factorizarse: la misma sidebar ×4 con el hex de los tokens pegado inline, el mismo modal ×3 sin componente, el mismo helper de Edge Function ×2. Y los nombres de tokens no dicen lo que son (`font-playfair` es Barlow). El detector (`impeccable detect --json`) devolvió `[]` hasta sobre archivos con `outline-none` y `hidden` evidentes, así que no cuenta como evidencia de limpieza.

### Executive Summary
- Audit Health Score: **8/20** (Poor)
- Hallazgos nuevos de esta pasada: P0: 0 · P1: 1 · P2: 4 · P3: 2 (los de accesibilidad y responsive ya están en la pasada 1)
- Top: (1) panel inusable en mobile y sin foco visible (= auditor-ux); (2) los títulos de página son todos iguales; (3) Informes escala mal; (4) duplicación que multiplica cada fix por 4.
- Próximos pasos: tokens semánticos + `:focus-visible` global, un `PanelSidebar` responsive y un `Modal` sobre `<dialog>`; recién después, el resto.

## Detailed Findings by Severity

- **= auditor-ux #2, #9, #11** (teclado, contraste, semántica/foco/modales) → Accessibility. **= auditor-ux #8** (reflow) → Responsive.

**[P1] Todas las páginas del panel tienen el mismo `<title>`**
- **Location:** `web/app/layout.tsx:17-20` (`'Uncas Rugby — Panel'`). Ninguna página de `(subcomision)`, `(buffet)` ni `login` define el suyo (son `'use client'`, no pueden exportar `metadata`).
- **Category:** Accessibility
- **Impact:** con varias pestañas abiertas (Noticias + Usuarios + Informes), el historial y el lector de pantalla no distinguen nada. Un revisor que abre `/login` ve "Panel".
- **WCAG/Standard:** SC 2.4.2 Page Titled (A)
- **Recommendation:** `export const metadata = { title: 'Noticias — Subcomisión · Uncas' }` en un `layout.tsx` de servidor por ruta (p. ej. `web/app/(subcomision)/noticias/layout.tsx`), o `title: { template: '%s · Uncas', default: 'Uncas Rugby — Panel' }` en el root más un layout por sección.
- **Suggested command:** /impeccable harden

**[P2] Informes: tablas enteras al cliente y cruces cuadráticos en el render**
- **Location:** `web/app/(subcomision)/informes/page.tsx:74-91` (`asistencias.filter` dentro de `jugadores.map`, y `asistencias.find` × 4 por jugador), `:83` (sort de todos los eventos por jugador), `:98-106`, `:299`.
- **Category:** Performance
- **Impact:** con 600 jugadores × 5000 asistencias son ~3M comparaciones cada vez que cambia el filtro, con la UI congelada en máquinas modestas. Y una vez paginado (auditor-ux #3), el volumen crece.
- **Recommendation:** índices `Map` precomputados (ver el fix de auditor-ux #4), sort una sola vez fuera del map. A mediano plazo, un RPC `informe_asistencia(p_division uuid)` que devuelva presentes/total/flag por jugador en SQL.
- **Suggested command:** /impeccable optimize

**[P2] Miniaturas de 64px que bajan la imagen original, sin lazy loading**
- **Location:** `web/app/(subcomision)/noticias/page.tsx:212-215` (hasta 100), `web/app/(buffet)/buffet/promos/page.tsx:155-158`; subida sin redimensionar ni límite de tamaño (`noticias:143-151`, `promos:88-96`).
- **Category:** Performance
- **Impact:** una foto de celular de 4–8 MB por fila. Sube el consumo de egress del plan Free de Supabase y el tiempo de carga, y lo mismo pega en el feed de la app del socio.
- **Recommendation:** `<img loading="lazy" decoding="async" width={64} height={64} …>`. Redimensionar antes de subir (canvas → `toBlob('image/jpeg', 0.82)`, lado máximo 1600px) y rechazar más de 10 MB con mensaje. Las image transformations de Supabase no están disponibles en Free.
- **Suggested command:** /impeccable optimize

**[P2] Sidebar ×4 y modal ×3 copiados, con los hex de los tokens pegados inline**
- **Location:** `web/components/Sidebar.tsx:31`, `SidebarBuffet.tsx:25`, `SidebarLector.tsx:26` (+ `SidebarSecretaria.tsx`, fuera de alcance) — `style={{ backgroundColor: '#0B0905', borderColor: '#2C2418' }}` = `--color-dark` / `--color-gris-claro`; `globals.css:19-26` repite `#15110A`/`#191309`/`#F3EFE4` fuera de los tokens; modales en `noticias:236`, `promos:176`, `usuarios:481`.
- **Category:** Theming / Implementation Integrity
- **Impact:** cada fix de esta auditoría (responsive, `aria-current`, foco, `<dialog>`) hay que aplicarlo 3 o 4 veces, y una se va a olvidar. Hay deriva visible: `Sidebar.tsx` muestra el rol y las otras no.
- **Recommendation:** `web/components/PanelSidebar.tsx` con props `{ subtitulo, nav, nombre, rol? }` y `className="bg-dark border-gris-claro"`; `web/components/Modal.tsx` sobre `<dialog>`. En `globals.css`, `--color-papel-2: #191309` y `background: repeating-linear-gradient(135deg, var(--color-papel) 0 17px, var(--color-papel-2) 17px 34px)`.
- **Suggested command:** /impeccable extract

**[P2] Guard de auth duplicado y frágil: un error de red desloguea**
- **Location:** `web/app/(subcomision)/layout.tsx:18-43`, `web/app/(buffet)/layout.tsx:18-40` (mismo código); la lectura de `profiles` ignora `error`, y `!data` → `signOut()`.
- **Category:** Implementation Integrity
- **Impact:** un timeout de Supabase (plan Free, que se pausa) manda a la subco al login sin explicar nada y le borra la sesión. Encima la pantalla "CARGANDO…" aparece en cada recarga.
- **Recommendation:** hook `useRolGuard(rolesPermitidos)` compartido. Si `error`, mostrar "No se pudo verificar tu sesión. Reintentar" sin `signOut`; solo cerrar sesión si `data` llegó y el rol no corresponde.
- **Suggested command:** /impeccable harden

**[P3] `font-playfair italic` es una itálica sintética de Barlow**
- **Location:** `web/app/layout.tsx:5-15` (Barlow cargada solo `style: normal`), `globals.css:15-16` (`--font-playfair: Barlow`, `--font-lora: Barlow Semi`); todos los `<h1 className="font-playfair italic …">`.
- **Category:** Implementation Integrity
- **Impact:** el navegador inclina los glifos rectos (falsa oblicua), y se nota en los `text-4xl`/`5xl`. Los nombres de token engañan a quien edite después ("Playfair" y "Lora" ya no existen).
- **Recommendation:** `Barlow({ …, style: ['normal', 'italic'], weight: ['400','600','700','900'] })` (sacar `800` si no se usa), y renombrar los tokens a `--font-display` / `--font-texto` con un replace global.
- **Suggested command:** /impeccable typeset

**[P3] Helpers duplicados y tipos evadidos**
- **Location:** `web/app/(subcomision)/usuarios/page.tsx:93-108` (copia de `web/lib/edgeFunction.ts`), `web/app/(buffet)/buffet/promos/page.tsx:34-35` (`(supabase as any)` + `eslint-disable`), BOM (`U+FEFF`) antes de `'use client'` en `dashboard/page.tsx:1` e `informes/page.tsx:1`.
- **Category:** Implementation Integrity
- **Recommendation:** importar `callEdgeFunction` de `@/lib/edgeFunction`; tipar el cliente con `Database` (el web no importa `app/lib/database.types.ts`: copiar o generar con `supabase gen types`); guardar los dos archivos como UTF-8 sin BOM.
- **Suggested command:** /impeccable polish

## Patterns & Systemic Issues

- `outline-none` en 27 lugares y **0** `focus-visible` en todo el alcance. El foco depende de un subrayado de 1px.
- Jerarquía de texto por opacidad (`tinta/30…/60`) en vez de tokens: por eso el contraste falla parejo.
- Errores de Supabase tragados en 11 lecturas y 4 escrituras (dashboard, informes, divisiones, usuarios, promos): la lección #2 del socio, intacta en el web.
- Targets por debajo de 44px en el panel, que va a usarse en touch cuando sea responsive: `×` de modales ~20px, links EDITAR sin padding (`usuarios:288,345`), pills 28px, botones de Divisiones ~26px. Cumplen el mínimo AA de 24px (o su excepción por espaciado), pero no el de 44.

## Positive Findings

- Identidad visual propia y consistente en todas las pantallas (lo que le falta es factorizarla, no rediseñarla).
- Páginas públicas como Server Components con `metadata`: livianas, sin JS de cliente, indexables.
- `selectAllRows` y `callEdgeFunction` ya existen en `web/lib/`: el patrón correcto está, falta usarlo.
- Lógica de payload extraída y espejada con la app (`web/lib/noticiaSubcomision.ts`) con un check ejecutable.
- `next/font` con `variable` y subsets: sin FOIT ni requests a Google en runtime.

## Recommended Actions

1. **[P1] `/impeccable harden`**: títulos por página, guard de auth sin logout por error de red, manejo de `error` en todas las lecturas.
2. **[P1] `/impeccable adapt`**: `PanelSidebar` off-canvas debajo de `lg`, headers con wrap, grillas a 1 columna en mobile.
3. **[P1] `/impeccable colorize`**: tokens `rojo-texto`, `texto-2` y `borde-control`, y reemplazo de las opacidades.
4. **[P2] `/impeccable extract`**: `PanelSidebar` y `Modal` sobre `<dialog>`.
5. **[P2] `/impeccable optimize`**: Informes con índices/RPC; imágenes lazy y redimensionadas al subir.
6. **[P3] `/impeccable typeset`**: itálica real y renombre de los tokens de fuente.
7. **[P3] `/impeccable polish`**: helpers duplicados, `as any`, BOM.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.

---

## Compartido

- **`supabase/functions/admin-usuarios` `delete`** (auditor-ux #1): la app mobile usa la misma acción, `app/hooks/useUsuarios.ts:389-390` (pantalla de usuarios del admin/subcomisión, `UsuariosScreen`). El fix de backend cubre las dos; el área mobile de Usuarios no debería reportarlo de nuevo, pero sí ajustar su botón.
- **`web/app/globals.css` (tokens)**: el contraste de #9 y el `:focus-visible` global afectan también a `(secretaria)` y `(porteria)`. El área web-secretaría no debería re-medir `tinta/40` ni `rojo`.
- **`web/components/SidebarSecretaria.tsx`**: misma sidebar fija sin breakpoint y con hex inline (fuera de mi alcance, mismo fix que #8 y P2 "Sidebar ×4").
- **`web/app/(porteria)/layout.tsx:29,52`**: acepta `subcomision` y renderiza `SidebarLector` (auditor-ux #12); el fix vive en el área de portería.
- **Pocos web**: los modales de `(secretaria)` probablemente repiten el patrón sin `<dialog>`. No los leí.

## Fuera de alcance pero grave

1. **Subcomisión puede borrar cuentas (con su socio) sin ser admin.** `admin-usuarios/index.ts:41` deja pasar a `subcomision` en todas las acciones, incluidas `delete` y `deactivate` (ban de 100 años) de cualquier perfil no-admin. La UI solo le muestra staff, pero la función acepta cualquier `userId`: una cuenta de subco puede banear o borrar a un socio común por API. Fix: en `delete` y `deactivate`, exigir `callerRol === 'admin'`, o verificar que el `userId` destino tenga un rol de `ROLES_POR_CALLER[callerRol]` en `roles[]`.
2. **Cascada destructiva en el modelo**: `profiles → socios → cuotas/pagos_socios/accesos/turnos` es todo `ON DELETE CASCADE` (`20260506000000:51`, `20260601000000:86,114,128,152`). Cualquier borrado de usuario en Auth, incluido el botón "Delete user" del Dashboard de Supabase que Secretaría podría usar para "procesar" una baja pedida por mail, borra el historial contable que `eliminar-cuenta` dice conservar. Fix de backend: `socios.profile_id ... ON DELETE SET NULL` (columna nullable) o un trigger `BEFORE DELETE ON profiles` que rechace si existe un socio.
3. **Fotos de menores procesadas por un tercero no declarado** (AWS Rekognition, ver auditor-ux #10). Lo repito acá porque no es solo UX: es tratamiento de datos de menores (Ley 25.326, Play Families si aplica).

## Tareas sugeridas

- [ ] T1 — **Block account deletion for members and non-admins** (S4 / P0). `web/app/(subcomision)/usuarios/page.tsx:189-194,352` → `admin-usuarios/index.ts:245-253` deletes the auth user, which cascades to `socios`, `cuotas` and `pagos_socios` (`20260506000000:51`, `20260601000000:86,128,152`). Fix: `handleEliminar` returns 409 if a `socios` row exists for `userId` and 403 if `callerRol !== 'admin'`; add a `remove-role` action (drop the staff role from `roles[]`, set `rol='socio'`); the web shows ELIMINAR only for `isAdmin && !roles.includes('socio')`, otherwise "QUITAR ROL DE STAFF", placed away from DESACTIVAR. Same guard for `deactivate` (target must hold a role the caller can manage). Mobile `useUsuarios.ts:389` gets the same button change. [backend: function] + [OTA]
- [ ] T2 — **Keyboard-reachable image picker** (S4 / P1). `noticias/page.tsx:290`, `promos/page.tsx:229` use `className="hidden"` on the file input. Fix: `sr-only` + `focus-within:outline-2 focus-within:outline-oro` on the label. [OTA]
- [ ] T3 — **Informes/Portada: paginate past 1000 rows and surface errors** (S3 / P1). `informes/page.tsx:43-50`, `dashboard/page.tsx:30-53` read whole tables (PostgREST `max_rows=1000`) and ignore `error`. Fix: `selectAllRows` from `web/lib/supabase.ts` for asistencias, jugadores, eventos, fichajes, resultados, cobranzas; error state with "Reintentar"; ideally an RPC `resumen_dashboard()` for the 5 numbers. [OTA] (RPC: [backend: migration])
- [ ] T4 — **Fix the "4 AUS." flag** (S3 / P1). `informes/page.tsx:82-88` takes the 4 latest events club-wide including future ones, so it never fires. Fix: per-player past events of `jugador.division_id` (`fecha <= today`), lookup via a `Map`; extract to `web/lib/informesAsistencia.ts` + `.check.ts` (future event, other division, 4 real absences). [OTA]
- [ ] T5 — **Usuarios: write `roles[]`, check errors, list by `roles`, show `activo`** (S3 / P1). `usuarios/page.tsx:164-179` ignores errors and only writes `rol`; `:122-127` filters by active `rol`, so staff in "vista socio" disappear; `activo` is never selected (`:123`), so both DESACTIVAR and REACTIVAR show. Fix: select `roles, activo`, `.overlaps('roles', ROLES_*)`; `saveRol` replaces the old staff role in `roles[]`; error → `role="status"` aviso; one toggle button + "DESACTIVADO" chip. Verify the `profiles` UPDATE policy for subcomisión. [OTA]
- [ ] T6 — **Divisiones: prevent divisions the auto-assignment ignores** (S3 / P1). The form defaults RAMA to "—" and allows Mixto/duplicate RECIBE ADULTOS (`divisiones/page.tsx:378-423`), but `_destino_division_por_servicio` (`20261014000000:205-280`) only matches `rama = damas|caballeros` and returns `adultos_ambiguo` on duplicates. Fix: client validation (duplicate recibe_adultos per deporte+rama, mixto), hint under RAMA when empty; unique partial index `on divisiones (deporte, rama) where activa and recibe_adultos`. [OTA] + [backend: migration] + [decision: should a division with no rama match members of any sex?]
- [ ] T7 — **Noticias/Promos: own items by default, show author and draft state, handle errors** (S3 / P1). `noticias/page.tsx:47-52` lists and lets delete every club noticia (Secretaría, Buffet, other sports, drafts), the counter counts drafts; `promos/page.tsx:35-38` shows everything to admin and swallows errors (`:35-52`, `:72`). Fix: `.eq('autor_id', uid)` with a read-only "VER TODAS" toggle, author + BORRADOR/CUERPO TÉCNICO chips, `promos` error handling copied from `noticias:54-58,108-114`. [OTA]
- [ ] T8 — **Responsive panel shell** (S3 / P1). `(subcomision)/layout.tsx:56`, `(buffet)/layout.tsx:53`, `Sidebar*.tsx` fixed `w-56` + `ml-56` leave 32px of content at 320px. Fix: single `PanelSidebar` off-canvas below `lg` (MENÚ button 44px, `aria-expanded`, close on route change/Escape), `lg:ml-56 p-4 sm:p-8`, `flex-wrap` on page headers, `grid-cols-1 sm:grid-cols-2` in Usuarios. Also apply to `SidebarSecretaria`. [OTA]
- [ ] T9 — **Semantic color tokens for AA contrast** (S3 / P1). 62× `text-tinta/40` (3.47:1), 4× `/30` (2.52:1), all error text `text-rojo` (3.69:1), `text-rojo/60` (2.11:1), destructive hover/badge (3.90:1), input borders (2.52:1). Fix: `--color-rojo-texto:#E5634A` (= app `rojoTexto`), `--color-texto-2:#9D998F`, `--color-borde-control:#7A7060` in `globals.css`, then replace (see contrast table). Add a web `contraste.check.ts` like the app's. [OTA]
- [ ] T10 — **Public pages match what the app does** (S3 / P1). `privacidad/page.tsx:47-88` omits AWS Rekognition (`admin-socios:212-271`, called on every member photo upload from `useSobre.ts:197`) and Mercado Pago card storage (`socios-pagos:861-1043`); `:99-111` has no contact channel; `eliminar-cuenta/page.tsx:52-58` promises payment records are kept "disociados", but the FKs cascade. Fix: add both processors and card data, add email/WhatsApp + link to `/eliminar-cuenta`, rewrite "Qué se conserva" to match the real process. [OTA] + [decision: remove the public "BORRADOR" banner now, or wait for the lawyer?] + [decision: until T1/backend fix #2, what does Secretaría actually do on a deletion request — delete in Auth (wipes cuotas) or deactivate?]
- [ ] T11 — **Form labels, visible focus, live errors, accessible modals** (S3 / P1). Labels without `htmlFor` in every form (login, divisiones, noticias, promos, usuarios); `usuarios:278` select with `outline-none` and no focus style; errors without `role="alert"`; toggles without `aria-pressed`; tabs without `role="tab"`; sidebar without `aria-current`; modals (`noticias:236`, `promos:176`, `usuarios:481`) with no dialog role, no Escape, no focus management, unnamed `×`. Fix: id/htmlFor pairs, global `:focus-visible { outline:2px solid var(--color-oro); outline-offset:2px }`, `role="alert"`, `aria-pressed`, `aria-current="page"`, shared `Modal` on native `<dialog>` with `aria-labelledby` and `aria-label="Cerrar"` (44×44). [OTA]
- [ ] T12 — **Account deletion parity (dark-pattern risk)** (S3 / P1). Deletion is "email us from your registered address" (`eliminar-cuenta:33-42`, opened from `SobreScreen.tsx:26-40`); minors and tutor-linked accounts have synthetic emails, and T11 itself notes Apple rejects email-only flows. Fix: re-enable the built in-app `solicitudes_baja` flow (page stays as fallback), or at least add WhatsApp and the in-app path to the page. [decision: re-enable the in-app request?] + [native build/OTA depending on choice]
- [ ] T13 — **Per-page titles** (P1). `web/app/layout.tsx:17-20` gives every panel page the same title (SC 2.4.2). Fix: `title.template` + a server `layout.tsx` per route with its own `metadata`. [OTA]
- [ ] T14 — **Auth guard that does not log out on network errors** (P2). `(subcomision)/layout.tsx:26-36`, `(buffet)/layout.tsx:23-33`. Fix: shared `useRolGuard`; on `error` show retry, `signOut` only on a confirmed wrong role. [OTA]
- [ ] T15 — **Informes performance** (P2). `informes/page.tsx:74-91` O(players × attendance) per render. Fix: precomputed Maps (with T4), later an RPC `informe_asistencia`. [OTA]
- [ ] T16 — **Lazy, resized news images** (P2). `noticias:212`, `promos:155` load originals as 64px thumbs; uploads not resized (`noticias:143`, `promos:88`). Fix: `loading="lazy" width/height`, client resize to 1600px JPEG 0.82, 10 MB limit with message. [OTA]
- [ ] T17 — **Extract PanelSidebar + Modal, drop inline hex** (P2). `Sidebar.tsx:31`, `SidebarBuffet.tsx:25`, `SidebarLector.tsx:26`, `globals.css:19-26`. Do together with T8/T11. [OTA]
- [ ] T18 — **Subcomisión "Turnos" keeps its own sidebar** (S2 / P2). `Sidebar.tsx:13` → `(porteria)/layout.tsx:52` swaps to `SidebarLector`. Fix: render `Sidebar` for subcomision/admin in the porteria layout. [OTA]
