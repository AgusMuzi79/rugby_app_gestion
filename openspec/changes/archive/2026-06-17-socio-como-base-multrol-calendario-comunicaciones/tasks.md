# Tasks: Socio como base — Multi-rol, Calendario y Comunicaciones

## FASE 1 — Socio como base + Multi-rol

### T1.1 — Migración: profiles.roles[] + jugadores.socio_id + divisiones.deporte
- [x] Crear migración `20260616000000_multrol_y_calendario.sql`
- [x] `ALTER TABLE profiles ADD COLUMN roles TEXT[]` con DEFAULT ARRAY[rol] y constraint
- [x] `ALTER TABLE jugadores ADD COLUMN socio_id UUID REFERENCES socios(id)`
- [x] `ALTER TABLE divisiones ADD COLUMN deporte TEXT DEFAULT 'rugby'` con constraint
- [x] Aplicar migración en cloud con `supabase db push`
- [x] Actualizar `database.types.ts` (regenerado con `supabase gen types typescript --linked`)

### T1.2 — authStore: roles + rolActivo
- [x] Agregar `roles: string[]` y `rolActivo: string` al store
- [x] Agregar `setRolActivo(rol: string)` → UPDATE profiles.rol + navigate
- [x] En `useLogin`: fetch `profiles.roles` además de `rol`, inicializar `rolActivo = rol`
- [x] En `_layout.tsx`: usar `rolActivo` en lugar de `rol` para el routing (sin cambios de lógica)

### T1.3 — SobreScreen: selector de rol
- [x] En `SobreScreen`, mostrar sección "VISTA ACTIVA" solo si `roles.length > 1`
- [x] Renderizar un botón por rol disponible, destacar el activo
- [x] Al tocar: llamar `setRolActivo(nuevoRol)` → UPDATE DB + navigate

### T1.4 — Flujo de creación de staff desde socio existente
- [x] `admin-usuarios` acción `assign-role`: recibe `socio_id` + `nuevo_rol`
  - Verifica que el socio existe y tiene profile_id
  - UPDATE profiles SET roles = array_append(roles, nuevo_rol), rol = nuevo_rol
  - Setea contraseña inicial = DNI (misma lógica que create)
- [x] `usuarios.tsx` (subcomisión): toggle en modal "Desde socio existente" / "Nuevo usuario"
- [x] Buscar socios desde el modal por DNI → seleccionar rol → asignar

### T1.5 — jugadores.socio_id: setear al fichar
- [x] En `useFichajes`: al crear jugador, buscar socio por DNI y setear `socio_id` si existe
- [ ] En `admin-socios` (si aplica): al crear socio, buscar jugador por DNI y setear `socio_id`

---

## FASE 2 — Calendario y Comunicaciones

### T2.1 — Migración: noticias.audiencia + division_id + generada_automaticamente
- [x] Crear migración `20260616000001_noticias_audiencia.sql`
- [x] `ALTER TABLE noticias ADD COLUMN audiencia TEXT DEFAULT 'todos'` con constraint
- [x] `ALTER TABLE noticias ADD COLUMN division_id UUID REFERENCES divisiones(id)`
- [x] `ALTER TABLE noticias ADD COLUMN generada_automaticamente BOOLEAN DEFAULT false`
- [x] Actualizar RLS de noticias para socios (ver design.md)
- [x] Aplicar en cloud

### T2.2 — Seed: divisiones con deporte
- [x] Actualizar divisiones existentes en cloud con su deporte correcto (rugby por default ya está)
- [x] Agregar deporte al formulario de crear división en web (`/divisiones`)

### T2.3 — Cancelación con mensaje (coordinador)
- [x] En `useCalendario`: agregar `cancelarEvento(id, divisionId, divisionNombre, fecha, mensaje)`
- [x] Al cancelar: INSERT en `noticias` con audiencia='todos', division_id, generada_automaticamente=true
- [x] Al cancelar: llamar Edge Function `notifications` con tipo `cancelacion_entrenamiento`
- [x] En `(coordinador)/calendario.tsx`: botón ✕ por fila + modal con campo de texto para el motivo
- [x] En Edge Function `notifications`: agregar tipo `cancelacion_entrenamiento`
  - Query: jugadores de esa división → socios → profiles → push_tokens
  - Enviar push a todos los tokens encontrados

### T2.4 — useCalendarioSocio hook
- [x] Crear `app/hooks/useCalendarioSocio.ts`
- [x] Query 1: detectar si el socio es jugador (JOIN por DNI → division_id)
- [x] Query 2: próximos partidos (todos, filtrable por deporte)
- [x] Query 3: resultados recientes (últimos 30 días)
- [x] Retornar: `{ jugadorDivisionId, jugadorDivisionNombre, partidos, resultados, loading, error, filtroDeporte, setFiltroDeporte }`
- [x] Migration `20260616000002_socio_calendar_rls.sql`: socios pueden leer eventos + resultados

### T2.5 — (socio)/calendario.tsx
- [x] Crear pantalla `app/app/(socio)/calendario.tsx`
- [x] Chips de filtro por deporte: TODOS / RUGBY / HOCKEY / TENIS
- [x] Si es jugador: banner "Jugás en [división]" con card destacada en dorado
- [x] Lista de próximos partidos: fecha, hora, rival, lugar, división
- [x] Sección resultados recientes con marcador y color (verde/rojo)
- [x] Estilos con StyleSheet.create + colores del theme

### T2.6 — Agregar tab Calendario a (socio)/_layout.tsx
- [x] Agregar tab `calendar` en `(socio)/_layout.tsx` entre noticias y sobre
- [x] Ícono: Feather `calendar`

### T2.7 — Selector de audiencia en noticias (subcomisión)
- [x] En `(subcomision)/notificaciones.tsx`: agregar toggle "TODOS" / "CUERPO TÉCNICO"
- [x] Publicar noticia en `noticias` table con `audiencia` al enviar notificación
- [x] Export `AudienciaNoticia` type desde `useNotificaciones`

### T2.8 — Selector de audiencia en web secretaría / noticias
- [x] En `web/.../noticias/page.tsx`: agregar campo audiencia al modal de nueva noticia
- [x] Dos opciones: "TODOS" / "CUERPO TÉCNICO" con descripción contextual
- [x] Pasar `audiencia` en el body del INSERT a Supabase

### T2.9 — useNoticias: filtrar por audiencia y rol activo
- [x] RLS ya maneja el filtro completamente (no changes needed in hook)
- [x] Para rol socio: `noticias_select_socio` policy filtra `audiencia='todos'` y `publicada=true`
- [x] Para roles staff: `noticias_select_cuerpo_tecnico` muestra ambas audiencias (publicadas)
- [x] Para secretaría/portería: `noticias_select_staff` (secretaria ve todo), portería sin acceso

---

## Orden de implementación sugerido

```
T1.1 → T1.2 → T1.3   (multi-rol: schema + store + UI)
T1.4                   (flujo creación staff desde socio)
T1.5                   (link jugadores ↔ socios al fichar)
T2.1 → T2.2           (schema comunicaciones + seed deportes)
T2.3                   (cancelación con mensaje — mayor impacto inmediato)
T2.4 → T2.5 → T2.6   (calendario socio)
T2.7 → T2.8 → T2.9   (audiencia noticias)
```

## Migraciones a crear

| Archivo | Contenido |
|---|---|
| `20260616000000_multrol_y_calendario.sql` | profiles.roles[], jugadores.socio_id, divisiones.deporte |
| `20260616000001_noticias_audiencia.sql` | noticias.audiencia, division_id, generada_automaticamente + RLS |
