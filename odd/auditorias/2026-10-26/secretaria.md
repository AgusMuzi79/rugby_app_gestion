# Auditoría — secretaria

**Repo:** `/home/claude/agusmuzi79/rugby_app_gestion` @ `5a0ce4c` (read-only). Fecha: 2026-10-26.

**Alcance exacto (leído completo salvo donde se indica):**

| Archivo | Líneas |
|---|---|
| `web/app/(secretaria)/layout.tsx` | 56 |
| `web/app/(secretaria)/secretaria/socios/page.tsx` | 926 |
| `web/app/(secretaria)/secretaria/socios-import/page.tsx` | 316 |
| `web/app/(secretaria)/secretaria/socios-import/seccion-servicios.tsx` | 552 |
| `web/app/(secretaria)/secretaria/deuda/page.tsx` | 345 |
| `web/app/(secretaria)/secretaria/deudas/page.tsx` | 380 |
| `web/app/(secretaria)/secretaria/comprobantes/page.tsx` | 279 |
| `web/app/(secretaria)/secretaria/debito-automatico/page.tsx` | 194 |
| `web/app/(secretaria)/secretaria/categorias/page.tsx` | 211 |
| `web/app/(secretaria)/secretaria/servicios/page.tsx` | 217 |
| `web/app/(secretaria)/secretaria/noticias/page.tsx` | 283 |
| `web/components/SidebarSecretaria.tsx` | 86 |
| `web/components/secretaria/SolicitudesBaja.tsx` | 111 |
| `web/components/ListaColapsable.tsx` | 33 |
| **Web total** | **3.989** |
| `app/app/(secretaria)/_layout.tsx`, `sobre.tsx`, `diario.tsx`, `socios.tsx`, `noticias.tsx` | 26 + 1 + 211 + 1.121 + 394 = **1.753** |
| `app/hooks/useSociosSecretaria.ts` (308, leído 1–160 y 230–280), `useDiarioSecretaria.ts` (completo), `useNoticias.ts` (25–40, 110–136), `constants/theme.ts`, `constants/tabOptions.ts` | parcial |
| `supabase/functions/importar-socios/index.ts` (120–394 + grep de bajas/mails), `importar-deuda/index.ts` (168, completo), `admin-socios/index.ts` (72–180), `socios-pagos/index.ts` (40–80, 583–660, 913–1160), `importar-servicios` (grep de catálogo) | parcial |
| `supabase/migrations/20261011000000_deuda_debito_antes_del_22.sql` (RPC `importar_deuda_nuvix`, 43–190), `20260609000000_servicios_opcionales.sql:19` | parcial |

`app/components/shared/UsuariosScreen.tsx` **no está en el alcance real**: Secretaría no lo usa (sólo `(subcomision)/usuarios.tsx` y `(admin)/usuarios.tsx`). No lo audité.

Contexto leído: `CLAUDE.md`, `.claude/context/estado-web.md`, `reglas-negocio.md`, skills `auditor-ux` (SKILL + 4 refs), `club-app-context`, `impeccable/reference/{audit,audit.native,ios,android}.md`.

---

# Pasada 1 — auditor-ux

## Veredicto

Audité por código el panel web de Secretaría (las 10 pantallas, sidebar y componentes), las 3 pantallas mobile del rol y lo que las Edge Functions de import le muestran a la secretaria. El importador de **servicios** está muy bien resuelto. El resto **no sale así**. Hay tres caminos que pierden datos o dejan afuera a socios reales sin que la secretaria pueda darse cuenta: el alta manual se borra sola en el próximo import del padrón, eliminar un servicio del catálogo le saca ese servicio a todos los socios en cascada, y la vista previa de bajas del padrón muestra "—" en vez del nombre. Además, el caso más común (un socio pregunta por WhatsApp "¿ya figura mi pago?") pide 4 clicks y escribir el nombre dos veces, y si el socio no está en rojo la búsqueda devuelve "SIN RESULTADOS" aunque exista.

**S4:** 3 · **S3:** 9 · **S2:** 4 (afuera por el tope de 12, listados al final) · **S1:** 0

**Conteo de clicks del caso dominante** (hecho desde código, no medido en vivo):
- *Rutina diaria de imports* (deuda → padrón → servicios, en dos páginas): Importar Deuda (1) · elegir archivo (2) · diálogo del SO (3) · IMPORTAR (4) · Importar Socios (5) · elegir archivo (6) · diálogo (7) · CALCULAR (8) · CONFIRMAR (9) · elegir archivo de servicios (10) · diálogo (11) · CALCULAR (12) · CONFIRMAR (13). **13 clicks y 3 diálogos de archivo.** Para algo que se hace todos los días es aceptable. El problema real es el #5: el primer import es el único que no tiene vista previa.
- *"¿Ya figura mi pago?"*: Socios (1) · escribir · click en la fila (2) · el detalle no muestra deuda → Deudas (3) · el filtro arranca en ROJO → TODOS (4) · escribir el nombre de nuevo · leer. **4 clicks y 2 búsquedas.** Con los fixes #7 queda en 2 clicks y 1 búsqueda.

> Es una sola pasada heurística sobre código. Según Nielsen, un evaluador solo encuentra cerca del 35 % de los problemas. No reemplaza ver a la secretaria trabajar 20 minutos.

## Hallazgos

### S4 — "+ NUEVO SOCIO" crea un socio que el próximo import del padrón da de baja, banea y le manda el mail de baja

**Dónde:** `web/app/(secretaria)/secretaria/socios/page.tsx:541-606` (modal sin Nº de socio, botón "CREAR Y ENVIAR INVITACIÓN" en `:603`) · `app/app/(secretaria)/socios.tsx:37-159` (lo mismo, `:151`) · `supabase/functions/admin-socios/index.ts:105-121` (el insert no lleva `numero_socio`, así que sale de la secuencia, ver `20260601000000_socios_schema.sql:9`) · `supabase/functions/importar-socios/index.ts:351-366` (todo socio `activo`/`pendiente` que no está en el archivo pasa a baja) · `:416-418` (el alta NUVIX de esa persona choca por mail y queda con `socio-N@uncas.local`) · `:595-616` (mail "Baja de tu cuenta").
**Rompe:** Nielsen #5 Prevención de errores · Nielsen #2 (el botón dice "ENVIAR INVITACIÓN", pero no se manda nada: `admin-socios:72-77` crea el usuario con el DNI como contraseña y `email_confirm: true`).
**Por qué:** el alta manual recibe un número de secuencia que no existe en NUVIX. En el siguiente import diario ese socio figura como baja "ausencia": se banea su login y se le manda el mail de baja. A la vez, la fila real de NUVIX entra como alta nueva con un mail sintético que la persona no conoce. El resultado es que el socio queda afuera de su cuenta y le llega un mail que dice que lo dieron de baja.

**Fix:** el modal tiene que pedir el Nº de socio de NUVIX (obligatorio) y la function tiene que guardarlo. Así el import lo reconoce como "sin cambio" y no como baja.
```tsx
// socios/page.tsx — ModalNuevoSocio
const [numeroSocio, setNumeroSocio] = useState('')
// validación
if (!/^\d+$/.test(numeroSocio.trim())) { setError('Nº de socio de NUVIX obligatorio (sólo números).'); return }
// campo, primero del form
<FormField label="Nº DE SOCIO (NUVIX)" value={numeroSocio} onChange={v => setNumeroSocio(v.replace(/\D/g, ''))} placeholder="16823" />
// body
callEdgeFunction('admin-socios', { action: 'create', numero_socio: numeroSocio.trim(), ... })
// botón
label="CREAR SOCIO"
// texto debajo del botón:
<p className="font-lora text-xs text-tinta/60 mt-3">La contraseña inicial es el DNI. Tiene que existir en NUVIX con este Nº o el próximo import lo da de baja.</p>
```
```ts
// admin-socios/index.ts — handleCreate
const numero_socio = (body.numero_socio as string | undefined)?.trim()
if (!numero_socio || !/^\d+$/.test(numero_socio)) return jsonError(400, 'Nº de socio de NUVIX obligatorio')
const { data: existe } = await supabaseAdmin.from('socios').select('id').eq('numero_socio', numero_socio).maybeSingle()
if (existe) return jsonError(409, `Ya existe el socio Nº ${numero_socio}`)
const socioPayload = { profile_id: userId, numero_socio, nombre_padron: nombre, dni, categoria_id, estado: 'pendiente', foto_validada: false }
```
Mismo cambio en `app/app/(secretaria)/socios.tsx` + `useSociosSecretaria.crearSocio`. [decision] Si el club ya no da altas por fuera de NUVIX, es más simple sacar el botón.

---

### S4 — Eliminar un servicio del catálogo se lo saca en cascada a todos los socios, y el confirm no lo dice

**Dónde:** `web/app/(secretaria)/secretaria/servicios/page.tsx:76-80` (`confirm` + `delete`) · `supabase/migrations/20260609000000_servicios_opcionales.sql:19` (`REFERENCES servicios_opcionales(id) ON DELETE CASCADE`). Renombrar también rompe cosas (`:41-68`): `importar-servicios/index.ts:137-160` busca el catálogo por nombre exacto y aborta con "faltantes", y `socios-qr/index.ts:288` busca `ilike '%gimnasio%'`.
**Rompe:** Nielsen #5 · Nielsen #3 Control y libertad · WCAG 2.2 SC 3.3.4 Prevención de errores (datos).
**Por qué:** un click en "ELIMINAR" sobre "Gimnasio" + Aceptar borra cada fila de `socio_servicios` de ese servicio. Desde ese momento el lector del gimnasio rechaza a todos y la Agenda pierde el turnero. El confirm dice "no se puede deshacer", pero no dice que afecta a N socios. Los servicios cargados a mano no vuelven ni reimportando, y el proyecto está en plan Free, sin backups automáticos. Una confirmación que esconde la consecuencia no cuenta como confirmación informada.

**Fix:** no permitir borrar un servicio que tenga vínculos (que lo desactive en su lugar) y bloquear el renombre de los nombres mapeados.
```tsx
const NOMBRES_MAPEADOS = ['Gimnasio', 'Rugby', 'Hockey', 'Carnet Tenis', 'Rugby Inclusivo', 'Hockey Inclusivo'] // = SERVICIOS_MAPEADOS de importar-servicios

const handleEliminar = async (id: string, nombre: string) => {
  const { count, error: cErr } = await supabase.from('socio_servicios').select('*', { count: 'exact', head: true }).eq('servicio_id', id)
  if (cErr) { setError('No se pudo verificar el servicio. Probá de nuevo.'); return }
  if ((count ?? 0) > 0) {
    setError(`"${nombre}" lo tienen ${count} socios. No se puede eliminar: desactivalo (botón ACTIVO).`)
    return
  }
  if (!confirm(`¿Eliminar "${nombre}"? Nadie lo tiene contratado.`)) return
  const { error: err } = await supabase.from('servicios_opcionales').delete().eq('id', id)
  if (err) { setError(`No se pudo eliminar: ${err.message}`); return }
  setServicios(ss => ss.filter(s => s.id !== id))
}
// en el form de edición:
<input ... disabled={!!editingId && NOMBRES_MAPEADOS.includes(servicios.find(s => s.id === editingId)?.nombre ?? '')} />
```
Defensa en la DB (migración): cambiar a `ON DELETE RESTRICT`. [backend: migration]

---

### S4 — Abrir el detalle de un socio y ordenar columnas sólo funciona con mouse

**Dónde:** `web/app/(secretaria)/secretaria/socios/page.tsx:892-895` (`<tr onClick>`), `:701-706` (`<th onClick>`) · `web/app/(secretaria)/secretaria/deudas/page.tsx:446-449` (`<th onClick>`).
**Rompe:** WCAG 2.2 SC 2.1.1 Teclado (A) · SC 4.1.2 Nombre, función, valor (A).
**Por qué:** `tr` y `th` no se pueden enfocar ni tienen rol. Con teclado no hay forma de llegar al detalle de un socio, que es donde se registran pagos, se valida la foto y se desactiva. Según la regla de la skill, una función que sólo anda con mouse es S4. Es barato de arreglar.

**Fix:**
```tsx
// socios/page.tsx — la celda del nombre pasa a ser un botón (la fila sigue clickeable para mouse)
<td className="font-lora text-sm text-tinta py-4 pr-4">
  <button type="button" onClick={(e) => { e.stopPropagation(); handleAbrirDetalle(s) }}
    className="text-left hover:text-oro focus-visible:outline focus-visible:outline-2 focus-visible:outline-oro">
    {s.nombre}
  </button>
</td>
// SortableTh (socios y deudas)
<th aria-sort={activo ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="...">
  <button type="button" onClick={() => onSort(column)} className="tracking-widest focus-visible:outline focus-visible:outline-2 focus-visible:outline-oro">
    <span className={activo ? 'text-oro' : ''}>{SORT_LABEL[column]}{activo ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}</span>
  </button>
</th>
```

---

### S3 — Vista previa del padrón: las bajas salen sin nombre, y no hay freno de baja masiva como el que tiene servicios

**Dónde:** `supabase/functions/importar-socios/index.ts:356-365` (`nombre: filaOriginal?.nombre ?? ''`: una baja por "ausencia" no tiene fila en el archivo, así que el nombre queda vacío) · `web/app/(secretaria)/secretaria/socios-import/page.tsx:90` (lo muestra como `'—'`), `:194`, `:93` (muestra `motivo` crudo: "ausencia"/"cesante"), `:199-211` (confirmar sin freno).
**Rompe:** Nielsen #6 Reconocimiento antes que recuerdo · Nielsen #5 · WCAG 2.2 SC 3.3.4.
**Por qué:** la lista que la secretaria tiene que revisar antes de confirmar ("revisá la lista", `:209`) dice `16823 · —` para casi todas las bajas. Tendría que conocer los números de memoria. Si sube un export parcial o el archivo equivocado, confirma N baneos y N mails irreversibles. `seccion-servicios.tsx:336-365` ya resuelve esto con el umbral del 30 %; el padrón, que es más grave porque banea logins, no tiene nada parecido.

**Fix:**
```ts
// importar-socios: guardar nombre_padron en SocioDb (ya se selecciona en :178) y usarlo en la baja
nombre: filaOriginal?.nombre || socio.nombrePadron || '(sin nombre en el padrón)',
// y en resumenDiff/respuesta: bajas_masivas cuando bajas > max(20, 3 % de activos)
const activos = [...sociosDb.values()].filter(s => s.estado === 'activo' || s.estado === 'pendiente').length
const bajaMasiva = diff.bajas.length > Math.max(20, Math.round(activos * 0.03))
return { ...resumen, baja_masiva: bajaMasiva, activos }
```
```tsx
// socios-import/page.tsx
const MOTIVO_BAJA: Record<string, string> = { ausencia: 'No está en el archivo', cesante: 'Cesante en NUVIX' }
// en ListaDetalle: {MOTIVO_BAJA[(it as DetalleBaja).motivo] ?? (it as DetalleError).motivo}
{preview?.baja_masiva && (
  <div role="alert" className="mt-3 p-4 border-2 border-rojo bg-rojo/10">
    <p className="font-lora text-xs tracking-widest text-[#E5634A] mb-1">ATENCIÓN — {preview.bajas} BAJAS DE {preview.activos} SOCIOS</p>
    <p className="font-lora text-sm text-tinta">Suele ser un export parcial o el archivo equivocado. Cada baja bloquea el login y le manda un mail a la persona. Escribí BAJAS para habilitar el botón.</p>
    <input value={confirmTxt} onChange={e => setConfirmTxt(e.target.value)} aria-label="Escribí BAJAS para confirmar" className="mt-2 ..." />
  </div>
)}
<button disabled={aplicando || (preview.baja_masiva && confirmTxt !== 'BAJAS')} ...>
```
[backend: function] + [OTA web]

---

### S3 — Importar deuda: no hay vista previa, un reporte viejo pisa el semáforo de todos y "datos al" muestra otra fecha

**Dónde:** `web/app/(secretaria)/secretaria/deuda/page.tsx:93-107` (un click aplica) · `supabase/functions/importar-deuda/index.ts:94-99` (error con `JSON.stringify(parsed.desbalance)` en crudo) · RPC `20261011000000_deuda_debito_antes_del_22.sql:65` (sólo borra la misma `fecha_corte`) y `:152-183` (recalcula el semáforo de **todos** con la importación que acaba de entrar, sin comparar contra una más nueva) · `web/app/(secretaria)/secretaria/deudas/page.tsx:498-503, 607` ("datos al" = la `fecha_corte` **máxima**, no la que se aplicó).
**Rompe:** Nielsen #1 Visibilidad del estado · Nielsen #5 · Nielsen #9 (el error dice `[{"campo":"vencido","sumaSubtotales":…}]`).
**Por qué:** con imports diarios, subir el archivo de ayer después del de hoy es un error esperable. Pasa en silencio: los socios ven en la app una deuda que ya pagaron (la cuota virtual cobra la deuda NUVIX) y la pantalla Deudas sigue diciendo "datos al <fecha de hoy>". Se arregla reimportando, pero nadie se entera de que hay que hacerlo.

**Fix:**
```ts
// importar-deuda: antes del RPC
const { data: ultima } = await supabaseAdmin.from('importaciones_deuda').select('fecha_corte').order('fecha_corte', { ascending: false }).limit(1).maybeSingle()
const forzar = formData.get('forzar') === '1'
if (ultima && parsed.fechaCorte < ultima.fecha_corte && !forzar) {
  return jsonError(409, `Este reporte es del ${fmt(parsed.fechaCorte)} y ya hay uno más nuevo (${fmt(ultima.fecha_corte)}). Si lo importás, el semáforo vuelve a esa fecha.`)
}
// desbalance legible
const det = parsed.desbalance.map(d => `${d.campo === 'a_vencer' ? 'A vencer' : d.campo === 'vencido' ? 'Vencido' : 'Total'}: suma de cuentas $${fmtM(d.sumaSubtotales)} vs Total General $${fmtM(d.totalGeneral)} (diferencia $${fmtM(d.diferencia)})`).join('\n')
return jsonError(400, `El archivo está incompleto o corrupto: los subtotales no suman el Total General. No se importó nada.\n${det}\nVolvé a exportar el RPT_Vencimientos completo desde NUVIX.`)
```
```tsx
// deuda/page.tsx: ante un 409, botón "IMPORTAR IGUAL" que reenvía con forzar=1
// deudas/page.tsx: mostrar la fecha de la importación que generó el semáforo
.from('importaciones_deuda').select('fecha_corte, created_at').order('created_at', { ascending: false }).limit(1)
```
[backend: function] + [OTA web]

---

### S3 — El detalle del socio (web y mobile) ofrece el flujo de tarjeta descartado: el web está roto y pide número completo y CVV

**Dónde:** web `socios/page.tsx:244-257, 290-315, 431-537` · el web manda `cardData: {...}` anidado (`:463-469`) y la function lee `body.card_number` en el primer nivel (`socios-pagos/index.ts:953-962`), así que **siempre** responde "Número de tarjeta inválido" · mobile `app/app/(secretaria)/socios.tsx:285-509, 632-707` (en mobile sí funciona: `useSociosSecretaria.ts:241-243` lo manda en el primer nivel) · columna TARJETA de la lista web `:887, 906-910`. El propio código dice que ese flujo está descartado (`socios/page.tsx:45-49`: "flujo legacy de débito automático con tarjeta (descartado por la directiva)").
**Rompe:** Nielsen #8 Minimalismo (4 de las 6 acciones del detalle son de un flujo muerto) · Nielsen #5 (COBRAR CON TARJETA cobra plata real por Mercado Pago sin mostrar el monto, `:529-536`).
**Por qué:** la secretaria ve 6 botones con el mismo peso, y 3 son de un proceso que el club no usa. Uno falla siempre en web y otro cobra a la tarjeta del socio con dos clicks.

**Fix:** sacar del detalle (web y mobile) la sección DÉBITO AUTOMÁTICO con tarjeta, ASOCIAR/COBRAR/QUITAR TARJETA, sus 3 modales y la columna TARJETA. Borrar `ModalAsociarTarjeta`, `ModalCobrarTarjeta` y `handleQuitarTarjeta` (web) y lo mismo en mobile + `associateCard/removeCard/chargeCard` del hook. [OTA] (web y mobile). Lo de PCI va en "Fuera de alcance".

---

### S3 — El caso dominante ("¿ya figura mi pago?") no se resuelve en una pantalla, y la búsqueda de Deudas miente si el socio no está en rojo

**Dónde:** `web/app/(secretaria)/secretaria/socios/page.tsx:195-209` (el detalle no muestra semáforo, deuda, meses impagos ni fecha del reporte) · `deudas/page.tsx:463` (`useState<FiltroSemaforo>('rojo')`), `:550-557` (la búsqueda se aplica **encima** del filtro), `:673-677` ("SIN RESULTADOS"), `:693-694` (filas no clickeables) · búsqueda por `profiles.nombre` (`socios/page.tsx:764, 801`; `deudas/page.tsx:529, 556`), que es el nombre que el socio edita en Mi perfil, no `socios.nombre_padron`, que es el de NUVIX y el que conoce la secretaria.
**Rompe:** Nielsen #1 (lista filtrada sin avisar: "SIN RESULTADOS" cuando el socio existe en amarillo/verde) · Nielsen #7 Flexibilidad y eficiencia · Nielsen #6.
**Por qué:** son 4 clicks y 2 búsquedas (ver conteo arriba). Si el socio pagó y pasó a verde, buscarlo con el filtro por defecto en ROJO devuelve "SIN RESULTADOS", que es justo el momento en que la secretaria quiere confirmar que se registró. Si el socio se cambió el nombre en la app, no aparece por su nombre del padrón.

**Fix:**
```tsx
// deudas/page.tsx — la búsqueda ignora el filtro de semáforo, y el vacío dice por qué
const sociosFiltrados = socios
  .filter(s => busqueda.trim() ? true : (filtro === 'todos' || s.semaforo === filtro))
  ...
{busqueda ? 'NINGÚN SOCIO CON ESE NOMBRE O Nº' : `NO HAY SOCIOS EN ${filtro.toUpperCase()}`}
// socios + deudas — traer nombre_padron y buscar por los dos
.select('..., nombre_padron, profiles!socios_profile_id_fkey(nombre)')
nombre: (s.nombre_padron as string | null) ?? (s.profiles as {nombre:string}|null)?.nombre ?? '—',
nombreApp: (s.profiles as {nombre:string}|null)?.nombre ?? '',
// filtro: [s.nombre, s.nombreApp].some(n => n.toLowerCase().includes(q)) || s.dni.includes(q) || s.numero_socio.includes(q)
// socios/page.tsx — DetalleSocio: agregar fila DEUDA NUVIX
{ label: 'DEUDA NUVIX', value: socio.semaforo ? `${SEMAFORO_LABEL[socio.semaforo]} · ${formatMoney(socio.deuda_vencida)} · ${socio.meses_impagos} mes(es)` : 'Sin dato' },
// (agregar semaforo, deuda_vencida, meses_impagos al select de :745)
```
[OTA web]

---

### S3 — Contraste insuficiente en el panel web (textos secundarios, vacíos, errores y botones ELIMINAR)

**Dónde:** ver tabla de contraste. `text-tinta/40`: `socios/page.tsx:255, 871, 874, 907`, `noticias/page.tsx:151, 163, 183`, `servicios/page.tsx:198`, `debito-automatico/page.tsx:432, 435, 460`, `comprobantes/page.tsx:216, 219`, `deudas/page.tsx:672, 675` · `text-tinta/30`: `socios/page.tsx:58, 266`, `deudas/page.tsx:53, 382, 710`, `deuda/page.tsx:159`, `debito-automatico/page.tsx:423`, `comprobantes/page.tsx:67, 74` · `text-rojo text-sm` (errores): `socios/page.tsx:423, 498, 533, 602`, `noticias/page.tsx:259`, `servicios/page.tsx:138`, `categorias/page.tsx:137`, `debito-automatico/page.tsx:411`, `comprobantes/page.tsx:130`, `SolicitudesBaja.tsx:255` · `text-rojo/40`: `servicios/page.tsx:204` · `text-rojo/60`: `noticias/page.tsx:196`.
**Rompe:** WCAG 2.2 SC 1.4.3 Contraste (Mínimo), AA.
**Por qué:** los vacíos ("SIN RESULTADOS", "CARGANDO…") quedan en 3.49:1, el badge INACTIVO y "Exento" en 2.49:1, y los mensajes de error, que es lo que más importa leer, en 3.90:1. ELIMINAR de servicios queda en 1.56:1.

**Fix:** `text-tinta/40` y `text-tinta/30` → `text-tinta/60` (6.38:1). Errores: agregar el token `--color-rojo-texto: #E5634A;` en `globals.css` (5.57:1 sobre papel, 5.27:1 sobre card) y usar `text-rojo-texto` en todo texto de error. Los bordes pueden seguir en `border-rojo`. `text-rojo/40` y `text-rojo/60` → `text-rojo-texto`. [OTA web]

---

### S3 — Mobile: crema sobre crema y oro sobre crema (la lección 1 sin aplicar en Secretaría)

**Dónde:** `app/app/(secretaria)/diario.tsx:193-197` · `socios.tsx:939-946, 1011, 1014, 1020-1028, 1039, 1042, 1077, 1080, 1097-1103` · `socios.tsx:918` (ícono del FAB `colors.tinta` sobre oro) · `noticias.tsx` estilos `edicionBar` (línea 281), `deporteChipActivo` (352), `crearBtn` (382-388) · badge de estado `socios.tsx:779-780, 970-971` (blanco sobre verde/naranja) · `diario.tsx:224` (`statSub #7C7267`).
**Rompe:** WCAG 2.2 SC 1.4.3 (AA) · SC 1.4.11.
**Por qué:** desde `cab360a`, `colors.tinta` es `#F3EFE4` (crema). Todos los fondos `colors.tinta` con texto `colors.oro` quedaron en 1.60:1, y la tarjeta del socio (`tarjetaCard`, fondo tinta con texto TEXTO) en **1.00:1**: invisible. El botón primario de los 4 modales ("CREAR SOCIO", "CONFIRMAR PAGO") es oro sobre crema.

**Fix:** igual que en socio, con los tokens semánticos de `constants/theme.ts`:
```ts
edicionBar: { ..., backgroundColor: colors.card },               // y edicionLabel color: colors.oro (10.24:1 sobre fondo)
crearBtn:   { backgroundColor: colors.oro, ... }, crearBtnText: { ..., color: colors.sobreOro },   // 10.24:1
catBtnActivo / formaPagoBtnActivo / servicioChipActivo / deporteChipActivo: { backgroundColor: colors.oro, borderColor: colors.oro }
// textos activos → color: colors.sobreOro ; montos activos → colors.sobreOro
// FAB icon: color={colors.sobreOro}
estadoBadgeText: { ..., color: colors.sobreOro },                 // #15110A sobre #2ECC71 / #E67E22
statSub: { ..., color: colors.muted },                            // #8E8574 sobre card 4.88:1
```
`tarjetaCard` se va con el hallazgo de tarjeta. [OTA]

---

### S3 — Mobile: el Inicio y los filtros de Secretaría muestran datos que no son reales

**Dónde:** `app/hooks/useDiarioSecretaria.ts:46-50` (`MOROSOS` = `estado='moroso'`, un estado que nadie setea: lo dice `web/.../socios/page.tsx:45-49`) · `diario.tsx:126-131` ("MOROSOS · con cuota vencida" siempre muestra 0) · `useDiarioSecretaria.ts:53-61` + `diario.tsx:148-177` ("ÚLTIMOS PAGOS APROBADOS" lee `pagos_socios`, que sólo tiene los pagos cargados en la app, no los reales de NUVIX) · `socios.tsx:32` (filtro MOROSO, siempre vacío) · `socios.tsx:550-553` (TOTAL MENSUAL con el precio de catálogo; el web ya usa el `importe` real del vínculo, `socios/page.tsx:166-172`) · `diario.tsx:137` ("PENDIENTES · sin foto validada", cuando `pendiente` es un estado del socio y no de la foto).
**Rompe:** Nielsen #2 Relación con el mundo real · Nielsen #1 · lección 8 del brief (dato de negocio incorrecto).
**Por qué:** la pantalla de inicio le dice a la secretaria "0 morosos" con más de un mes de deuda real en el padrón, y el monto por defecto de "Registrar pago" no coincide con el del panel web para el mismo socio.

**Fix:**
```ts
// useDiarioSecretaria — morosos reales = semáforo NUVIX
db.from('socios').select('*', { count: 'exact', head: true }).in('estado', ['activo','pendiente']).eq('semaforo', 'rojo'),
// label: "EN ROJO" · sub: "2+ meses impagos (NUVIX)"
// sacar "ÚLTIMOS PAGOS APROBADOS" o reemplazarlo por "Último reporte de deuda: dd/mm" (importaciones_deuda)
// socios.tsx: FILTROS = ['todos','activo','pendiente','inactivo']
// useSociosSecretaria: traer socio_servicios(servicio_id, importe) y sumar importe ?? monto_mensual (igual que web :168-171)
```
[OTA]

---

### S3 — Publicar una noticia: en web manda push a todos los socios con un click; en mobile publica sin push

**Dónde:** `web/app/(secretaria)/secretaria/noticias/page.tsx:76-88` (PUBLICAR → `notifications` sin confirmar; DESPUBLICAR → PUBLICAR vuelve a mandar el push; error tragado en `:78` y `.catch(() => {})` en `:85`) · `app/hooks/useNoticias.ts:114-124` (mobile actualiza `publicada` y **no** llama a `notifications`; subcomisión y buffet sí lo hacen: `useNoticiasSubcomision.ts:137`, `usePromosBuffet.ts:106`) · no hay edición: un error de tipeo obliga a borrar, recrear y volver a mandar push.
**Rompe:** Nielsen #4 Consistencia (la misma acción hace cosas distintas según el dispositivo) · Nielsen #5 · Nielsen #3.
**Por qué:** un push a más de 1.500 socios no se puede deshacer. En web sale con un click, sin vista previa del texto, y puede repetirse. Si la secretaria publica desde el celular, nadie se entera.

**Fix:**
```tsx
// web
const handleTogglePublicar = async (n: Noticia, publicada: boolean) => {
  if (publicada && !confirm(`¿Publicar "${n.titulo}"? Se manda un aviso al celular de todos los socios${n.yaNotificada ? ' (ya se avisó antes: no se vuelve a mandar)' : ''}.`)) return
  const { error } = await supabase.from('noticias').update({ publicada, ...(publicada && !n.yaNotificada ? { notificada_at: new Date().toISOString() } : {}) }).eq('id', n.id)
  if (error) { setMsg(`No se pudo ${publicada ? 'publicar' : 'despublicar'}: ${error.message}`); return }
  ...
  if (publicada && !n.yaNotificada) {
    const { error: pErr } = await supabase.functions.invoke('notifications', { body: { ... } })
    if (pErr) setMsg('Publicada, pero no se pudo mandar el aviso push.')
  }
}
// mobile useNoticias.togglePublicar: mismo invoke + Alert.alert de confirmación antes
```
Requiere la columna `noticias.notificada_at timestamptz` para no repetir el push. [backend: migration] + [OTA]

---

### S3 — Errores de red tragados: la pantalla muestra "vacío" o un estado falso

**Dónde:** `socios/page.tsx:146-154` (`toggleServicio` sin mirar `error`), `:740-751` (`catsData`/`srvsData` sin `error`), `:778-784` · `servicios/page.tsx:25-31, 70-74, 76-80` (`if (!err)` sin `else`) · `categorias/page.tsx:25-33, 74-79` · `debito-automatico/page.tsx:309-317, 355-359` (ELIMINAR sin confirmar y, si falla, no avisa) · `noticias/page.tsx:49-68, 77-78, 92-93` · `comprobantes/page.tsx:162-188` · `deuda/page.tsx:278-305` · `socios-import/page.tsx:269-292` · `seccion-servicios.tsx:510-532` · mobile `useDiarioSecretaria.ts:46-87` · `layout.tsx:23-33` (si falla la lectura del perfil, cierra la sesión).
**Rompe:** Nielsen #9 · Nielsen #1 · lección 2 del brief.
**Por qué:** un corte de red o un error de RLS en "Historial de importaciones" se muestra como "TODAVÍA NO SE IMPORTÓ NINGÚN ARCHIVO". Un toggle de servicio que falló se ve igual que uno que funcionó, porque `onRefresh` recarga el estado anterior. En el layout, un timeout al leer `profiles` saca a la secretaria del panel como si no tuviera permiso.

**Fix:** patrón único. Ejemplo para historial (aplicar igual en los demás):
```tsx
const [errorCarga, setErrorCarga] = useState<string | null>(null)
const { data, error } = await supabase.from('importaciones_socios')...
if (error) { setErrorCarga('No se pudo cargar el historial.'); return }
...
{errorCarga ? (
  <div role="alert" className="border border-rojo p-6 text-center">
    <p className="font-lora text-sm text-rojo-texto mb-3">{errorCarga}</p>
    <button onClick={fetchHistorial} className="font-lora text-xs tracking-widest px-4 py-2 border border-gris-claro text-tinta">REINTENTAR</button>
  </div>
) : historial.length === 0 ? ... }
// layout.tsx: distinguir error de red (mostrar "No se pudo verificar tu sesión · Reintentar") de "rol no permitido" (signOut)
// debito-automatico handleEliminar: confirm(`¿Eliminar el débito del ${formatFecha(f.fecha)}?`) + setError si err
```
[OTA web] + [OTA]

## Patrones oscuros

No encontré. Las asimetrías que hay (botones destructivos más apagados que los constructivos) son por contraste bajo (hallazgo de contraste), no por empujar a una decisión.

## Lo que está bien

- **Importador de servicios** (`seccion-servicios.tsx`): vista previa con 7 categorías, aviso de export parcial (`servicios_ausentes`) y de baja masiva del 30 % con las bajas destildadas por defecto (`:205-206, 336-365`), checkbox con `aria-label` por fila (`:386`) y manejo de respuestas no-JSON del gateway (`:133-142`). Es el modelo a copiar para el padrón y la deuda.
- **Padrón de socios**: tiene vista previa → confirmar en dos pasos con la etiqueta "PREVIEW — TODAVÍA NO SE APLICÓ NADA" (`socios-import/page.tsx:172`) y un botón que repite los números ("CONFIRMAR Y APLICAR (N altas, N bajas…)", `:206`). Cumple Nielsen #1 y #6. No hay que romperlo con los fixes.
- **Deudas**: orden por urgencia por defecto (rojo y, dentro del color, el que más debe, `deudas/page.tsx:418-423`), filtro por servicio y CSV con `;` + BOM para que Excel es-AR no rompa montos ni tildes (`:576-581`). Bien pensado para la tarea real.
- **Paginación**: `selectAllRows` en socios/deudas evita el corte silencioso de 1.000 filas de PostgREST (`socios/page.tsx:742`, `deudas/page.tsx:482, 492`), y `importar-deuda` resuelve socios por lotes (`:104-112`).
- **Solicitudes de baja**: el componente existe, se muestra sólo si hay pendientes y pide confirmación con texto específico (`SolicitudesBaja.tsx:225-229, 244`). Que no lleguen solicitudes nuevas es por decisión del club (la baja se pide por mail, CLAUDE.md 2026-10-14), no un hueco: la secretaria no "se pierde" avisos de la app socio porque esa vía ya no existe.

## No pude verificar

- **Foco visible**: los botones no tienen `focus-visible:` y los inputs usan `outline-none` + `focus:border-oro` (un borde inferior de 1px). Si el preflight de Tailwind v4 conserva el outline por defecto, depende del navegador. Hace falta ver el panel en vivo con Tab (SC 2.4.7 / 2.4.11).
- **RLS de noticias**: si `/secretaria/noticias` lista y deja borrar promos de Buffet o noticias de Subcomisión (`noticias/page.tsx:51-54, 92` no filtra por autor). Necesito ver las policies de `noticias`.
- **Colisión de la secuencia `numero_socio`** con números reales de NUVIX (empeoraría el primer S4). Necesito `SELECT last_value FROM <secuencia>` contra `max(numero_socio)` del padrón.
- **Comportamiento real de los imports** con archivos de verdad (tiempos, timeouts del gateway con ~1.500 filas).
- Lector de pantalla real (VoiceOver/NVDA) sobre tablas y modales.

### S2 que quedaron afuera por el tope (4)

- `/secretaria/comprobantes` está huérfana: no figura en `SidebarSecretaria.tsx:7-16` y el flujo `en_revision` no se usa (el comprobante va por WhatsApp). Es código muerto que conviene borrar o vincular. [decision]
- La lista de eliminados de servicios no tiene "destildar todos / tildar todos" (`seccion-servicios.tsx:367-404`) para tandas de 100+.
- `debito-automatico/page.tsx:297-299`: `hoyISO()` usa UTC, así que después de las 21 h de Argentina el `min` del date picker ya es mañana. El copy de `:366-367` promete "push y mail", pero el club no manda mail (CLAUDE.md: "sin mail").
- El sidebar no marca la página activa con `aria-current="page"` (`SidebarSecretaria.tsx:106-117`): hoy la marca sólo con peso y una barrita.

---

# Pasada 2 — impeccable audit

Detector: `impeccable detect --json` sobre `web/app/(secretaria)`, `SidebarSecretaria.tsx`, `components/secretaria`, `ListaColapsable.tsx` → `[]`, sin hallazgos deterministas. Todo lo de abajo es revisión manual.

## Web (panel Secretaría)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1 | Filas y orden sólo con mouse (= auditor-ux #3); modales sin `role="dialog"`, sin Escape ni foco |
| 2 | Performance | 2 | 1.528 filas sin virtualizar; cada toggle del detalle vuelve a bajar todo el padrón |
| 3 | Responsive Design | 1 | Sidebar fijo `w-56` + `ml-56`, grids de 3/4/5 columnas sin breakpoints, tablas sin `overflow-x` |
| 4 | Theming | 2 | Hay tokens, pero `#2ECC71`/`#E67E22` están en hex en 9 lugares y el sidebar tiene estilos inline |
| 5 | Implementation Integrity | 2 | `callEdgeFunction` duplicado 4 veces sin `res.ok`/try: el botón puede quedar en "IMPORTANDO…" para siempre |
| **Total** | | **8/20** | **Poor** |

**Implementation Integrity Verdict: FAIL (parcial).** El sistema visual es coherente: Playfair + Lora, mayúsculas espaciadas, oro sobre papel en todo el panel. Pero hay drift de implementación verificado: 4 copias del helper de fetch (`socios/page.tsx:66-80`, `comprobantes/page.tsx:36-50`, `deuda/page.tsx:66-79`, `socios-import/page.tsx:54-68`) y sólo la de `seccion-servicios.tsx:115-143` es robusta. `Modal`/`FormField`/`ModalActions` existen sólo dentro de `socios/page.tsx` y las otras páginas copian el markup (`comprobantes/page.tsx:113-147`, `noticias/page.tsx:207-279`). `SortableTh` está duplicado en socios y deudas. Además quedan dos flujos muertos con UI viva (tarjeta y comprobantes).

**Executive Summary:** 8/20 (Poor) · P0: 0 · P1: 4 · P2: 3 · P3: 1 (web). Lo más urgente: helper de fetch frágil en los imports, modales inaccesibles y rendimiento de la lista de socios.

### Hallazgos web

- **[P1] Los imports pueden quedar trabados en "IMPORTANDO…" sin decir si se aplicaron.** *Dónde:* `deuda/page.tsx:66-79, 93-107` y `socios-import/page.tsx:54-68, 118-139` (sin try/finally: si `res.json()` tira porque el gateway devolvió un 504 en HTML, `setImportando(false)` nunca corre); lo mismo en `socios/page.tsx:66-80` para pagos y altas. *Categoría:* Implementation Integrity. *Impacto:* la secretaria no sabe si el import se aplicó; si recarga y reintenta, el padrón no se duplica (el diff es idempotente), pero sí puede duplicar mails de baja. *Recomendación:* un solo `web/lib/edge.ts` con la versión de `seccion-servicios.tsx:115-143` (try `res.json()`, `!res.ok` → `{ error }`) y `try/finally` en cada handler; ante un timeout, mostrar "No sabemos si se aplicó: revisá el historial antes de reintentar". *Comando:* `/impeccable harden`.
- **[P1] Los modales no son diálogos.** *Dónde:* `socios/page.tsx:610-622`, `comprobantes/page.tsx:113-117`, `noticias/page.tsx:207-213`. No tienen `role="dialog"` ni `aria-modal`, no cierran con Escape ni con click afuera, el foco no entra ni vuelve, y el "×" no tiene `aria-label` (`socios/page.tsx:616`). *Estándar:* WCAG 2.1.2, 2.4.3, 4.1.2. *Recomendación:* usar `<dialog>` nativo con `showModal()` (trae Escape, foco y `::backdrop`) dentro del `Modal` compartido y `aria-label="Cerrar"` en el ×. *Comando:* `/impeccable harden`.
- **[P1] Los mensajes de estado no se anuncian y desaparecen solos.** *Dónde:* `socios/page.tsx:116, 183-185` (3.5 s), `comprobantes/page.tsx:160, 211-213` (4 s); los errores `<p className="text-rojo">` no tienen `role="alert"`. *Estándar:* WCAG 4.1.3, 2.2.1. *Recomendación:* `<div role="status" aria-live="polite">` para éxitos, `role="alert"` para errores, y que los éxitos queden hasta la próxima acción en vez de un `setTimeout`. *Comando:* `/impeccable harden`.
- **[P1] Lista de socios: render completo y refetch total por cada toggle.** *Dónde:* `socios/page.tsx:891-912` (1.528 `<tr>`), `:796-806` (filtro + sort en cada tecla, sin `useMemo`), `:791-794` (`handleRefreshDetalle` → `fetchAll`: vuelve a bajar todo el padrón paginado después de cada chip de servicio, validación o pago); también `deudas/page.tsx:550-561, 693`. *Impacto:* lag al tipear y unos segundos de espera por cada toggle. *Recomendación:* `useMemo` para `sociosFiltrados`, `useDeferredValue(busqueda)`, renderizar 100 filas + "ver más" (o `ListaColapsable` con límite 100), y después de una acción en el detalle actualizar sólo ese socio (`select … .eq('id', socio.id).single()`). *Comando:* `/impeccable optimize`.
- **[P2] El panel es sólo desktop.** *Dónde:* `layout.tsx:53` (`ml-56` fijo), `SidebarSecretaria.tsx:89` (`w-56` fijo), `socios/page.tsx:187` (`grid-cols-3`), `socios-import/page.tsx:174` (`grid-cols-5`), `seccion-servicios.tsx:278, 304`, `deuda/page.tsx:138`; ninguna tabla tiene un `overflow-x-auto` que la envuelva. *Estándar:* WCAG 1.4.10 Reflow. *Recomendación:* `md:` en grids, `<div className="overflow-x-auto">` alrededor de cada tabla y el sidebar colapsable bajo `md`. Es P2 porque la secretaria usa PC. *Comando:* `/impeccable adapt`.
- **[P2] Colores de estado en hex.** *Dónde:* `#2ECC71`/`#E67E22` en `socios/page.tsx:55, 57, 329`, `deudas/page.tsx:379-380`, `deuda/page.tsx:50-51, 172-173, 257`, `comprobantes/page.tsx:252`; sidebar `style={{ backgroundColor: '#0B0905', borderColor: '#2C2418' }}` (`SidebarSecretaria.tsx:89`), cuando ya existen `bg-dark` y `border-gris-claro`. *Recomendación:* `--color-verde: #2ECC71; --color-naranja: #E67E22;` en `@theme` y `className="bg-dark border-gris-claro"`. *Comando:* `/impeccable colorize`.
- **[P2] Inputs de monto y período sin restricción.** *Dónde:* `socios/page.tsx:404-405` (período en texto libre "YYYY-MM", monto `type="number"`, que en es-AR rechaza la coma), `servicios/page.tsx:128-135`, `categorias/page.tsx:127-134`. *Estándar:* Nielsen #5 / ley de Postel. *Recomendación:* `type="month"` para el período e `inputMode="decimal"` + `type="text"` para montos, normalizando `.`/`,`. *Comando:* `/impeccable harden`.
- **[P3] Targets chicos en acciones de tabla.** *Dónde:* EDITAR/ELIMINAR de `servicios/page.tsx:196-207` y ELIMINAR de `debito-automatico/page.tsx:458-463`: texto `text-xs` sin padding, unos 16 px de alto (faltan 8 px para el mínimo AA de 24 px); el "×" de fechas pendientes (`:403`) mide unos 12 px. *Recomendación:* `px-2 py-1.5` (≥ 24 px). *Comando:* `/impeccable polish`.

## Mobile (rol Secretaría)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1 | Botones de solo ícono sin `accessibilityLabel`; targets de 20–32 pt; contraste 1.00–1.60 (= auditor-ux #9) |
| 2 | Performance | 2 | Recarga completa del padrón en cada foco con spinner (lección 3) |
| 3 | Appearance & Theming | 1 | Constantes hex locales (`FONDO`, `CARD`, `TEXTO`…) y `colors.tinta` usado como fondo |
| 4 | Platform Conformance | 2 | Bottom sheets hechos a mano con `paddingBottom` fijo, sin `insets.bottom` |
| 5 | Adaptivity | 2 | `KeyboardAvoidingView behavior="padding"` también en Android |
| **Total** | | **8/20** | **Poor** |

**Platform Conformance Verdict: FAIL leve.** Las tabs (3 visibles con etiqueta, `_layout.tsx`) y el Header cumplen la lección 5. Los modales, en cambio, son hojas falsas (`Modal transparent` + backdrop + `borderTopRadius`) sin manejar insets, y la lista no tiene búsqueda, que en iOS/Android es parte esperable de cualquier lista de ese tamaño.

### Hallazgos mobile

- **[P1] Botones de solo ícono sin label y targets debajo de 44 pt / 48 dp.** *Dónde:* cerrar "×" de 20 pt sin padding ni `hitSlop` en `socios.tsx:85-87, 222-224, 348-350, 474-476` y `noticias.tsx:123-125`; publicar y eliminar en `noticias.tsx:57-70` (ícono 14 + padding 16 + borde 2 = **32 pt**, faltan 12) sin `accessibilityLabel`/`accessibilityRole` (un ojo que **publica** es ambiguo hasta para quien ve); FAB `socios.tsx:917` y `noticias.tsx` sin label; filtros `socios.tsx:954` (texto 12 + 20 de padding ≈ **36 pt**). *Guía:* HIG 44 pt / Material 48 dp. *Recomendación:* `hitSlop={12}` en los "×" y `accessibilityLabel="Cerrar"`; `actionBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }` con `accessibilityLabel={noticia.publicada ? 'Despublicar' : 'Publicar y avisar a los socios'}`; FAB `accessibilityLabel="Nuevo socio"`; `filtroBtn: { minHeight: 44, justifyContent: 'center' }` + `accessibilityState={{ selected: filtro === f }}`. *Comando:* `/impeccable harden`.
- **[P1] Parpadeo y scroll perdido en cada foco (lección 3).** *Dónde:* `useSociosSecretaria.ts:111` (`setLoading(true)`) + `:159` (`useRefreshOnFocus(refreshAll)`) + `socios.tsx:899` (`loading ? <ActivityIndicator/> : <FlatList/>`); también `useDiarioSecretaria.ts:39, 91` y `useNoticias.ts:33, 74` con `noticias.tsx:223`. *Impacto:* cada vuelta a la pestaña Socios desmonta una lista de 1.528 filas, vuelve a bajar todo y te deja arriba de todo. *Recomendación:* igual que en socio: `loading` sólo en la primera carga (`if (!socios.length) setLoading(true)`), `refreshing` para el foco y el pull, y la lista siempre montada. *Comando:* `/impeccable optimize`.
- **[P1] Sin búsqueda en la lista de 1.528 socios.** *Dónde:* `socios.tsx:870-915`: sólo hay filtros por estado. *Impacto:* encontrar a un socio desde el celular es scrollear. *Recomendación:* un `TextInput` sobre los filtros (`placeholder="Nombre, DNI o Nº"`, `clearButtonMode="while-editing"`) con el mismo filtro del web (`socios/page.tsx:798-802`) sobre `nombre_padron`. *Comando:* `/impeccable adapt`.
- **[P2] Hojas falsas sin safe area y teclado en Android.** *Dónde:* `socios.tsx:991-993` (`paddingBottom: 32` fijo, sin `insets.bottom`), `:75, 212, 338, 464` (`behavior="padding"` en las dos plataformas; `noticias.tsx:111-113` sí distingue). *Guía:* HIG safe area / Material IME insets. *Recomendación:* `paddingBottom: 24 + insets.bottom` y `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. *Comando:* `/impeccable adapt`.
- (= auditor-ux #9 contraste mobile) · (= auditor-ux #10 datos falsos) · (= auditor-ux #11 push de noticias)

### Positive findings (ambas plataformas)

- El tab bar de Secretaría tiene 3 pestañas visibles con etiqueta y "Mi perfil" en el Header (`_layout.tsx:20-23`), como quedó en la auditoría socio.
- La lista mobile es `FlatList` virtualizada con `keyExtractor` estable.
- Las confirmaciones destructivas mobile usan `Alert.alert` con `style: 'destructive'` (`socios.tsx:685-692, 809-815`; `noticias.tsx:35-40`), que es el patrón nativo.

## Recommended Actions

1. **[P1] `/impeccable harden`**: helper `web/lib/edge.ts` único con try/finally en los imports; `<dialog>` en el `Modal` compartido; live regions; labels y `hitSlop` en mobile.
2. **[P1] `/impeccable optimize`**: memo + render acotado de la lista web; refetch de un solo socio; quitar el parpadeo en el foco en mobile.
3. **[P1] `/impeccable adapt`**: búsqueda en la lista mobile; insets y teclado en las hojas.
4. **[P2] `/impeccable adapt`**: breakpoints y `overflow-x-auto` en el panel web.
5. **[P2] `/impeccable colorize`**: tokens `verde`/`naranja`/`rojo-texto`; sacar el estilo inline del sidebar.
6. **[P3] `/impeccable polish`**: targets de acciones de tabla.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.

---

## Compartido

- **`colors.tinta` como fondo (lección 1)**: el mismo bug de `CronicaScreen.tsx`/`UsuariosScreen.tsx` está en las 3 pantallas mobile de Secretaría (`edicionBar`, `crearBtn`, chips activos). Si otra área ya propone un helper o un token `colors.superficieClara`/`sobreOro` para "barra de edición", reusarlo acá y no inventar otro.
- **`app/hooks/useNoticias.ts`**: lo comparten socio (`useNoticias(true)`) y secretaría (`useNoticias(false)`). El fix del push va en `togglePublicar`, que sólo usa secretaría, y no afecta a socio. El parpadeo (`:33` + `:74`) sí afecta a los dos roles; la auditoría socio lo arregló en la pantalla, no en el hook, así que hay que revisar que no se rompa.
- **`web/components/ListaColapsable.tsx`**: está bien. Sólo le falta `aria-expanded` en el botón (`:22-28`). También lo usan las pantallas de import; si otra área lo reporta, es el mismo hallazgo.
- **Helper de fetch a Edge Functions** (4 copias en Secretaría): si subcomisión (`/usuarios`) tiene la misma copia (`estado-web.md` menciona `callEdgeFunction` en `/usuarios`), conviene un solo `web/lib/edge.ts` para todo el panel.

## Fuera de alcance pero grave

1. **Número de tarjeta completo + CVV pasan por el panel de Secretaría y por una Edge Function propia (PCI DSS).** `web/.../socios/page.tsx:439-470` y `app/app/(secretaria)/socios.tsx:287-329` capturan el PAN y el CVV en texto. `socios-pagos/index.ts:944-1000` los recibe en el body y los reenvía a Mercado Pago. Eso pone al club en el alcance PCI más amplio (SAQ D) cuando lo correcto es tokenizar del lado del cliente con el SDK de MP (SAQ A). Además el flujo está descartado por la directiva. **Fix:** sacar `associate-card` de la UI (hallazgo de tarjeta) y que la function devuelva 410 en `associate-card`/`charge-card` desde el rol secretaria. [backend: function]
2. **`socios-pagos` `handleManual` ignora el error del insert en `pagos_socios`** (`socios-pagos/index.ts:633-647`): marca la cuota como `pagado` aunque el pago no se haya guardado, y en ese caso no sale el comprobante (`pagoId` queda undefined). La secretaria ve "Pago registrado ✓" con un registro a medias. **Fix:** mirar `pagoRes.error` y revertir el `update` de la cuota, o hacerlo en una RPC transaccional. [backend: function]
3. **"Registrar pago" en la app y NUVIX como fuente de verdad son dos verdades distintas.** `handleManual` escribe `cuotas`/`pagos_socios` y manda un PDF por mail (`:650-655` → `generarYEnviarComprobante`), cuando el club decidió que NUVIX manda los transaccionales ("sin mail", CLAUDE.md) y la app del socio muestra la deuda NUVIX. Un pago cargado sólo acá no cambia la deuda que ve el socio hasta que entra en NUVIX, y le llega un comprobante duplicado. [decision: ¿Registrar pago sigue existiendo? Si la secretaria carga todo en NUVIX, sacarlo del panel y de mobile; si no, como mínimo cortar el mail.]

---

## Tareas sugeridas

- [ ] T1 — **Manual member creation must carry the NUVIX member number** (S4 / P1). `admin-socios/index.ts:105-121` inserts without `numero_socio` (sequence value), so the next `importar-socios` run (`:351-366`) bans the member, emails "Baja de tu cuenta" (`:595-616`) and recreates them with a synthetic mail (`:416-418`). Web `socios/page.tsx:541-606` and mobile `socios.tsx:37-159` don't ask for it, and the button falsely says "ENVIAR INVITACIÓN". Fix: required "Nº DE SOCIO (NUVIX)" field, 409 on duplicate, store it in `socios.numero_socio`, button "CREAR SOCIO" + helper text about the DNI password. [backend: function] + [OTA] — [decision: keep manual creation at all, or remove the button since NUVIX is the only source?]
- [ ] T2 — **Block deleting a service that members have; lock renaming of mapped services** (S4 / P1). `servicios/page.tsx:76-80` deletes and `20260609000000_servicios_opcionales.sql:19` cascades to every `socio_servicios` row (gym access lost for everyone). Renaming breaks `importar-servicios:137-160` and `socios-qr:288`. Fix: count links first and refuse with "lo tienen N socios: desactivalo"; disable the name input for the six mapped names; migration `ON DELETE RESTRICT`. [backend: migration] + [OTA web]
- [ ] T3 — **Keyboard access to member detail and column sort** (S4 / P1). `socios/page.tsx:892-895` (`tr onClick`), `:701-706` and `deudas/page.tsx:446-449` (`th onClick`). Fix: name cell `<button>`, `<th aria-sort>` wrapping a `<button>`, `focus-visible:outline-oro`. [OTA web]
- [ ] T4 — **Roster import preview: show names on removals + mass-removal guard** (S3 / P1). `importar-socios/index.ts:361` leaves `nombre` empty for "ausencia" removals, rendered as "—" (`socios-import/page.tsx:90`); raw `motivo`; no guard like services' 30 % rule. Fix: fall back to `nombre_padron`, human labels for motivo, `baja_masiva` flag (> max(20, 3 % of active)) with typed "BAJAS" confirmation. [backend: function] + [OTA web]
- [ ] T5 — **Debt import: reject older reports, legible reconciliation error, honest "datos al"** (S3 / P1). `importar-deuda/index.ts:94-99` returns raw JSON; the RPC (`20261011000000:152-183`) recomputes every member's traffic light from whatever was just imported; `deudas/page.tsx:498-503` shows max `fecha_corte`. Fix: 409 when `fecha_corte` < latest unless `forzar=1` (with "IMPORTAR IGUAL" button), human error text, header shows the import that produced the current traffic light. [backend: function] + [OTA web]
- [ ] T6 — **Remove the abandoned card flow from member detail (web + mobile)** (S3 / P1). Web `socios/page.tsx:244-257, 290-315, 431-537, 887, 906-910` (associate is broken: sends `cardData` nested vs `socios-pagos/index.ts:953` reading top-level); mobile `socios.tsx:285-509, 632-707` + hook `associateCard/removeCard/chargeCard`. Fix: delete the section, three modals and the TARJETA column; make the function return 410 for those actions from staff. [OTA] + [backend: function]
- [ ] T7 — **Answer "did my payment land?" in one screen** (S3 / P1). Member detail (`socios/page.tsx:195-209`) lacks NUVIX debt; `deudas/page.tsx:463, 550-557` applies search on top of the default ROJO filter and says "SIN RESULTADOS"; lists search `profiles.nombre` (user-editable) instead of `nombre_padron`. Fix: search ignores the traffic-light filter, empty state names the filter, add DEUDA NUVIX row to detail, select and search `nombre_padron` + app name. [OTA web]
- [ ] T8 — **Web contrast fixes** (S3 / P1). `text-tinta/40` (3.49:1), `text-tinta/30` (2.49:1), `text-rojo` errors (3.90:1), `text-rojo/40` (1.56:1), `text-rojo/60` (2.12:1); locations in the contrast table. Fix: `/60` for secondary text; new token `--color-rojo-texto: #E5634A` for error/destructive text. [OTA web]
- [ ] T9 — **Mobile secretaría: semantic tokens instead of `colors.tinta` backgrounds** (S3 / P1). `diario.tsx:193-197`, `socios.tsx:939-946, 1011-1028, 1039-1042, 1077-1083, 918, 970-971`, `noticias.tsx` edicionBar/deporteChipActivo/crearBtn, `diario.tsx:224`. Fix: `colors.card` bars, `colors.oro` + `colors.sobreOro` for primary buttons/active chips/FAB icon/status badges, `colors.muted` for sub text. [OTA]
- [ ] T10 — **Mobile home and filters must use NUVIX data** (S3 / P1). `useDiarioSecretaria.ts:46-50` counts `estado='moroso'` (never set); "ÚLTIMOS PAGOS" reads app-only `pagos_socios`; `socios.tsx:32` MOROSO filter; `socios.tsx:550-553` sums catalog price instead of link `importe`. Fix: count `semaforo='rojo'`, replace recent payments with last debt-report date, drop MOROSO filter, sum `importe ?? monto_mensual`. [OTA]
- [ ] T11 — **News publish: confirm, notify once, and notify from mobile too** (S3 / P1). Web `noticias/page.tsx:76-88` pushes on every publish without confirmation and swallows errors; mobile `useNoticias.ts:114-124` never pushes. Fix: confirm dialog stating "se avisa a todos los socios", `noticias.notificada_at` to avoid re-push, same invoke from mobile, surface push failure. [backend: migration] + [OTA]
- [ ] T12 — **Stop swallowing Supabase errors in secretaría screens** (S3 / P1). `socios/page.tsx:146-154, 740-751, 778-784`; `servicios/page.tsx:25-31, 70-80`; `categorias/page.tsx:25-33, 74-79`; `debito-automatico/page.tsx:309-317, 355-359` (also add delete confirmation); `noticias/page.tsx:49-93`; `comprobantes/page.tsx:162-188`; `deuda/page.tsx:278-305`; `socios-import/page.tsx:269-292`; `seccion-servicios.tsx:510-532`; `useDiarioSecretaria.ts:46-87`; `layout.tsx:23-33` (network error must not sign out). Fix: `error` state + "REINTENTAR" block with `role="alert"`. [OTA web] + [OTA]
- [ ] T13 — **Single robust Edge Function client with try/finally** (P1). `deuda/page.tsx:66-107`, `socios-import/page.tsx:54-139`, `socios/page.tsx:66-80`, `comprobantes/page.tsx:36-50` can leave "IMPORTANDO…" stuck when the gateway returns non-JSON. Fix: `web/lib/edge.ts` based on `seccion-servicios.tsx:115-143`; every handler in try/finally; timeout message "revisá el historial antes de reintentar". [OTA web]
- [ ] T14 — **Accessible modals and status messages (web)** (P1). `socios/page.tsx:610-622`, `comprobantes/page.tsx:113-117`, `noticias/page.tsx:207-213`; status in `socios/page.tsx:183-185`, `comprobantes/page.tsx:211-213`. Fix: native `<dialog>` with `showModal()`, `aria-label="Cerrar"`, `role="status"`/`role="alert"`, no auto-hide timers. [OTA web]
- [ ] T15 — **Member list performance (web)** (P1). `socios/page.tsx:796-806, 891-912, 791-794`; `deudas/page.tsx:550-561`. Fix: `useMemo` + `useDeferredValue`, render 100 rows with "ver más", refetch only the edited member after detail actions. [OTA web]
- [ ] T16 — **Mobile targets and labels** (P1). Close icons `socios.tsx:85, 222, 348, 474`, `noticias.tsx:123`; `noticias.tsx:57-70, 318-320` (32 pt); FABs; `socios.tsx:954` filters (~36 pt). Fix: `hitSlop={12}`, `minWidth/minHeight: 44`, `accessibilityLabel`/`accessibilityRole`/`accessibilityState`. [OTA]
- [ ] T17 — **Mobile list: no flicker on focus + search** (P1). `useSociosSecretaria.ts:111, 159`, `socios.tsx:899`, `useDiarioSecretaria.ts:39`, `useNoticias.ts:33`; no search in `socios.tsx:870-915`. Fix: first-load-only spinner, `refreshing` for focus/pull, keep FlatList mounted; add search input over `nombre_padron`/DNI/Nº. [OTA]
- [ ] T18 — **Manual payment: transactional write and decide if it stays** (out of scope, grave). `socios-pagos/index.ts:633-655` ignores `pagoRes.error` and emails a PDF while NUVIX is the source of truth. Fix: check the error and roll back the cuota (or RPC); stop the email. [backend: function] — [decision: should "Registrar pago" exist in the panel/mobile at all?]
- [ ] T19 — **Orphan `/secretaria/comprobantes` page** (S2). Not linked in `SidebarSecretaria.tsx:7-16`; the `en_revision` flow is unused since WhatsApp receipts. Fix: delete page + `aprobar/rechazar-comprobante` UI, or link it. [decision: delete?]

### Tabla de contraste

| Ubicación | Hoy | Ratio | Cambiar a | Ratio |
|---|---|---|---|---|
| Web — textos secundarios / vacíos / CARGANDO (`text-tinta/40` sobre papel) | `#6E6A61` / `#15110A` | 3.49:1 | `text-tinta/60` → `#9A968D` | 6.38:1 |
| Web — badge INACTIVO, Exento, notas (`text-tinta/30` sobre papel) | `#58544B` / `#15110A` | 2.49:1 | `text-tinta/60` → `#9A968D` | 6.38:1 |
| Web — `text-tinta/30` sobre card (SIN FOTO, Sin comprobante) | `#5C5850` / `#1C1710` | 2.52:1 | `text-tinta/60` → `#9D998F` | 6.26:1 |
| Web — errores `text-rojo` sobre papel | `#CC4127` / `#15110A` | 3.90:1 | `#E5634A` | 5.57:1 |
| Web — errores `text-rojo` sobre card | `#CC4127` / `#1C1710` | 3.69:1 | `#E5634A` | 5.27:1 |
| Web — ELIMINAR servicios (`text-rojo/40`) | `#5E2416` / `#15110A` | 1.56:1 | `#E5634A` | 5.57:1 |
| Web — ELIMINAR noticias (`text-rojo/60`) | `#832E1B` / `#15110A` | 2.12:1 | `#E5634A` | 5.57:1 |
| Mobile — `edicionBar` / `crearBtn` / chips activos (oro sobre `colors.tinta`) | `#F5B41C` / `#F3EFE4` | 1.60:1 | oro sobre `colors.card`/`fondo`, o `sobreOro` sobre oro | 10.24:1 |
| Mobile — `tarjetaCard` (TEXTO sobre `colors.tinta`) | `#F3EFE4` / `#F3EFE4` | 1.00:1 | se elimina (T6) | — |
| Mobile — FAB ícono (`colors.tinta` sobre oro) | `#F3EFE4` / `#F5B41C` | 1.60:1 | `colors.sobreOro` `#15110A` | 10.24:1 |
| Mobile — badge estado (blanco sobre verde) | `#FFFFFF` / `#2ECC71` | 2.10:1 | `#15110A` | 8.95:1* |
| Mobile — badge estado (blanco sobre naranja) | `#FFFFFF` / `#E67E22` | 2.85:1 | `#15110A` | 6.60:1* |
| Mobile — `statSub` del Inicio | `#7C7267` / `#1C1710` | 3.78:1 | `colors.muted` `#8E8574` | 4.88:1 |

\* Ratio simétrico medido con el script como `#2ECC71`/`#E67E22` sobre `#15110A`. El contraste es el mismo en la dirección inversa.
