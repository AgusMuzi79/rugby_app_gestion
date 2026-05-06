# Spec: Autenticación y Gestión de Usuarios

## Dominio
`auth`

## Descripción
Gestión de acceso a la app, autenticación de usuarios y administración de roles. La Subcomisión es el único rol con capacidad de dar de alta y baja usuarios. Cada usuario pertenece a exactamente un rol, que determina sus permisos y vistas disponibles.

## Actores
- **Subcomisión** — administra usuarios (alta/baja), puede activar 2FA
- **Coordinador** — accede según su rol
- **Entrenador** — accede según su rol
- **Manager** — accede según su rol

## Roles y Permisos

| Rol | Nivel de acceso |
|---|---|
| Subcomisión | Global — todas las divisiones, todas las secciones |
| Coordinador | División — gestión de calendario y reportes de asistencia |
| Entrenador | Equipo — asistencia, lesiones, resultados de su equipo |
| Manager | Equipo — cobranzas, fichajes de su equipo |

## User Stories

### US-AUTH-01 — Login
**Como** usuario de la app  
**Quiero** iniciar sesión con usuario y contraseña  
**Para** acceder a las funciones de mi rol

**Criterios de aceptación:**
- El sistema autentica por email + contraseña
- Sesión persistente con token renovable
- Mensaje de error claro si las credenciales son incorrectas
- Bloqueo temporal tras N intentos fallidos consecutivos (definir N)

### US-AUTH-02 — Autenticación de dos factores (Subcomisión)
**Como** miembro de la Subcomisión  
**Quiero** usar autenticación de dos factores  
**Para** proteger el acceso al rol con mayor nivel de privilegios

**Criterios de aceptación:**
- 2FA opcional/recomendado para el rol Subcomisión
- Segundo factor vía app autenticadora (TOTP) o SMS
- Flujo claro de configuración y recuperación de 2FA

### US-AUTH-03 — Alta de usuario
**Como** Subcomisión  
**Quiero** crear un nuevo usuario asignándole un rol y división  
**Para** dar acceso a nuevos entrenadores, managers o coordinadores sin requerir soporte técnico

**Criterios de aceptación:**
- Campos requeridos: nombre completo, email, rol, división(es) asignadas
- El sistema genera una contraseña temporal o envía invitación por email
- El nuevo usuario debe cambiar la contraseña en el primer login
- No se puede crear un usuario con un email ya registrado

### US-AUTH-04 — Baja de usuario
**Como** Subcomisión  
**Quiero** desactivar un usuario existente  
**Para** revocar acceso cuando alguien deja el club

**Criterios de aceptación:**
- El usuario desactivado no puede iniciar sesión
- Sus datos históricos permanecen intactos (asistencias, lesiones, cobranzas cargadas)
- La desactivación es reversible (reactivar usuario)

### US-AUTH-05 — Recuperación de contraseña
**Como** usuario  
**Quiero** recuperar acceso si olvidé mi contraseña  
**Para** no depender de la Subcomisión para casos de contraseña olvidada

**Criterios de aceptación:**
- Flujo de recuperación vía email con link temporal
- El link expira en 24 horas

## Reglas de Negocio
- Un usuario pertenece a un único rol.
- Un entrenador o manager puede estar asociado a una o más divisiones.
- Solo la Subcomisión da de alta y baja usuarios; no hay auto-registro.
- Los jugadores no tienen acceso a la app en esta versión.
- Aproximadamente 60 usuarios iniciales: ~34 entrenadores, ~17 managers, ~5 coordinadores, ~8 subcomisión.

## Requerimientos No Funcionales
- Contraseñas almacenadas con hash seguro (bcrypt o similar).
- Datos de usuarios protegidos; no accesibles entre roles no autorizados.
- Tokens de sesión con expiración y renovación silenciosa.
- Soporte para uso offline no aplica a autenticación (requiere conexión para login inicial).
