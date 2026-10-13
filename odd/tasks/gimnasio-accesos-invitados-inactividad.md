# gimnasio-accesos-invitados-inactividad

## Objective
Mejorar el control de acceso al gimnasio antes del turnero: registrar los escaneos de socios sin servicio, permitir registrar invitados desde el Lector y avisar a quien tiene gimnasio y no va hace 20 dias.

## Problem / why
- Hoy el escaneo de un socio sin servicio Gimnasio devuelve el aviso pero NO inserta en `accesos`, asi que el panel web no lo ve.
- Un no-socio que va al gimnasio no se puede registrar; los entrenadores no pueden detectar repetidos para mandarlos a Secretaria.
- Socios que pagan gimnasio y no van no reciben ningun aviso.

## Scope (authorized)
1. Registrar en `accesos` el escaneo sin servicio (con flag `sin_servicio`), manteniendo el aviso; mostrarlo en el panel web de acceso.
2. Renombrar el label del rol Lector a "Gimnasio" (solo label; rol interno `porteria` intacto).
3. Invitados: accion en el Lector (DNI obligatorio, nombre opcional), listado en el panel con marca "Invitado" y contador de repeticiones.
4. Aviso por push a quien tiene cualquier servicio de gimnasio y no tiene accesos hace 20 dias (una vez por periodo de inactividad; menores -> titular).

## Constraints
- No ejecutar `supabase db push`, `supabase functions deploy` ni registrar crons: deploy a produccion lo confirma Agus aparte.
- Recordatorios solo por push (decision 2026-08-26), sin mail.
- Commits convencionales, sin atribucion de IA, un commit por work unit.
- No hay runner de tests en app/web/functions: sin RED/GREEN posible; checks = typecheck (`npx tsc --noEmit` en app y web) + revision estructural.

## Tasks
- [x] T1 sin_servicio: migracion `accesos.sin_servicio`, `registrarAcceso` antes del return en `handleValidate`/`handleValidateDni`, `listar-accesos` devuelve el flag, panel web con badge y columna CSV. Commit 0665c22
- [x] T2 label Gimnasio: renombrar label Lector -> Gimnasio en app y web (+ nota en CLAUDE.md). Commit 296f9b4
- [x] T3 invitados: migracion (socio_id nullable, es_invitado, invitado_dni, invitado_nombre, check, indice), accion `registrar-invitado`, boton en scanner, listado y repeticiones en panel. Commit 51bc750
- [x] T4 aviso inactividad: migracion `socios.aviso_inactividad_enviado_at`, Edge Function `aviso-inactividad-gimnasio`, bloque cron comentado (sin secreto real). Commit 727573e

## Route declaration
- Exploracion: delegada (mapeo de 4+ archivos, trigger de mapeo).
- Implementacion: un writer delegado (2+ archivos no triviales, trigger de escritura), en serie T1..T4.

## Delivery
Forecast ~400-600 lineas autoradas; estrategia `ask-on-risk`. Push/PR/merge: decision de Agus.

## Open / pending
- Deploy de migraciones y funciones a produccion (pedir confirmacion).
- Primera corrida del aviso de inactividad avisaria a casi todos los socios con gimnasio sin accesos en 20 dias: confirmar antes de registrar el cron.
- Turnero (cupos): pendiente, plan en memoria `plan/cupos-gimnasio`.

## Progress / evidence
- Ruta: exploracion delegada (mapper) + un writer delegado T1..T4 en serie.
- Verificado por el parent (2026-10-03): `git log` con los 4 commits, sin atribucion de IA; `npx tsc --noEmit` en web/ sin errores; en app/ solo 2 errores en `app/(secretaria)/socios.tsx` L112-113 (archivo NO tocado por los commits, preexistente).
- NO verificado: Edge Functions (no hay `deno` local), migraciones (solo lectura estructural), nada probado contra DB real ni en el gimnasio.
- Desvios del writer: `socio_servicios` no tiene columna `activo` (se filtra por `servicios_opcionales.activo`); errores de validacion de `registrar-invitado` devuelven HTTP 200 con `{ok:false, motivo}` porque `functions.invoke` oculta el body de los non-2xx.
- Quedan comentarios con "Lector" fuera de superficie (solo comentarios): `app/app/(cliente-gimnasio)/carnet.tsx:42`, `app/app.config.js:86`, `app/app/(porteria)/_layout.tsx:16`, comentarios en socios-qr.
- Review nativa (2026-10-03): consentida por Agus, tier medio (15 archivos, 776 lineas), 1 lente (reliability), APROBADA y autoridad quemada (lineage review-59bd064fedeb57dd). 9 hallazgos informativos no bloqueantes, a tratar como trabajo aparte: (1) push-ack: Expo puede devolver 200 con tickets fallidos y se marca `aviso_inactividad_enviado_at` igual; (2) titulares error tragado en aviso-inactividad (menores quedan como sin titular); (3) minor name fallback casi siempre generico; (4) error del chequeo "DNI es socio" ignorado en registrar-invitado (podria crear invitado de un socio real); (5) contarVecesInvitado devuelve 0 ante error; (6) ventana de 30 dias de veces_invitado anclada a now, no a la fecha vista; (7) deploy order: socios-qr escribe sin_servicio, desplegar DESPUES de la migracion 0; (8) enviarInvitado sin finally en scanner.tsx:91-98; (9) sin tests de seleccion de candidatos.

- Fix post-review (commit f4e73ae): hallazgos 1 (chequeo de DNI/socio), 2 (ack de push por ticket de Expo) y 3 (contador de invitados null ante error + ventana anclada a la fecha vista). Verificado por el parent: commit sin atribucion, tsc web limpio, tsc app sin errores nuevos, lectura del codigo de `enviarPush`. Sin deno: Edge Functions sin type-check. Pendientes informativos 4-9 (ver arriba) sin tocar, salvo el 5/6/7 ya cubiertos o anotados.
- Anotado por el writer, sin tocar: `registrarInvitado` en useScanner.ts no protege un `data` nulo; tokens muertos (DeviceNotRegistered) quedan en `push_tokens`.

## Delivery log (2026-10-03/04)
- Migraciones aplicadas a prod (Agus corrio `db push`), columnas verificadas por consulta. Backup previo: ~/backups-uncas/2026-10-03-18-59-35.
- Edge Functions desplegadas por Agus: socios-qr, aviso-inactividad-gimnasio (cron NO registrado, decision de Agus). Dry-run: 270 con gimnasio, 146 inactivos, 111 destinatarios, 25 con push token.
- 2026-10-04: merge ff a main + push (4cf7f64..f4e73ae); Vercel: 3 proyectos con status success sobre f4e73ae. OTA publicado: canal production, runtime 1.0.7, update group 70e38848-d0b7-4dde-8cf8-043bf4a8c7f5.
- Pendiente: probar en el gimnasio (tablet debe cerrar y reabrir la app para tomar el OTA); rotar CRON_SECRET (expuesto en el chat) y service_role; decidir cuando registrar el cron.

## Next step (historico, ya ejecutado salvo cron)
1) Aplicar migraciones 20261003000000..02 a produccion (pedir OK de Agus; backup antes: `node scripts/backup-supabase.mjs`). 2) Deploy de `socios-qr` y `aviso-inactividad-gimnasio` DESPUES de las migraciones. 3) Correr el aviso en `dry_run` y revisar la muestra antes de registrar el cron. 4) OTA mobile (scanner: label + invitado).
