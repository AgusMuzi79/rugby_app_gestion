# Proposal: Importador mensual de socios (reemplaza el alta manual)

## Problema

1. **El padrón de socios se desactualiza a mano.** Hoy secretaría da de alta cada socio individualmente desde `web/(secretaria)/secretaria/socios/page.tsx` ("+ NUEVO SOCIO"). No hay ningún flujo para reflejar en bloque los cambios reales del club: altas nuevas, bajas, cambios de categoría o de servicios contratados. El padrón real vive en NUVIX; la app queda atrás hasta que alguien lo actualiza a mano, socio por socio.
2. **Las bajas no se reflejan nunca.** Un socio que deja el club sigue `activo`/`pendiente` en la app indefinidamente — sigue pudiendo loguearse, aparece en listados, cuenta para el semáforo de morosidad y para el envío de recordatorios de deuda por mail (ver `supabase/functions/importar-deuda/index.ts`).
3. **Servicios y categoría de liquidación también se desactualizan.** La reconciliación de agosto (`openspec/changes/archive/2026-08-05-actualizar-servicios-socios/`) corrigió esto una vez, a mano, con un script (`scripts/reconciliar-servicios-socios.mjs`) corrido manualmente contra 3 CSV. No hay manera de que eso se mantenga al día mes a mes sin repetir el proceso manual completo.

## Solución

Un importador mensual, con el mismo patrón que el importador de deuda ya en producción (`supabase/functions/importar-deuda/index.ts` + `web/app/(secretaria)/secretaria/deuda/page.tsx`): secretaría sube un archivo Excel del padrón general de NUVIX una vez al mes desde el panel web. El importador:

- **Da de alta** a todo `numero_socio` nuevo que aparece en el archivo (auth user + profile + socio), con las mismas reglas de síntesis que ya usa `scripts/import-socios-masivo.mjs` para datos faltantes/inválidos (DNI → `SD{código}`, email → `socio-{código}@uncas.local`, contraseña inicial = DNI).
- **Da de baja** (`estado='inactivo'` + bloqueo de login, nunca hard-delete) a todo socio `activo`/`pendiente` cuyo `numero_socio` ya no aparece en el archivo — mismo mecanismo que ya usa "Desactivar socio" en `admin-socios/index.ts` (`ban_duration: '876000h'`).
- **Actualiza** categoría de liquidación y servicios opcionales contratados de los socios que siguen — misma lógica que `scripts/reconciliar-servicios-socios.mjs`, pero corrida automáticamente en cada import en vez de a mano.
- **Reemplaza el alta manual**: se saca "+ NUEVO SOCIO" del panel de secretaría. Toda alta pasa por este import.

## ⚠️ Riesgo central de esta change — en resolución con el club (2026-08-21)

El diseño de arriba asume que el import mensual trae, por cada socio, la **categoría de liquidación** y el **detalle de servicios contratados con su importe** (lo mismo que hoy exige `reconciliar-servicios-socios.mjs`, que en agosto vino de **3 archivos distintos**: `socios_activos_maestra.csv` (categoría de liquidación), `socios_servicios.csv` (un renglón por socio+servicio+importe), `precios_conceptos.csv`). El padrón "Tabla de datos.txt" original (52 columnas, una fila por socio) **no** traía nivel de detalle por servicio — de ahí que en la carga original hiciera falta cruzar un archivo aparte.

**Actualización (2026-08-21, Agus hablando en vivo con el club):** en vez de un único Excel, se está definiendo **importar 2 archivos**:
1. **Padrón de socios** (vigentes) — altas/bajas/datos básicos. Filtrado a la población "socios" de NUVIX, separado de "cesantes" y "clientes gym" (ver design.md §1).
2. **Padrón de servicios por socio** — ya hay un archivo de muestra real (`padronserviciossocios_uncas.xls`), validado contra producción: 1517 de 1529 socios activos matchean por `numero_socio`, y trae la granularidad de servicio+categoría que hacía falta (ver design.md §1/§5). Resuelve por sí solo el problema de servicios/categoría de liquidación — el riesgo que sigue abierto es que el club todavía no lo exportó filtrado a vigentes (la muestra vino histórica).

Con los 2 archivos separados, cada uno resuelve una parte: el padrón de socios da altas/bajas, el de servicios da categoría+servicios de los que siguen activos. Detalle completo y decisiones en curso en design.md §1/§10.

## Riesgo encontrado durante esta propuesta (no documentado antes)

**12 socios fueron dados de alta a mano después de la carga masiva** (`socios_numero_seq` en 12, 2 de ellos `activo`/`pendiente` con `created_at` posterior al 2026-07-31 al momento de escribir esto — el resto probablemente ya inactivos o corregidos). Su `numero_socio` es un correlativo de 4 dígitos generado por `lpad(nextval('socios_numero_seq'), 4, '0')` — **no es un código NUVIX real**, así que nunca va a matchear contra el archivo mensual. Sin un paso de reconciliación previo, la **primera corrida de este importador los marcaría como baja** (no aparecen en el archivo) aunque sigan siendo socios activos reales. Ver design.md §4 y tasks.md T0 — hace falta identificarlos y resolver su `numero_socio` real (o excluirlos explícitamente) **antes** de la primera corrida en producción.

## Alcance de esta change

- **1 migración**: columna(s) de auditoría en `socios` (ver design.md — ej. `dado_de_baja_en_importacion_id` o similar para trazabilidad de cuándo/por qué import se dio de baja a alguien) + función Postgres `SECURITY DEFINER` transaccional para el paso de escritura en bloque (mismo patrón que `importar_deuda_nuvix`).
- **1 Edge Function nueva**: `importar-socios` (`verify_jwt` activo, rol `secretaria`/`admin`) — parsea el Excel, calcula el diff completo (altas/bajas/cambios de categoría/cambios de servicios) contra el estado actual, y sólo si todo es coherente lo aplica.
- **1 página web nueva**: `web/app/(secretaria)/secretaria/socios-import/page.tsx` (o ruta similar) — subida de archivo, preview del diff antes de confirmar, resultado del import, historial.
- **Remoción de UI**: sacar el modal "+ NUEVO SOCIO" (creación manual) de `web/app/(secretaria)/secretaria/socios/page.tsx`.

## No incluye

- **No vuelve a cruzar contra la UAR** (`Jugadores.xls`). El vínculo jugador↔división (`jugadores.division_id`, `fichado_temporada_actual`) no se toca en esta change — sigue siendo un proceso aparte, fuera de este alcance.
- **No hay reingreso automático diseñado todavía** — qué pasa si alguien dado de baja por este importador vuelve a aparecer en un archivo futuro es una pregunta abierta (design.md §6), no una decisión tomada.
- **No se modifica el mecanismo de "Desactivar socio"/"Reactivar socio" manual ya existente** en el panel — sigue disponible para secretaría, en paralelo al import automático.
- **No se toca el importador de deuda ni el de servicios/categoría de agosto** — son procesos independientes; esta change no los fusiona, aunque reutiliza su lógica.

## Impacto esperado

- Secretaría deja de cargar socios uno por uno — un archivo por mes mantiene altas, bajas, categoría y servicios al día.
- Bajas reales dejan de acumularse como cuentas activas fantasma (login vigente, cuentan para deuda/semáforo, reciben recordatorios de mail).
- Mismo nivel de confianza que ya se ganó con servicios/categoría en agosto, pero sin depender de correr un script a mano cada vez.
