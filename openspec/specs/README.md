# Specs — App de Gestión Operativa del Club

Specs iniciales generados a partir del PRD v1.0 (Mayo 2026), organizados por dominio.

## Dominios

| Dominio | Descripción | Actores principales |
|---|---|---|
| [auth](./auth/spec.md) | Autenticación, roles y gestión de usuarios | Subcomisión (admin), todos los roles |
| [entrenamientos-partidos](./entrenamientos-partidos/spec.md) | Asistencia, mesa de partido, resultados, calendario | Entrenador, Coordinador |
| [lesiones](./lesiones/spec.md) | Registro de lesiones, protocolos de actuación | Entrenador, Subcomisión |
| [financiero](./financiero/spec.md) | Cobranzas de viajes/tercer tiempo, eventos de recaudación | Manager, Subcomisión |
| [fichajes](./fichajes/spec.md) | Alta de jugadores y documentación | Manager, Subcomisión |
| [notificaciones](./notificaciones/spec.md) | Notificaciones manuales (Subcomisión) y automáticas del sistema | Todos los roles |
| [informes](./informes/spec.md) | Dashboard global y por división | Subcomisión, Coordinador |

## User Stories por dominio

| ID | Historia | Dominio |
|---|---|---|
| US-AUTH-01..05 | Login, 2FA, alta/baja usuarios, recuperación de contraseña | auth |
| US-EP-01..06 | Asistencia entrenamiento/partido, mesa, resultado, calendario | entrenamientos-partidos |
| US-LES-01..04 | Registro lesión, historial, protocolos, carga de docs | lesiones |
| US-FIN-01..06 | Cobranzas, resumen, pedidos, confirmación, eventos | financiero |
| US-FICH-01..03 | Alta fichaje, listado, detalle y documentación | fichajes |
| US-NOT-01..06 | Envío manual, recepción, notificaciones automáticas del sistema | notificaciones |
| US-INF-01..07 | Dashboard global, asistencia, resultados, fichajes, financiero, lesiones, Coordinador | informes |

## Épicas del PRD → Dominios

| Épica PRD | Dominio(s) |
|---|---|
| Épica 1: Entrenamientos y Partidos | `entrenamientos-partidos` |
| Épica 2: Gestión de Lesiones | `lesiones` |
| Épica 3: Gestión Financiera Operativa | `financiero` |
| Épica 4: Gestión de Fichajes | `fichajes` |
| Épica 5: Comunicación Interna | `notificaciones` |
| Épica 6: Informes Subcomisión | `informes` |
| Roles y Permisos / Alta de usuarios | `auth` |
