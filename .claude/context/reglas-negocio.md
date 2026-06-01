# Reglas de Negocio, Specs y Backlog

## Reglas de negocio fijas

- **Escala de lesiones:** fija del 1 al 5, definida por el club. No configurable desde la app.
- **Cobranzas:** sin integración con sistemas de pago. Registro manual: estado (Pagado/Pendiente), monto y forma de pago (efectivo, transferencia, otro).
- **Fichajes:** el Manager tiene autoridad directa. Sin flujo de aprobación.
- **Eventos de recaudación:** los crea la Subcomisión y los cierra manualmente. Sin vencimiento automático.
- **Resultados deportivos:** solo disponibles para divisiones juveniles en adelante. Infantiles no tienen marcador.
- **Alerta de inasistencias:** se dispara al superar 4 ausencias **consecutivas** (no acumuladas). Notifica al Coordinador.
- **Administración del sistema:** la Subcomisión gestiona alta y baja de todos los usuarios. Sin perfil técnico separado.
- **17 planteles activos:** infantiles, juveniles, plantel superior, femenino y rugby mixed.
- **Jugadores:** no tienen acceso a la app en esta versión.

## Requerimientos no funcionales

- **Offline:** toma de asistencia y registro de lesión deben funcionar sin conexión, con sync posterior.
- **Performance:** respuesta < 2 segundos para operaciones comunes. Push < 30 segundos de latencia.
- **Seguridad:** autenticación email+password. 2FA recomendado para Subcomisión. Datos de jugadores (DNI, documentación) con almacenamiento seguro.
- **Escalabilidad:** ~60 usuarios iniciales. Arquitectura que permita sumar divisiones o roles sin rediseño mayor.

## Specs por dominio

Los specs viven en `openspec/specs/` (37 user stories en 7 dominios):

| Dominio | Spec |
|---|---|
| `auth` | [openspec/specs/auth/spec.md](../../../openspec/specs/auth/spec.md) |
| `entrenamientos-partidos` | [openspec/specs/entrenamientos-partidos/spec.md](../../../openspec/specs/entrenamientos-partidos/spec.md) |
| `lesiones` | [openspec/specs/lesiones/spec.md](../../../openspec/specs/lesiones/spec.md) |
| `financiero` | [openspec/specs/financiero/spec.md](../../../openspec/specs/financiero/spec.md) |
| `fichajes` | [openspec/specs/fichajes/spec.md](../../../openspec/specs/fichajes/spec.md) |
| `notificaciones` | [openspec/specs/notificaciones/spec.md](../../../openspec/specs/notificaciones/spec.md) |
| `informes` | [openspec/specs/informes/spec.md](../../../openspec/specs/informes/spec.md) |

## Backlog — Pendientes prioritarios

- [ ] Build iOS (requiere Apple Developer Program, $99/año)
- [ ] Deploy web en Vercel (`cd web && vercel`)
- [ ] Dark mode modo `system` en la web (ThemeContext no aplica a Next.js)
- [ ] Deep link de registro (`type=invite`) — completar flujo email → `registro.tsx` ← parcialmente implementado, falta testing
- [ ] Volver `.env.local` de app y web a Supabase Cloud al terminar testing local
