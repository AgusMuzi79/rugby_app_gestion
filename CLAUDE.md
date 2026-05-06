# App de Gestión Operativa del Club — Contexto del Proyecto

## Resumen
Aplicación interna para el cuerpo técnico y organizativo de un club de rugby. Digitaliza procesos hoy manejados por WhatsApp, planillas en papel y documentos físicos. Inicialmente ~60 usuarios activos, 17 planteles.

## Roles de Usuario

| Rol | Responsabilidad |
|---|---|
| **Subcomisión** | Órgano directivo. Visión global. Admin del sistema (alta/baja usuarios). |
| **Coordinador** | Gestiona calendario y divisiones infantiles/juveniles. |
| **Entrenador** | Toma asistencia, registra lesiones, carga resultados. |
| **Manager** | Gestiona cobranzas y fichajes de su equipo. |

> Los jugadores **no tienen acceso** a la app en esta versión.

## Dominios y Specs

Los specs viven en `openspec/specs/` organizados por dominio:

| Dominio | Spec | Descripción |
|---|---|---|
| `auth` | [spec](openspec/specs/auth/spec.md) | Autenticación, roles, alta/baja de usuarios |
| `entrenamientos-partidos` | [spec](openspec/specs/entrenamientos-partidos/spec.md) | Asistencia, mesa de partido, resultados, calendario |
| `lesiones` | [spec](openspec/specs/lesiones/spec.md) | Registro de lesiones, protocolos de actuación |
| `financiero` | [spec](openspec/specs/financiero/spec.md) | Cobranzas de viajes/tercer tiempo, eventos de recaudación |
| `fichajes` | [spec](openspec/specs/fichajes/spec.md) | Alta de jugadores y documentación |
| `notificaciones` | [spec](openspec/specs/notificaciones/spec.md) | Notificaciones manuales (Subcomisión) y automáticas del sistema |
| `informes` | [spec](openspec/specs/informes/spec.md) | Dashboard global y por división |

## Reglas de Negocio Clave

- **Escala de lesiones:** fija del 1 al 5, definida por el club. No configurable desde la app.
- **Cobranzas:** sin integración con sistemas de pago. Registro manual de estado (Pagado/Pendiente), monto y forma de pago (efectivo, transferencia, otro).
- **Fichajes:** el Manager tiene autoridad directa. Sin flujo de aprobación.
- **Eventos de recaudación:** los crea la Subcomisión y los cierra manualmente. Sin vencimiento automático.
- **Resultados deportivos:** solo disponibles para divisiones juveniles en adelante. Infantiles no tienen marcador.
- **Alerta de inasistencias:** se dispara al superar 4 ausencias **consecutivas** (no acumuladas). Notifica al Coordinador.
- **Administración del sistema:** la Subcomisión gestiona el alta y baja de todos los usuarios. Sin perfil técnico separado.
- **17 planteles activos:** infantiles, juveniles, plantel superior, femenino y rugby mixed.

## Requerimientos No Funcionales

- **Plataforma:** app móvil (iOS/Android) + acceso web responsive. PWA o app híbrida válida para MVP.
- **Offline:** toma de asistencia y registro de lesión deben funcionar sin conexión, con sincronización posterior.
- **Performance:** respuesta < 2 segundos para operaciones comunes. Notificaciones push < 30 segundos de latencia.
- **Seguridad:** autenticación por usuario y contraseña. 2FA recomendado para Subcomisión. Datos de jugadores (DNI, documentación) con almacenamiento seguro.
- **Escalabilidad:** ~60 usuarios iniciales, sin límite fijo de crecimiento. Arquitectura que permita sumar divisiones o roles sin rediseño mayor.

## Stack Tecnológico
A definir por el arquitecto técnico. Sin restricciones desde el lado del negocio.

## Fuentes

- PRD completo: [`prd.md`](prd.md) — v1.0, Mayo 2026
- Specs por dominio: [`openspec/specs/`](openspec/specs/)
