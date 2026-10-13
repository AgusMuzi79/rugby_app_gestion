# gimnasio-turnos

## Objective
Turnero (cupos por franja horaria) para el gimnasio: franjas semanales con cupo, reservas de socios, turnos fijos recurrentes, tope de dias por semana segun servicio, administracion web para el encargado y pantalla mobile para socios/Cliente Gimnasio.

## Problem / why
El encargado del gimnasio pidio cupos por horario: hay franjas saturadas y otras vacias. Plan y decisiones en memoria `plan/cupos-gimnasio` y en la conversacion del 2026-10-02/04.

## Decisions (Agus)
- Franjas: plantilla semanal fija, editable (cambian solo en verano/invierno); excepciones por fecha (feriados/cierres). No es mensual.
- Turno fijo recurrente: el socio elige dias+franja una vez; el sistema reserva automaticamente las proximas semanas.
- Faltas: no se libera el cupo solo; tras N faltas consecutivas push de aviso "se te va a liberar el horario si no vas"; si sigue sin ir, se libera el turno fijo (no las reservas sueltas).
- Sin reserva por la app: salvo casos puntuales, se registra en el gimnasio con DNI (flujo existente del Lector).
- Tope de dias por semana segun servicio: Gimnasio Mayor = 3 dias/semana (dicho por Agus); el resto sin limite hasta que el encargado confirme (configurable por datos).
- Administra el encargado con el rol Gimnasio actual (`porteria`) + admin + subcomision (decidido 2026-10-04). Sin rol nuevo.
- Escaneo obligatorio en el gimnasio (se va acomodando).
- Lector bloquea o solo avisa sin reserva: PENDIENTE (reunion sabado 2026-10-10). Arranca en modo informativo, flag en config.
- Cron de turnos fijos: NO se registra todavia.

## Design
- Dia de semana ISO: 1=Lunes..7=Domingo. Zona horaria: UTC-3 fijo (`-03:00`), como socios-qr.
- Tablas (RLS, escritura solo por service_role/RPC): `gimnasio_config` (1 fila: modo_cupos informativo|bloqueante, anticipacion_dias=7, pct_cupo_fijos=70, faltas_aviso=3, semanas_fijos=4, tolerancia_min=10), `gimnasio_franjas` (dia_semana, hora_desde, hora_hasta, cupo, activa), `gimnasio_franjas_excepciones` (fecha, franja_id null=todas, cerrado, cupo_override), `gimnasio_limites` (servicio_id o categoria_nombre, dias_por_semana null=sin limite), `gimnasio_turnos_fijos` (socio_id, franja_id, activo, faltas_consecutivas), `gimnasio_reservas` (socio_id, franja_id, fecha, estado reservada|cancelada|asistio|falto, origen socio|fijo|encargado, turno_fijo_id; unique parcial (socio_id, franja_id, fecha) donde estado<>'cancelada').
- Reserva atomica: RPC plpgsql `gimnasio_reservar(...)` SECURITY DEFINER + `set search_path = public`, lock `for update` de la franja, valida cupo (excepciones, cupo fijos vs sueltas), anticipacion, pasado, tope semanal ISO por servicio; execute solo para service_role.
- Edge Functions: `gimnasio-turnos` (socio/cliente_gimnasio, JWT) y `gimnasio-turnos-admin` (porteria/admin/subcomision, JWT); resuelven rol como socios-qr (`profiles.rol`). Errores de validacion como HTTP 200 `{ok:false, motivo}`.
- Elegibilidad: misma regla que `tieneServicioGimnasio` (categoria 'Cliente Gimnasio' o servicio activo ilike '%gimnasio%').
- Mobile: `turnos.tsx` en (socio) y (cliente-gimnasio), hook `useTurnos` (useState/useEffect, sin react-query), tab nueva.
- Web: `/porteria/turnos` (franjas, excepciones, ocupacion por dia, anotar a mano por DNI, config y limites); guard del grupo (porteria) ampliado a subcomision; entrada en SidebarLector y Sidebar de subcomision.
- Lector (informativo): al escanear, si hay reserva en la franja actual -> `asistio`; si no -> `sin_reserva` informativo (sin bloquear mientras modo_cupos='informativo').

## Decisions update (Agus, 2026-10-05) — SUPERSEDE lo anterior donde choquen
- NO hay tope de dias por semana ni por servicio (se descarta el tope Gimnasio Mayor=3 y toda la tabla de limites). No mostrar ni mencionar cuantos dias se pueden reservar: la rutina lo regula sola.
- Ventana de reserva: se puede reservar cualquier dia del MES EN CURSO (el socio paga el mes y reserva los horarios de ese mes). Nuevo config `ventana_reserva` = 'mes' (default) | 'dias'; `anticipacion_dias` queda solo para el modo 'dias'. Supuesto: el mes siguiente se abre el dia 1; los turnos fijos siguen renovandose solos.
- Faltas: 2 faltas consecutivas -> push de aviso; a la 3ra se saca el horario reservado (supuesto: el "horario" = ese socio en esa franja: se cancelan sus reservas futuras de esa franja y se desactiva el fijo). `faltas_aviso`=2, nuevo `faltas_baja`=3.
- Tolerancia: 15 minutos (antes 10).
- Elegibilidad por ahora: solo tener servicio de gimnasio contratado; NO se mira moroso/inactivo (se tendra en cuenta mas adelante).
- Cancelar: hasta que empieza la franja (mas adelante quizas se agrega anticipacion minima).
- El encargado NO anota a nadie: se elimina `reserva-manual` y el formulario "Anotar por DNI" (origen 'encargado'). El encargado solo carga horarios (ocupacion queda de solo lectura + cancelar reserva).
- Cerrar una franja o dia exige un mensaje (motivo) que le llega por push a los socios afectados (los que tenian reserva); se cancelan esas reservas; el motivo tambien se muestra en la pantalla del socio bajo "Cerrado". Previsualizacion con conteo antes de confirmar.

- CONFIRMADO por Agus (2026-10-05): cerrar una franja/dia CANCELA las reservas y AVISA por push con el mensaje; si se reabre, las reservas canceladas NO se restauran ni se re-notifica.

## T6 design (2026-10-06, rama feat/gimnasio-turnos-fijos) — supuestos a confirmar con Agus
- Asistencia = existe un ingreso del socio en `accesos` (punto 'gimnasio') dentro de la ventana de la franja [inicio - tolerancia, fin + tolerancia]. Fuente unica de verdad, sin depender de T7. Se evalua una reserva cuando `ahora >= fin + tolerancia_min` (15): con ingreso -> 'asistio', sin ingreso -> 'falto'.
- Racha de faltas por (socio, franja): faltas consecutivas evaluadas (cualquier origen, ignorando canceladas); un 'asistio' la corta. Racha == faltas_aviso (2) -> push de aviso (una sola vez por racha); racha >= faltas_baja (3) -> se cancelan sus reservas futuras 'reservada' de esa franja, se desactiva el turno fijo y push de aviso de baja.
- Interruptor `gimnasio_config.faltas_activas` (default FALSE): el conteo de faltas y los avisos arrancan APAGADOS hasta que el escaneo este asentado; la materializacion de fijos no depende de el.
- Materializacion: reservas de origen 'fijo' para las proximas `semanas_fijos` semanas (desde hoy), idempotente; se saltea fechas cerradas, cupo de fijos lleno y fechas que ya tienen cualquier reserva del socio en esa franja (incluso cancelada: no se recrean las que el socio cancelo ni las canceladas por cierre). Se dispara al crear el fijo y desde la funcion cron `gimnasio-turnos-fijos` (cron NO registrado).

## T7 design (2026-10-07, rama feat/gimnasio-lector-turnos) — Lector + turnos
- Solo rol `porteria` (Gimnasio); Canchero/Buffet no cambian. Aplica a los dos caminos de escaneo de socio (QR y DNI) de `socios-qr`; invitados no cambian.
- RPC `gimnasio_turno_actual(p_socio_id)` (service_role) decide TODO en SQL: franja vigente ahora (hora local, activa, dia ISO; entra [inicio - tolerancia, fin]; si hay dos pega la que ya empezo), si el socio tiene reserva 'reservada'/'asistio' en ella, ocupados/capacidad, modo y si corresponde bloquear. Sin franja vigente, franja cerrada por excepcion, o sin franjas cargadas -> NO muestra nada y nunca bloquea.
- `accesos.sin_reserva boolean not null default false`: true cuando hay franja vigente y el socio no tiene reserva (se registra el ingreso igual; sirve de dato para el encargado y los profes). Panel de accesos: badge SIN RESERVA + columna CSV.
- Modo `informativo` (default): el Lector deja pasar y muestra "Reserva: 18:00-19:00 · Prof. Ana" o "Sin reserva en este horario". Modo `bloqueante`: sin reserva -> `valido:false` con motivo (se registra el intento con sin_reserva=true), igual que el gate de servicio. Sin excepciones por ahora ("casos especificos" a definir).
- FAIL-OPEN: si el calculo del turno falla (error de DB, funcion ausente), el escaneo sigue como hoy y se loguea; el turnero nunca puede romper la entrada al gimnasio.
- La asistencia de las faltas NO se escribe al escanear: T6 la deduce de `accesos`.
- Orden de deploy critico: migracion antes que `socios-qr` (el insert de accesos escribe `sin_reserva`).

## Constraints
- NO ejecutar `supabase db push`, `functions deploy`, ni registrar crons: lo hace Agus (o yo con su OK).
- Commits convencionales, sin atribucion de IA, uno por tarea.
- Sin runner de tests en el repo: para el RPC critico, verificar en un Postgres descartable local (docker) con tablas stub, nunca contra produccion.
- Typecheck: `npx tsc --noEmit` en app/ y web/ (errores conocidos en `app/(secretaria)/socios.tsx` 112-113 no son nuestros).

## Tasks
- [x] T1 (6ed3d86, fix 138e025) schema: migracion con tablas, RLS, RPC `gimnasio_reservar` y seeds (config + limite Gimnasio=3), verificada en Postgres descartable
- [x] T2 (94e6304) `gimnasio-turnos` (socio): listar disponibilidad, reservar, cancelar, mis reservas, crear/cancelar turno fijo
- [x] T3 (854fb95) `gimnasio-turnos-admin`: CRUD franjas, excepciones, ocupacion por dia, reserva manual por DNI, config y limites
- [x] T4 (8d4dcd4) mobile: pantalla Turnos para socio y cliente-gimnasio
- [x] T5 (89ad58f) web: seccion Turnos en el panel Gimnasio
- [x] T9 (commits 13f6003 backend + 558f4cf UI en feat/gimnasio-calendario; parent verifico: sin atribucion IA, SQL re-corrido en Postgres descartable = 173 ok sin FALLO, parser `npx tsx web/lib/calendarioImport.check.ts` = 31 casos OK, tsc web limpio, tsc app solo errores conocidos; Edge Functions sin type-check; review nativa (medio, 1836 lineas, base 553ceea) APROBADA sin bloqueantes, autoridad quemada, lineage review-8557b925caa8db92; informativos: confirmacion con vista previa vieja si alguien mas edita franjas entre preview y confirmar (el apply reconstruye el plan con el estado actual), candado de importacion no bloquea un `franja-guardar` concurrente (ventana minima: hoy un solo admin), `franjas-importar` sin test del handler, parser check sin cablear a CI (no hay runner); NO desplegado; migracion nueva 20261006000000 por aplicar antes de desplegar funciones) calendario completo + profesor (rama feat/gimnasio-calendario, 2026-10-05): columna `profesor` en franjas (texto libre, max 80), importacion de calendario completo por pegado desde Excel/Sheets o CSV con vista previa; formato una fila por franja: Dia (acepta Lun-Vie / Lun, Mie, Vie) | Desde | Hasta | Cupo | Profesor; modos agregar/reemplazar; coincidencia por (dia, desde, hasta) actualiza en el lugar (no pierde reservas), reemplazar desactiva las que faltan y muestra reservas futuras afectadas; el profe se ve en la app del socio, en ocupacion y en el panel. Plantilla Excel para el encargado.
- [x] T8 ajustes por decisiones del 2026-10-05 (backend + UI): sin tope semanal, ventana por mes, faltas_baja, tolerancia 15, sin reserva manual, mensaje de cierre con push y cancelacion. Edita la migracion de turnos EN SITIO (nunca se aplico a ninguna base)
- [x] T6 HECHO (rama feat/gimnasio-turnos-fijos, commits 4fdd466, 98259ee, 5a9c52d, 675a0e1, 77125cf; NO desplegado; migracion 20261007000000 sin aplicar). Parent verifico en cada entrega: sin atribucion IA, SQL en Docker (final: 363 ok, 0 FALLO), checks expoPush 17 / calendario 26 / parser 31, tsc web y app limpios. Review nativa (1658 lineas, medio) APROBADA, lineage review-506881afe431ecd0. Correcciones tras detectar riesgos: (1) las faltas solo se evaluan desde `faltas_activas_desde` (trigger en la base; evita bajas masivas al prender el interruptor); (2) cancelar fijo / baja BORRAN las ocurrencias futuras del fijo (nuevo RPC `gimnasio_liberar_fijo`) para que al recrearlo se regeneren; (3) la baja no toca lo que ya empezo; (4) `crear-fijo` informa fechas ya existentes. Informativos sin arreglar: la orquestacion de la funcion cron `gimnasio-turnos-fijos` no tiene tests (sin deno); reservas sueltas canceladas por baja siguen bloqueando un fijo nuevo en esa fecha (avisa motivo_parcial); filas de fijos inactivos se acumulan. Orden de deploy: migracion primero (gimnasio-turnos y -admin dependen de ella), funcion nueva con --no-verify-jwt, cron NO registrado, interruptor de faltas apagado. (texto original:) turnos fijos: funcion `gimnasio-turnos-fijos` (materializa reservas, marca faltas, push de aviso, libera), dry_run, cron comentado
- [x] T7 HECHO (rama feat/gimnasio-lector-turnos, commits d937d54, 0284bf0, 650509c; NO desplegado; migracion 20261008000000 sin aplicar). Parent verifico: sin atribucion IA, SQL en Docker = 454 ok sin FALLO, checks y tsc limpios, y leyo el diff completo de socios-qr (fail-open correcto: try/catch cubre rpc + error + forma; gate de servicio primero e intacto; canchero/buffet sin cambios; respuesta = superset). Review nativa (454 lineas, medio) APROBADA, lineage review-642078abbcdc7d69. Bug real hallado por la review y corregido en 650509c: con franjas pegadas, en los ultimos `tolerancia_min` minutos se reportaba la franja SIGUIENTE y un socio con reserva de la franja en curso salia `sin_reserva` (en bloqueante lo hubiera negado); ahora se mira reserva en TODAS las franjas candidatas. Informativos: `listar-accesos` depende de la columna `sin_reserva` (desplegar migracion ANTES que socios-qr; `registrarAcceso` solo escribe la columna cuando es true), la logica fail-open de socios-qr sin test automatico (sin deno). El fix de 160 lineas quedo bajo presupuesto: sin nueva review. Orden de deploy: migracion -> socios-qr -> merge/push (web) -> OTA (la tablet no muestra la linea de turno hasta el OTA). (texto original:) Lector: integracion informativa con `socios-qr`

## Route declaration
- Exploracion: delegada (mapper, 7 areas).
- Implementacion: un writer por bloque, en serie: A = T1-T3 (backend), B = T4-T5 (UI), C = T6-T7.
- Delivery: una rama de feature con commits por work unit (el repo no usa PRs: merge ff a main por decision de Agus). Forecast ~1500-2000 lineas autoradas; review nativa por slice segun `review assess`.

## Open / pending
- Franjas y cupos reales (los pasa el encargado); dias por semana de cada variante (excepto Mayor=3); bloquear o avisar; cuantas faltas; % de cupo para sueltas; anticipacion.
- Fix branch `fix/gimnasio-hallazgos-review` (bce2e36) sin mergear ni desplegar: Agus decidio no apurarlo.

## Progress / evidence
- [x] T1 schema 6ed3d86, T2 funcion socio 94e6304, T3 funcion admin 854fb95 (writer A). Parent re-corrio el script SQL en Postgres descartable de Docker: "TODAS LAS PRUEBAS PASARON" (68 ok). Edge Functions SIN type-check (no hay deno), solo lectura estructural.
- Review nativa (T1-T3, tier medio, 2158 lineas, 1 lente reliability): hallazgo CRITICAL `R3-listar-anticipacion-rango` (config permitia anticipacion 31-60 pero listar topea en 31 dias -> los socios no podian cargar el turnero). Corregido en 138e025 (config max 30 + clamp en listar) y validado: APROBADA, autoridad quemada (lineage review-2e28218a3599982c). Frontera revisada = 138e025.
- Observaciones informativas (no bloqueantes): `cancelar-fijo` no atomico (gimnasio-turnos L532-567), Edge Functions sin tests, fijos sin materializacion (es T6).
- Decisiones del writer A: fijos tambien saltean la regla de anticipacion; lock por socio con pg_advisory_xact_lock antes del lock de franja; el encargado NO puede reservar en franja ya empezada (abierto: confirmar); sin limites sembrados para Menor/Alicuota/Becado (= sin tope); `crear-fijo` valida tope de fijos pero no es atomico.
- Contratos de API: member `listar` -> {ok, desde, hasta, anticipacion_dias, limite_semanal, semanas[{desde, dias_usados}], dias[{fecha, dia_semana, franjas[{franja_id, hora_desde, hora_hasta, capacidad, ocupados, disponibles, cerrado, pasada, reservada, reserva_id}]}]}; `mis-reservas` -> {reservas[{reserva_id, franja_id, fecha, dia_semana, hora_desde, hora_hasta, origen, turno_fijo_id, cancelable}], fijos[{turno_fijo_id, franja_id, dia_semana, hora_desde, hora_hasta, faltas_consecutivas}]}.

- [x] T4 mobile 8d4dcd4, T5 web 89ad58f (writer B). Parent verifico: commits sin atribucion IA, tsc app (solo errores conocidos de socios.tsx) y web limpios; el writer reporta `next build` OK con /porteria/turnos. Nada se vio en simulador ni navegador; nada probado contra funciones desplegadas.
- Review nativa (T4-T5, medio, 1235 lineas, 1 lente reliability): APROBADA sin bloqueantes, autoridad quemada (lineage review-f4bb7c93506f7bc1). Frontera revisada = 89ad58f. Informativos: edgeFunction.ts no atrapa fetch que lanza (L16-29); useTurnos falla silenciosa en fijos (L93); carrera de respuestas viejas en Ocupacion (page.tsx L165-173); franjaId obsoleto en el form (L207); sin tests.
- Decisiones del writer B: reservar es un toque sin confirmacion; "Hacer turno fijo" aparece en cualquier franja no cerrada que no sea fija (aunque este completa); subcomision ve SidebarLector en /porteria/turnos; la tab bar de (socio) pasa a 6 iconos (revisar en pantalla chica).

- [x] T8 ajustes (writer C): f669ba6 backend + 553ceea UI. Parent verifico: commits sin atribucion IA; script SQL re-corrido en Postgres descartable: "TODAS LAS PRUEBAS PASARON" con 106 ok; tsc app (solo errores conocidos) y web limpios; sin residuos de limites/'encargado'/reserva-manual/tope_semanal. Edge Functions sin type-check (no hay deno).
- Review nativa (T8, medio, 1501 lineas): APROBADA sin bloqueantes, autoridad quemada (lineage review-5342d443c67086bb). Frontera revisada = 553ceea. Informativos: (a) `gimnasio_cancelar_por_cierre` solo bloquea franjas con reservas ya confirmadas: una reserva en vuelo puede colarse en una franja que se cierra justo en ese instante (ventana muy chica); (b) el fetch a Expo del cierre no tiene timeout: si Expo se cuelga, el cliente recibe error aunque las cancelaciones ya estan persistidas y un reintento no re-envia los avisos (REAL, conviene arreglar); (c) funciones del cierre sin tests; (d) migracion editada en sitio (correcto: nunca se aplico a ninguna base).
- Decisiones del writer C: se saco el advisory lock por socio (sin tope semanal ya no hace falta); cierre general no pisa franjas con excepcion propia; solo se cancelan reservas de franjas que no empezaron; push al perfil propio del socio, sin fallback al titular (menores de 13 no usan la app; 13-17 tienen perfil propio); cerrar un dia pasado se permite guardar pero no cancela ni avisa.

- Fix post-review 5e8f9c1: timeout de 8 s por chunk en el push de cierre (hallazgo b).

## Delivery log (2026-10-05)
- Backup previo: ~/backups-uncas/2026-10-05-15-46-57. Migracion 20261005000000 aplicada por Agus (`db push`); verificado por consulta: 5 tablas `gimnasio_*` con RLS, config {informativo, mes, 7, 70, 2, 3, 4, 15}, 0 franjas, `authenticated` NO puede ejecutar gimnasio_reservar y `service_role` si.
- Funciones desplegadas: gimnasio-turnos, gimnasio-turnos-admin (sin credenciales -> 401).
- Merge ff de feat/gimnasio-turnos a main y push (f4e73ae..5e8f9c1); Vercel: 3 proyectos success.
- NO desplegado: OTA mobile (pestana Turnos), a proposito, hasta que el encargado cargue franjas y se pruebe. Quedan T6 (turnos fijos automaticos) y T7 (Lector informativo).
- Pendiente: la rama fix/gimnasio-hallazgos-review (bce2e36, cambios en aviso-inactividad y useScanner) sigue sin mergear; al mergearla puede haber conflicto en useScanner.ts.

## Delivery log (2026-10-06): calendario + profesor
- Endurecimiento (e1018f5 + 11c5030): plan_hash en la importacion, EXCLUDE `gimnasio_franjas_sin_solape` (btree_gist + tsrange), validador del servidor en `_shared/calendario.ts` con check (26 casos), `npm run test:calendario` (31 casos). Parent verifico: SQL en Docker = 205 ok sin FALLO, tsc limpio. Review nativa (884 lineas, medio) APROBADA, lineage review-a18a75cd6addde54; informativos: hash incluye conteos volatiles de reservas (en `reemplazar` con mucha actividad el confirmar puede dar plan_cambio y hay que repetir la vista previa; arreglo: hashear solo lo estructural), mapeo 23P01 en la Edge sin test propio.
- Migracion 20261006000000 aplicada por Agus; verificado en prod por consulta: extension btree_gist, columna profesor text, constraint `gimnasio_franjas_sin_solape` con la definicion esperada, `gimnasio_importar_franjas(jsonb,text,boolean,text)` sin sobrecargas, authenticated/anon NO ejecutan, service_role si, 0 franjas.
- Funciones gimnasio-turnos-admin y gimnasio-turnos desplegadas (401 sin credenciales). Merge ff a main y push (5e8f9c1..11c5030); Vercel: 3 proyectos success.
- Cuenta del rol Gimnasio renombrada de "Jamon" a "Gimnasio" (profiles.nombre, 1 fila).
- NO desplegado: OTA (pestana Turnos y "Prof." en la app). Planilla para el encargado: ~/Downloads/Calendario_Gimnasio_plantilla.xlsx.
- Pendientes: T6 (turnos fijos automaticos), T7 (Lector informativo), merge de fix/gimnasio-hallazgos-review, hash estructural del plan, rotar CRON_SECRET/service_role.

## Delivery log (2026-10-07): turnos fijos automaticos
- Migracion 20261007000000 aplicada por Agus; verificado en prod por consulta: faltas_activas=false, faltas_activas_desde=null, aviso 2 / baja 3 / tolerancia 15 / semanas_fijos 4, trigger `gimnasio_config_faltas_desde` presente, RLS en gimnasio_faltas_eventos, 4 funciones (liberar_fijo, materializar_fijos, procesar_faltas, rachas) ejecutables solo por service_role, 0 crons de gimnasio, 0 fijos y 0 reservas.
- Funciones desplegadas: gimnasio-turnos-fijos (--no-verify-jwt, 401 sin cron secret), gimnasio-turnos y gimnasio-turnos-admin (401 sin credenciales).
- Merge ff a main y push (11c5030..77125cf); Vercel: 3 proyectos success.
- NO hecho a proposito: registrar el cron (bloque comentado al final de la migracion), prender el interruptor de faltas, OTA mobile.
- Pendiente: T7 (Lector informativo), OTA (pestana Turnos, profe, turnos fijos), cargar franjas reales, merge de fix/gimnasio-hallazgos-review, hash estructural del plan de importacion, rotar CRON_SECRET (expuesto en el chat) y service_role.

## Delivery log: integracion del Lector (T7)
- Migracion 20261008000000 aplicada por Agus; verificado en prod por consulta: accesos.sin_reserva boolean default false not null, los 252 accesos existentes en false, `gimnasio_turno_actual(uuid)` presente, authenticated/anon NO ejecutan y service_role si, prueba de la funcion = sin_franja (0 franjas, modo informativo).
- `socios-qr` desplegada DESPUES de la migracion (401 sin credenciales). Merge ff a main y push (77125cf..650509c); Vercel: 3 proyectos success.
- NO hecho: OTA (la tablet no muestra la linea de turno hasta el OTA; el backend ya registra sin_reserva). Sin probar en el gimnasio real.
- Turnero completo en produccion salvo OTA: T1-T9 + T6 + T7. Pendiente: OTA, cargar franjas reales, prender faltas/registrar cron cuando todos escaneen, decidir modo bloqueante, merge de fix/gimnasio-hallazgos-review, hash estructural del plan de importacion, rotar CRON_SECRET y service_role.

## Next step
(historico) Arreglar timeout del push de cierre (b) — hecho. Luego T6 (turnos fijos: materializacion, faltas, push, liberar) y T7 (Lector informativo). Deploy pendiente de decision de Agus: backend + web primero (solo lo ve el encargado), OTA despues de cargar franjas.
