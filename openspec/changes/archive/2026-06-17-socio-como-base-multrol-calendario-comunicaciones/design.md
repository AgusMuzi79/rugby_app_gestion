# Design: Socio como base — Multi-rol, Calendario y Comunicaciones

## Fase 1 — Socio como base + Multi-rol

### Schema

#### `profiles` — roles como array

```sql
-- Agregar columna roles[] manteniendo rol para compatibilidad temporal
ALTER TABLE profiles ADD COLUMN roles TEXT[] NOT NULL DEFAULT ARRAY[rol];

-- Constraint: cada elemento de roles debe ser válido
ALTER TABLE profiles ADD CONSTRAINT profiles_roles_check
  CHECK (roles <@ ARRAY['subcomision','coordinador','entrenador','manager',
                         'admin','secretaria','porteria','socio']);

-- rol sigue existiendo como "rol activo" — se actualiza al switchear
-- (simplifica RLS que ya dependen de get_rol())
```

El campo `rol` pasa a representar el **rol activo en este momento**. `roles[]` es el conjunto completo de roles disponibles para esa persona.

#### `jugadores` — link a socios

```sql
ALTER TABLE jugadores ADD COLUMN socio_id UUID REFERENCES socios(id);
-- nullable: se setea cuando el jugador ya tiene carnet
-- se establece en el momento del fichaje si el DNI coincide con un socio
```

### Flujo de creación — nuevo miembro con rol de staff

```
ANTES:  Subco crea usuario staff desde "Usuarios" → solo rol staff
AHORA:  1. Secretaría crea socio (como siempre)
        2. Subco va a "Usuarios", busca al socio por nombre/DNI
        3. Asigna rol de staff → se agrega a profiles.roles[]
        4. profiles.rol se setea al rol de staff (rol primario)
```

En `admin-usuarios` acción `create`:
- Si se recibe `socio_id` en el payload → el usuario YA existe como socio
- Se agrega el nuevo rol a `roles[]` sin crear un nuevo auth.users
- Si no hay `socio_id` → flujo de creación normal (solo para casos excepcionales)

### Multi-rol en la app

#### `authStore` (Zustand)

```ts
// Campos nuevos
roles: string[]          // ['socio', 'entrenador']
rolActivo: string        // 'entrenador' — sincronizado con profiles.rol en DB

setRolActivo: (rol: string) => void
// → UPDATE profiles SET rol = $rolActivo WHERE id = auth.uid()
// → navega al tab root del nuevo rol
```

#### `_layout.tsx` — routing por rolActivo

```
rolActivo === 'socio'        → /(socio)/
rolActivo === 'entrenador'   → /(entrenador)/
rolActivo === 'coordinador'  → /(coordinador)/
...etc (sin cambios en lógica, solo usa rolActivo en lugar de rol)
```

#### `SobreScreen` — selector de rol

Visible solo si `roles.length > 1`:

```
VISTA ACTIVA
┌─────────────┐  ┌──────────────┐
│   SOCIO     │  │  ENTRENADOR  │   ← botones, uno por rol disponible
└─────────────┘  └──────────────┘
  (activo)
```

Al tocar otro rol:
1. `setRolActivo(nuevoRol)`
2. UPDATE `profiles.rol` en Supabase
3. `router.replace('/(nuevoRol)/diario')` o la tab root correspondiente

---

## Fase 2 — Calendario y Comunicaciones

### Schema

#### `divisiones` — deporte

```sql
ALTER TABLE divisiones
  ADD COLUMN deporte TEXT NOT NULL DEFAULT 'rugby'
  CHECK (deporte IN ('rugby', 'hockey', 'tenis'));
```

#### `noticias` — audiencia y división

```sql
ALTER TABLE noticias
  ADD COLUMN audiencia TEXT NOT NULL DEFAULT 'todos'
  CHECK (audiencia IN ('todos', 'cuerpo_tecnico'));

ALTER TABLE noticias
  ADD COLUMN division_id UUID REFERENCES divisiones(id);
-- null = aplica a todos; not null = solo socios jugadores de esa división
```

Visibilidad resultante:

| audiencia | division_id | Quién la ve |
|---|---|---|
| `todos` | null | Socios + cuerpo técnico (no secretaría, no portería) |
| `cuerpo_tecnico` | null | Solo coordinador/entrenador/manager/subcomisión |
| `todos` | `uuid` | Socios jugadores de esa división + cuerpo técnico |

#### RLS `noticias` — política de lectura para socios

```sql
-- Socio ve noticias si:
-- a) publicada = true AND audiencia = 'todos' AND division_id IS NULL
-- b) publicada = true AND audiencia = 'todos' AND es jugador de esa división
CREATE POLICY "socios_leen_noticias" ON noticias
  FOR SELECT USING (
    publicada = true
    AND audiencia = 'todos'
    AND (
      division_id IS NULL
      OR division_id IN (
        SELECT j.division_id FROM jugadores j
        JOIN socios s ON s.dni = j.dni
        WHERE s.profile_id = auth.uid()
      )
    )
    AND (select get_rol()) IN ('socio', 'coordinador', 'entrenador', 'manager', 'subcomision', 'admin')
  );
```

### Cancelación con mensaje — flujo completo

```
useCalendario → cancelarEvento(eventoId, mensaje)
    │
    ├── UPDATE eventos SET cancelado = true
    │
    └── INSERT INTO noticias:
          titulo   = "⚠ Entrenamiento cancelado — {division.nombre}"
          mensaje  = {mensaje del coordinador}
          audiencia = 'todos'
          division_id = {evento.division_id}
          publicada = true
          autor_id = {coordinador.id}
          generada_automaticamente = true   ← columna nueva
    │
    └── POST /functions/v1/notifications
          tipo = 'cancelacion_entrenamiento'
          division_id = {evento.division_id}
          titulo + mensaje
          → busca push_tokens de socios jugadores de esa división
```

En la Edge Function `notifications`, nuevo tipo `cancelacion_entrenamiento`:

```ts
// Obtener socios jugadores de la división
const { data: jugadores } = await supabaseAdmin
  .from('jugadores')
  .select('socios!inner(profile_id, push_tokens!inner(token))')
  .eq('division_id', divisionId)
  .eq('activo', true)
  .not('socios.profile_id', 'is', null)
```

### Calendario del socio

#### `useCalendarioSocio` hook

```ts
// 1. Detectar si el socio es jugador
const { data: jugador } = await supabase
  .from('jugadores')
  .select('division_id, posicion, divisiones(nombre, deporte)')
  .eq('dni', socio.dni)
  .maybeSingle()

// 2. Próximos partidos — todos (fixture general)
const { data: partidos } = await supabase
  .from('eventos')
  .select('*, divisiones(nombre, deporte)')
  .eq('tipo', 'partido')
  .eq('cancelado', false)
  .gte('fecha', hoy)
  .order('fecha')

// 3. Resultados recientes (últimos 30 días)
const { data: resultados } = await supabase
  .from('resultados')
  .select('*, eventos!inner(fecha, rival, divisiones(nombre, deporte))')
  .gte('eventos.fecha', hace30dias)
  .order('eventos.fecha', { ascending: false })
```

#### Tab `(socio)/calendario.tsx`

- Filtro por deporte: `rugby | hockey | tenis | todos` (chips horizontales)
- Si el socio es jugador: banner superior "Tu próximo partido — [división]"
- Lista de próximos partidos con fecha, hora, rival, cancha
- Sección resultados recientes con marcadores
- Cancelaciones de entrenamientos aparecen en el feed de noticias (no en el calendario)

### Selector de audiencia en noticias (subco + web secretaría)

En `(subcomision)/notificaciones.tsx` y en `web/.../noticias/page.tsx`:

```
Al publicar noticia:
  ○ Todos  (socios + cuerpo técnico)        ← default
  ○ Solo cuerpo técnico
```

Campo `audiencia` se envía en el INSERT. No hay UI para `division_id` desde subcomisión — eso solo se setea automáticamente en cancelaciones.

---

## Dependencias entre fases

La Fase 2 puede implementarse sin esperar que la Fase 1 esté 100% completa, excepto por un punto: el calendario del socio necesita que `rolActivo` funcione en `authStore` para que el socio que también es entrenador pueda switchear y ver el calendario. Las notificaciones de cancelación y el fixture general pueden ir antes.
