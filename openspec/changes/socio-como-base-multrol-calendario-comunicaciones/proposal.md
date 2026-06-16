# Proposal: Socio como base del sistema — Multi-rol, Calendario y Comunicaciones

## Problema

El sistema actual trata al socio y al staff como identidades separadas sin relación formal. Esto genera tres problemas concretos:

1. **Identidad fragmentada**: un entrenador que también juega no puede acceder a su carnet, cuotas ni al calendario de sus partidos. Tiene que enterarse de las cosas por WhatsApp.
2. **Sin trazabilidad de membresía**: un miembro del staff puede operar en el sistema sin ser socio, lo que permite que no pague cuotas.
3. **Comunicaciones fuera del sistema**: las cancelaciones de entrenamiento se coordinan por WhatsApp. Los socios-jugadores no reciben información sobre partidos ni eventos de su división.

## Solución

Establecer al **socio como identidad base** de toda persona en el club. A partir del carnet, se suman capas: rol de staff, condición de jugador. Consecuencias:

- Todo participante del club paga cuota — la app lo garantiza.
- Una persona puede tener múltiples roles y switchear entre ellos en la app.
- Los socios-jugadores ven el fixture de su división y reciben comunicaciones relevantes.
- Las cancelaciones de entrenamiento dejan de ser un problema de WhatsApp.

## Alcance

### Fase 1 — Socio como base + Multi-rol
- `profiles.roles[]` reemplaza el campo `rol` único.
- El flujo de creación de staff cambia: secretaría crea el socio primero, subcomisión asigna el rol de staff después.
- La app permite switchear entre roles desde la pantalla "Sobre".
- Los push tokens y la sesión funcionan con el rol activo.

### Fase 2 — Calendario y Comunicaciones para el socio
- Nueva tab `Calendario` en la app del socio: fixture general del club con filtro por deporte.
- Los socios-jugadores ven su división destacada.
- Al cancelar un entrenamiento, el coordinador escribe un mensaje → push + noticia automática a los socios afectados.
- La subcomisión elige audiencia al publicar noticias: `todos` (socios + cuerpo técnico) o `cuerpo_técnico`.

## No incluye
- Gestión de roles múltiples para secretaría/portería (solo aplica staff + socio).
- Fixture editable por el socio.
- Chat o respuestas a comunicados.
- Otros deportes además de rugby en el MVP del calendario (la estructura lo soporta, no se implementa ahora).

## Impacto esperado
- Todos los miembros del club asociados y con cuotas al día — sin perseguirlos.
- Cero WhatsApp para cancelaciones.
- Jugadores informados de su fixture desde la app.
