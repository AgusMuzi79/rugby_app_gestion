# Tasks: Socio como base — Multi-rol, Calendario y Comunicaciones

## FASE 1 — Socio como base + Multi-rol

### T1.1 — Migración: profiles.roles[] + jugadores.socio_id + divisiones.deporte
- [ ] Crear migración `20260616000000_multrol_y_calendario.sql`
- [ ] `ALTER TABLE profiles ADD COLUMN roles TEXT[]` con DEFAULT ARRAY[rol] y constraint
- [ ] `ALTER TABLE jugadores ADD COLUMN socio_id UUID REFERENCES socios(id)`
- [ ] `ALTER TABLE divisiones ADD COLUMN deporte TEXT DEFAULT 'rugby'` con constraint
- [ ] Aplicar migración en cloud con `supabase db push`
- [ ] Actualizar `database.types.ts` (regenerar o editar manualmente)

### T1.2 — authStore: roles + rolActivo
- [ ] Agregar `roles: string[]` y `rolActivo: string` al store
- [ ] Agregar `setRolActivo(rol: string)` → UPDATE profiles.rol + navigate
- [ ] En `useLogin`: fetch `profiles.roles` además de `rol`, inicializar `rolActivo = rol`
- [ ] En `_layout.tsx`: usar `rolActivo` en lugar de `rol` para el routing (sin cambios de lógica)

### T1.3 — SobreScreen: selector de rol
- [ ] En `SobreScreen`, mostrar sección "VISTA ACTIVA" solo si `roles.length > 1`
- [ ] Renderizar un botón por rol disponible, destacar el activo
- [ ] Al tocar: llamar `setRolActivo(nuevoRol)` → UPDATE DB + navigate

### T1.4 — Flujo de creación de staff desde socio existente
- [ ] `admin-usuarios` acción `assign-role`: recibe `socio_id` + `nuevo_rol`
  - Verifica que el socio existe y tiene profile_id
  - UPDATE profiles SET roles = array_append(roles, nuevo_rol), rol = nuevo_rol
  - Setea contraseña inicial = DNI (misma lógica que create)
- [ ] `usuarios.tsx` (subcomisión): agregar botón "Asignar rol de staff" que busca por DNI/nombre en socios
- [ ] Buscar socios desde el modal de creación de usuario (en lugar de crear desde cero)

### T1.5 — jugadores.socio_id: setear al fichar
- [ ] En `useFichajes`: al crear jugador, buscar socio por DNI y setear `socio_id` si existe
- [ ] En `admin-socios` (si aplica): al crear socio, buscar jugador por DNI y setear `socio_id`

---

## FASE 2 — Calendario y Comunicaciones

### T2.1 — Migración: noticias.audiencia + division_id + generada_automaticamente
- [ ] Crear migración `20260616000001_noticias_audiencia.sql`
- [ ] `ALTER TABLE noticias ADD COLUMN audiencia TEXT DEFAULT 'todos'` con constraint
- [ ] `ALTER TABLE noticias ADD COLUMN division_id UUID REFERENCES divisiones(id)`
- [ ] `ALTER TABLE noticias ADD COLUMN generada_automaticamente BOOLEAN DEFAULT false`
- [ ] Actualizar RLS de noticias para socios (ver design.md)
- [ ] Aplicar en cloud

### T2.2 — Seed: divisiones con deporte
- [ ] Actualizar divisiones existentes en cloud con su deporte correcto (rugby por default ya está)
- [ ] Agregar deporte al formulario de crear división en web (`/divisiones`)

### T2.3 — Cancelación con mensaje (coordinador)
- [ ] En `useCalendario`: cambiar `cancelarEvento(id)` a `cancelarEvento(id, mensaje: string)`
- [ ] Al cancelar: INSERT en `noticias` con audiencia='todos', division_id, generada_automaticamente=true
- [ ] Al cancelar: llamar Edge Function `notifications` con tipo `cancelacion_entrenamiento`
- [ ] En `(coordinador)/calendario.tsx`: modal de confirmación con campo de texto para el motivo
- [ ] En Edge Function `notifications`: agregar tipo `cancelacion_entrenamiento`
  - Query: jugadores de esa división → socios → profiles → push_tokens
  - Enviar push a todos los tokens encontrados

### T2.4 — useCalendarioSocio hook
- [ ] Crear `app/hooks/useCalendarioSocio.ts`
- [ ] Query 1: detectar si el socio es jugador (JOIN por DNI → division_id)
- [ ] Query 2: próximos partidos (todos, filtrable por deporte)
- [ ] Query 3: resultados recientes (últimos 30 días)
- [ ] Retornar: `{ jugadorDivision, partidos, resultados, loading, error, filtroDeporte, setFiltroDeporte }`

### T2.5 — (socio)/calendario.tsx
- [ ] Crear pantalla `app/app/(socio)/calendario.tsx`
- [ ] Chips de filtro por deporte: TODOS / RUGBY / HOCKEY / TENIS
- [ ] Si es jugador: banner "Tu próximo partido" con su división destacada
- [ ] Lista de próximos partidos: fecha, hora, rival, lugar, división
- [ ] Sección resultados recientes con marcador
- [ ] Estilos con StyleSheet.create + colores del theme

### T2.6 — Agregar tab Calendario a (socio)/_layout.tsx
- [ ] Agregar tab `calendar` en `(socio)/_layout.tsx` entre noticias y sobre
- [ ] Ícono: Feather `calendar`
- [ ] href: `/(socio)/calendario`

### T2.7 — Selector de audiencia en noticias (subcomisión)
- [ ] En `(subcomision)/notificaciones.tsx`: agregar selector audiencia al modal nueva noticia
  - Dos opciones: "Todos" (default) / "Solo cuerpo técnico"
- [ ] Pasar `audiencia` al INSERT de noticias

### T2.8 — Selector de audiencia en web secretaría / noticias
- [ ] En `web/.../noticias/page.tsx`: agregar campo audiencia al modal de nueva noticia
- [ ] Dos opciones: "Todos" / "Solo cuerpo técnico"
- [ ] Pasar `audiencia` en el body del INSERT a Supabase

### T2.9 — useNoticias: filtrar por audiencia y rol activo
- [ ] En `useNoticias(soloPublicadas)`: ajustar query para que RLS maneje el filtro
- [ ] Para rol socio: RLS ya filtra (ver T2.1) — no hay cambio en el hook
- [ ] Para roles staff: mostrar noticias con audiencia='todos' Y audiencia='cuerpo_tecnico'
- [ ] Para secretaría/portería: no mostrar noticias (ya excluidas por RLS)

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
