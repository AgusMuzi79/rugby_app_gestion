-- Migration: 20260506000000_init_schema
-- App de Gestión Operativa del Club de Rugby
-- Schema inicial completo: tablas, relaciones, helper functions, RLS habilitado e índices.
-- Políticas RLS en migración separada.

-- ============================================================
-- EXTENSIONES
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- FUNCIÓN updated_at (trigger reutilizable)
-- ============================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- DIVISIONES
-- Las 17 divisiones/planteles activos del club.
-- categoria determina si se registran resultados (solo juvenil en adelante).
-- ============================================================

create table divisiones (
  id          uuid        default gen_random_uuid() primary key,
  nombre      text        not null,
  categoria   text        not null check (categoria in ('infantil', 'juvenil', 'superior', 'femenino', 'mixed')),
  activa      boolean     not null default true,
  created_at  timestamptz not null default now()
);


-- ============================================================
-- PROFILES
-- Extiende auth.users con rol y divisiones asignadas.
-- divisiones = null → acceso global (subcomisión).
-- divisiones = uuid[] → solo esas divisiones (coordinador/entrenador/manager).
-- ============================================================

create table profiles (
  id          uuid        references auth.users(id) on delete cascade primary key,
  rol         text        not null check (rol in ('subcomision', 'coordinador', 'entrenador', 'manager')),
  nombre      text        not null,
  divisiones  uuid[]      default null,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();


-- ============================================================
-- HELPER FUNCTIONS PARA RLS
-- security definer + stable → el optimizador las cachea por query (initPlan).
-- Siempre llamarlas con (select fn()) en las políticas, nunca fn() directo.
-- ============================================================

-- Retorna el rol del usuario autenticado actual.
create or replace function get_rol()
returns text
language sql
security definer
stable
as $$
  select rol from profiles where id = auth.uid()
$$;

-- Retorna true si el usuario tiene acceso a la división dada.
-- null en divisiones = acceso total (subcomisión).
create or replace function tiene_acceso_division(p_division_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select
    divisiones is null
    or p_division_id = any(divisiones)
  from profiles
  where id = auth.uid()
$$;


-- ============================================================
-- PUSH TOKENS
-- Un usuario puede tener múltiples dispositivos (tokens Expo).
-- ============================================================

create table push_tokens (
  id          uuid        default gen_random_uuid() primary key,
  usuario_id  uuid        not null references profiles(id) on delete cascade,
  token       text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger push_tokens_updated_at
  before update on push_tokens
  for each row execute function set_updated_at();


-- ============================================================
-- JUGADORES
-- Entidad central. Se crea al registrar un fichaje.
-- ============================================================

create table jugadores (
  id               uuid        default gen_random_uuid() primary key,
  nombre_completo  text        not null,
  dni              text        not null,
  fecha_nacimiento date        not null,
  division_id      uuid        not null references divisiones(id),
  activo           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- un jugador no puede estar fichado dos veces en la misma división
  unique (dni, division_id)
);

create trigger jugadores_updated_at
  before update on jugadores
  for each row execute function set_updated_at();


-- ============================================================
-- FICHAJES
-- Acto de registrar un jugador. El manager lo crea con autoridad directa.
-- ============================================================

create table fichajes (
  id             uuid        default gen_random_uuid() primary key,
  jugador_id     uuid        not null references jugadores(id) on delete cascade,
  fecha_fichaje  date        not null default current_date,
  registrado_por uuid        not null references profiles(id),
  created_at     timestamptz not null default now()
);

create table documentos_fichaje (
  id             uuid        default gen_random_uuid() primary key,
  fichaje_id     uuid        not null references fichajes(id) on delete cascade,
  tipo           text        not null check (tipo in ('dni', 'ficha_medica', 'otro')),
  storage_path   text        not null,   -- path en bucket 'fichajes' de Supabase Storage
  nombre_archivo text,
  created_at     timestamptz not null default now()
);


-- ============================================================
-- EVENTOS (calendario)
-- Cubre entrenamientos y partidos. Solo partidos tienen rival/resultado/mesa.
-- ============================================================

create table eventos (
  id          uuid        default gen_random_uuid() primary key,
  tipo        text        not null check (tipo in ('entrenamiento', 'partido')),
  division_id uuid        not null references divisiones(id),
  fecha       date        not null,
  hora        time,
  lugar       text,
  rival       text,        -- solo para tipo = 'partido'
  creado_por  uuid        not null references profiles(id),
  cancelado   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger eventos_updated_at
  before update on eventos
  for each row execute function set_updated_at();


-- ============================================================
-- ASISTENCIAS
-- division_id desnormalizado desde eventos para simplificar RLS
-- sin joins en las políticas.
-- ============================================================

create table asistencias (
  id             uuid        default gen_random_uuid() primary key,
  evento_id      uuid        not null references eventos(id) on delete cascade,
  jugador_id     uuid        not null references jugadores(id),
  division_id    uuid        not null references divisiones(id),  -- desnormalizado de evento
  estado         text        not null check (estado in ('presente', 'ausente', 'justificado')),
  registrado_por uuid        not null references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (evento_id, jugador_id)
);

create trigger asistencias_updated_at
  before update on asistencias
  for each row execute function set_updated_at();


-- ============================================================
-- MESA DE PARTIDO
-- Una mesa por partido. Jugadores con su rol en el encuentro.
-- ============================================================

create table mesas_de_partido (
  id         uuid        default gen_random_uuid() primary key,
  evento_id  uuid        not null references eventos(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evento_id)
);

create trigger mesas_de_partido_updated_at
  before update on mesas_de_partido
  for each row execute function set_updated_at();

create table mesa_jugadores (
  id           uuid  default gen_random_uuid() primary key,
  mesa_id      uuid  not null references mesas_de_partido(id) on delete cascade,
  jugador_id   uuid  not null references jugadores(id),
  -- 'capitan' es un titular con distinción; un solo jugador puede tener este rol por mesa
  rol_en_mesa  text  not null check (rol_en_mesa in ('capitan', 'titular', 'suplente', 'cuerpo_tecnico')),
  unique (mesa_id, jugador_id)
);


-- ============================================================
-- RESULTADOS
-- Solo divisiones con categoria != 'infantil' registran resultado.
-- La restricción de categoría se valida en la app / Edge Function.
-- ============================================================

create table resultados (
  id              uuid        default gen_random_uuid() primary key,
  evento_id       uuid        not null references eventos(id) on delete cascade,
  puntos_propios  integer     not null check (puntos_propios >= 0),
  puntos_rival    integer     not null check (puntos_rival >= 0),
  registrado_por  uuid        not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (evento_id)
);

create trigger resultados_updated_at
  before update on resultados
  for each row execute function set_updated_at();


-- ============================================================
-- LESIONES
-- grado fijo 1-5 (definido por el club, no configurable desde la app).
-- division_id desnormalizado desde jugadores para RLS directo.
-- ============================================================

create table lesiones (
  id             uuid        default gen_random_uuid() primary key,
  jugador_id     uuid        not null references jugadores(id),
  division_id    uuid        not null references divisiones(id),  -- desnormalizado de jugadores
  fecha          date        not null,
  descripcion    text        not null,
  grado          integer     not null check (grado between 1 and 5),
  registrado_por uuid        not null references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger lesiones_updated_at
  before update on lesiones
  for each row execute function set_updated_at();


-- ============================================================
-- PROTOCOLOS DE LESIÓN
-- Documentos cargados por Subcomisión. Accesibles por todos los roles.
-- grado_asociado null = protocolo general (no específico de un grado).
-- ============================================================

create table protocolos (
  id              uuid        default gen_random_uuid() primary key,
  titulo          text        not null,
  grado_asociado  integer     check (grado_asociado between 1 and 5),
  storage_path    text        not null,   -- path en bucket 'protocolos' de Supabase Storage
  nombre_archivo  text,
  subido_por      uuid        not null references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger protocolos_updated_at
  before update on protocolos
  for each row execute function set_updated_at();


-- ============================================================
-- EVENTOS FINANCIEROS
-- Cubre: viaje y tercer_tiempo (por división/equipo) y recaudacion (global).
-- division_id null → recaudación global (todos los managers la ven).
-- evento_id → vínculo opcional al partido del calendario.
-- ============================================================

create table eventos_financieros (
  id          uuid        default gen_random_uuid() primary key,
  tipo        text        not null check (tipo in ('viaje', 'tercer_tiempo', 'recaudacion')),
  nombre      text        not null,
  descripcion text,
  fecha       date,
  division_id uuid        references divisiones(id),   -- null para recaudaciones globales
  evento_id   uuid        references eventos(id),       -- vínculo opcional a partido
  creado_por  uuid        not null references profiles(id),
  estado      text        not null default 'activo' check (estado in ('activo', 'cerrado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger eventos_financieros_updated_at
  before update on eventos_financieros
  for each row execute function set_updated_at();


-- ============================================================
-- COBRANZAS
-- Estado de pago por jugador por evento financiero.
-- forma_de_pago y monto solo aplican cuando estado = 'pagado'.
-- ============================================================

create table cobranzas (
  id                    uuid           default gen_random_uuid() primary key,
  evento_financiero_id  uuid           not null references eventos_financieros(id),
  jugador_id            uuid           not null references jugadores(id),
  estado                text           not null default 'pendiente' check (estado in ('pagado', 'pendiente')),
  monto                 numeric(10,2),
  forma_de_pago         text           check (forma_de_pago in ('efectivo', 'transferencia', 'otro')),
  fecha_pago            date,
  registrado_por        uuid           not null references profiles(id),
  created_at            timestamptz    not null default now(),
  updated_at            timestamptz    not null default now(),
  unique (evento_financiero_id, jugador_id)
);

create trigger cobranzas_updated_at
  before update on cobranzas
  for each row execute function set_updated_at();


-- ============================================================
-- PEDIDOS (eventos de recaudación de Subcomisión)
-- El manager carga el pedido y confirma cuando recibe el comprobante.
-- Un pedido confirmado no puede volver a pendiente (enforced en la app/RLS).
-- ============================================================

create table pedidos (
  id                    uuid        default gen_random_uuid() primary key,
  evento_financiero_id  uuid        not null references eventos_financieros(id),
  manager_id            uuid        not null references profiles(id),
  estado                text        not null default 'pendiente' check (estado in ('pendiente', 'confirmado')),
  fecha_confirmacion    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger pedidos_updated_at
  before update on pedidos
  for each row execute function set_updated_at();

create table items_pedido (
  id         uuid        default gen_random_uuid() primary key,
  pedido_id  uuid        not null references pedidos(id) on delete cascade,
  concepto   text        not null,
  cantidad   integer     not null check (cantidad > 0),
  created_at timestamptz not null default now()
);


-- ============================================================
-- NOTIFICACIONES
-- origen_usuario_id null → generada por el sistema.
-- evento_referencia_* → trazabilidad al objeto que disparó la notif.
-- ============================================================

create table notificaciones (
  id                     uuid        default gen_random_uuid() primary key,
  tipo                   text        not null check (tipo in ('manual', 'sistema')),
  origen_usuario_id      uuid        references profiles(id),
  titulo                 text        not null,
  mensaje                text        not null,
  evento_referencia_id   uuid,
  evento_referencia_tipo text        check (evento_referencia_tipo in (
                                       'lesion', 'fichaje', 'asistencia',
                                       'pedido', 'evento_financiero'
                                     )),
  created_at             timestamptz not null default now()
);

create table notificaciones_destinatarios (
  id               uuid        default gen_random_uuid() primary key,
  notificacion_id  uuid        not null references notificaciones(id) on delete cascade,
  usuario_id       uuid        not null references profiles(id) on delete cascade,
  leida            boolean     not null default false,
  fecha_lectura    timestamptz,
  created_at       timestamptz not null default now(),
  unique (notificacion_id, usuario_id)
);


-- ============================================================
-- HABILITAR ROW LEVEL SECURITY
-- Sin políticas aún — se agregan en la siguiente migración.
-- Mientras tanto ninguna fila es accesible desde el cliente.
-- ============================================================

alter table divisiones                   enable row level security;
alter table profiles                     enable row level security;
alter table push_tokens                  enable row level security;
alter table jugadores                    enable row level security;
alter table fichajes                     enable row level security;
alter table documentos_fichaje           enable row level security;
alter table eventos                      enable row level security;
alter table asistencias                  enable row level security;
alter table mesas_de_partido             enable row level security;
alter table mesa_jugadores               enable row level security;
alter table resultados                   enable row level security;
alter table lesiones                     enable row level security;
alter table protocolos                   enable row level security;
alter table eventos_financieros          enable row level security;
alter table cobranzas                    enable row level security;
alter table pedidos                      enable row level security;
alter table items_pedido                 enable row level security;
alter table notificaciones               enable row level security;
alter table notificaciones_destinatarios enable row level security;


-- ============================================================
-- ÍNDICES
-- Foco en columnas usadas en políticas RLS y consultas frecuentes.
-- ============================================================

-- profiles
create index on profiles (rol);
create index on profiles (activo);
create index on profiles using gin (divisiones);   -- containment: division = any(divisiones)

-- push_tokens
create index on push_tokens (usuario_id);

-- jugadores
create index on jugadores (division_id);
create index on jugadores (activo);
create index on jugadores (dni);

-- fichajes
create index on fichajes (jugador_id);
create index on fichajes (registrado_por);

-- documentos_fichaje
create index on documentos_fichaje (fichaje_id);

-- eventos
create index on eventos (division_id);
create index on eventos (fecha);
create index on eventos (tipo);
create index on eventos (creado_por);
create index on eventos (cancelado);

-- asistencias
create index on asistencias (evento_id);
create index on asistencias (jugador_id);
create index on asistencias (division_id);        -- clave para RLS por división
create index on asistencias (registrado_por);
create index on asistencias (estado);

-- mesas_de_partido
create index on mesas_de_partido (evento_id);

-- mesa_jugadores
create index on mesa_jugadores (mesa_id);
create index on mesa_jugadores (jugador_id);

-- resultados
create index on resultados (evento_id);
create index on resultados (registrado_por);

-- lesiones
create index on lesiones (jugador_id);
create index on lesiones (division_id);           -- clave para RLS por división
create index on lesiones (registrado_por);
create index on lesiones (grado);
create index on lesiones (fecha);

-- protocolos
create index on protocolos (grado_asociado);

-- eventos_financieros
create index on eventos_financieros (division_id);
create index on eventos_financieros (tipo);
create index on eventos_financieros (estado);
create index on eventos_financieros (creado_por);
create index on eventos_financieros (evento_id);

-- cobranzas
create index on cobranzas (evento_financiero_id);
create index on cobranzas (jugador_id);
create index on cobranzas (registrado_por);
create index on cobranzas (estado);

-- pedidos
create index on pedidos (evento_financiero_id);
create index on pedidos (manager_id);             -- clave para RLS: manager ve sus propios pedidos
create index on pedidos (estado);

-- items_pedido
create index on items_pedido (pedido_id);

-- notificaciones
create index on notificaciones (origen_usuario_id);
create index on notificaciones (created_at desc);

-- notificaciones_destinatarios
create index on notificaciones_destinatarios (usuario_id);       -- clave para RLS: cada uno ve las suyas
create index on notificaciones_destinatarios (notificacion_id);
create index on notificaciones_destinatarios (leida);
create index on notificaciones_destinatarios (usuario_id, leida); -- consulta de no leídas (badge)
