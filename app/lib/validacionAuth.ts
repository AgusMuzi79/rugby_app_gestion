// Validación por campo de los formularios de auth: reset-password, registro
// (usuario nuevo) y registro-tutor. Antes cada pantalla devolvía el primer
// error en un banner abajo del todo (con el teclado abierto no se veía) y
// ningún campo se marcaba. Ahora cada campo tiene su error, se muestra al
// salir del campo (tocado) y todos se marcan al enviar. Lógica pura
// (validacionAuth.check.ts).

import { MIN_PASSWORD } from './errorFunction'

export type Errores<K extends string> = Partial<Record<K, string>>
export type Tocados<K extends string> = Partial<Record<K, boolean>>

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Pedido de recupero (forgot-password) ────────────────────────────────────

// Lo que falta antes de mandar: vacío, o quiso tipear un mail (tiene @) y no
// tiene forma de mail (si no, login-dni lo tomaba como DNI). Sin @ es un DNI.
export function faltaPedidoRecupero(texto: string): 'vacio' | 'mail_invalido' | null {
  const limpio = texto.trim()
  if (!limpio) return 'vacio'
  if (limpio.includes('@') && !EMAIL_RE.test(limpio)) return 'mail_invalido'
  return null
}

// ── Fecha DD/MM/AAAA ────────────────────────────────────────────────────────

// "DD/MM/AAAA" mientras se tipea: sólo dígitos, con las barras puestas.
export function formatearFechaTipeada(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

// "DD/MM/AAAA" -> "YYYY-MM-DD", o null si no es una fecha real y pasada.
export function fechaAIso(texto: string): string | null {
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const fecha = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  const valida = fecha.getFullYear() === Number(yyyy)
    && fecha.getMonth() === Number(mm) - 1
    && fecha.getDate() === Number(dd)
  if (!valida || fecha > new Date() || Number(yyyy) < 1900) return null
  return `${yyyy}-${mm}-${dd}`
}

// ── Campos ──────────────────────────────────────────────────────────────────

function errorPasswordNueva(password: string): string | undefined {
  if (!password) return 'Ingresá una contraseña.'
  if (password.length < MIN_PASSWORD) return `Tiene que tener al menos ${MIN_PASSWORD} caracteres.`
  return undefined
}

function errorConfirmacion(password: string, confirmacion: string): string | undefined {
  if (!confirmacion) return 'Repetí la contraseña.'
  if (confirmacion !== password) return 'Las contraseñas no coinciden.'
  return undefined
}

// Saca los campos sin error (también lo usa lib/usuariosForm.ts).
export function sinVacios<K extends string>(errores: Record<K, string | undefined>): Errores<K> {
  const out: Errores<K> = {}
  for (const k of Object.keys(errores) as K[]) {
    if (errores[k]) out[k] = errores[k]
  }
  return out
}

// ── Formularios ─────────────────────────────────────────────────────────────

export type CampoPassword = 'password' | 'confirmacion'

export function validarFormPassword(v: { password: string; confirmacion: string }): Errores<CampoPassword> {
  return sinVacios({
    password:     errorPasswordNueva(v.password),
    confirmacion: errorConfirmacion(v.password, v.confirmacion),
  })
}

export type CampoRegistro = 'nombre' | CampoPassword

export function validarFormRegistro(
  v: { nombre: string; password: string; confirmacion: string },
): Errores<CampoRegistro> {
  return sinVacios({
    nombre:       v.nombre.trim() ? undefined : 'Ingresá tu nombre.',
    password:     errorPasswordNueva(v.password),
    confirmacion: errorConfirmacion(v.password, v.confirmacion),
  })
}

export type CampoTutorDatos = 'relacion' | 'email' | 'fecha' | 'dniMenor'

export function validarFormTutorDatos(
  v: { relacion: string | null; email: string; fecha: string; dniMenor: string },
): Errores<CampoTutorDatos> {
  return sinVacios({
    relacion: v.relacion ? undefined : 'Elegí tu relación con el socio.',
    email:    EMAIL_RE.test(v.email.trim().toLowerCase()) ? undefined : 'Ingresá un mail válido.',
    fecha:    fechaAIso(v.fecha) ? undefined : 'Ingresá tu fecha de nacimiento con el formato DD/MM/AAAA.',
    dniMenor: v.dniMenor.replace(/\D/g, '') ? undefined : 'Ingresá el DNI del socio menor.',
  })
}

export type CampoTutorCodigo = 'codigo' | 'password' | 'password2'

export function validarFormTutorCodigo(
  v: { codigo: string; password: string; password2: string },
): Errores<CampoTutorCodigo> {
  return sinVacios({
    codigo:    /^\d{6}$/.test(v.codigo) ? undefined : 'El código tiene 6 números.',
    password:  errorPasswordNueva(v.password),
    password2: errorConfirmacion(v.password, v.password2),
  })
}

// ── Tocados ─────────────────────────────────────────────────────────────────

// Los errores que se muestran: sólo los de campos que la persona ya dejó.
export function erroresVisibles<K extends string>(errores: Errores<K>, tocados: Tocados<K>): Errores<K> {
  const out: Errores<K> = {}
  for (const k of Object.keys(errores) as K[]) {
    if (tocados[k]) out[k] = errores[k]
  }
  return out
}

export function todosTocados<K extends string>(campos: readonly K[]): Tocados<K> {
  const out: Tocados<K> = {}
  for (const k of campos) out[k] = true
  return out
}

export function hayErrores(errores: Errores<string>): boolean {
  return Object.keys(errores).length > 0
}
