import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Self-service sign-up of a minor's adult (mother, father, guardian) who is not
// a club member. Talks to the Edge Function `registro-tutor`, which runs
// without a session: business errors come back as HTTP 200 { ok:false, motivo }.

export type RelacionTutor = 'madre' | 'padre' | 'tutor' | 'otro'

export interface SolicitudTutor {
  dniMenor:        string
  email:           string
  relacion:        RelacionTutor
  fechaNacimiento: string // YYYY-MM-DD
}

export interface VerificacionTutor {
  dniMenor: string
  email:    string
  codigo:   string
  password: string
  nombre:   string
}

const MENSAJES_MOTIVO: Record<string, string> = {
  datos_invalidos:        'Revisá los datos: hay algún campo incompleto o con formato inválido.',
  menor_de_edad:          'Para crear la cuenta tenés que ser mayor de 18 años.',
  no_coincide:            'Los datos no coinciden con los que tiene cargados el club. Acercate a Secretaría para actualizarlos.',
  demasiadas_solicitudes: 'Pediste demasiados códigos en la última hora. Esperá un rato y volvé a intentar.',
  envio_fallido:          'No pudimos enviarte el mail con el código. Probá de nuevo en unos minutos.',
  codigo_vencido:         'El código venció. Pedí uno nuevo con "Reenviar código".',
  codigo_invalido:        'El código no es correcto. Revisalo y volvé a intentar.',
  bloqueado:              'Ingresaste un código incorrecto demasiadas veces. Pedí uno nuevo con "Reenviar código".',
  password_corta:         'La contraseña tiene que tener al menos 8 caracteres.',
  cuenta_existente:       'Ya existe una cuenta con ese mail. Ingresá con tu mail y tu contraseña desde el inicio.',
  error_interno:          'Ocurrió un error. Intentá de nuevo en unos minutos.',
}

const MENSAJE_GENERICO = 'Ocurrió un error. Revisá tu conexión e intentá de nuevo.'

function mensajeDeMotivo(motivo: unknown): string {
  return (typeof motivo === 'string' && MENSAJES_MOTIVO[motivo]) || MENSAJE_GENERICO
}

type Resultado = { ok: true } | { ok: false; mensaje: string }

async function invocar(body: Record<string, unknown>): Promise<Resultado> {
  try {
    const { data, error } = await supabase.functions.invoke('registro-tutor', { body })
    if (error || !data) return { ok: false, mensaje: MENSAJE_GENERICO }
    if (data.ok === true) return { ok: true }
    return { ok: false, mensaje: mensajeDeMotivo(data.motivo) }
  } catch {
    return { ok: false, mensaje: MENSAJE_GENERICO }
  }
}

export function useRegistroTutor() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function solicitarCodigo(datos: SolicitudTutor): Promise<boolean> {
    setLoading(true)
    setError(null)
    const res = await invocar({
      action:           'solicitar',
      dni_menor:        datos.dniMenor,
      email:            datos.email,
      relacion:         datos.relacion,
      fecha_nacimiento: datos.fechaNacimiento,
    })
    setLoading(false)
    if (!res.ok) setError(res.mensaje)
    return res.ok
  }

  // On success signs in with the new account: onAuthStateChange in the root
  // layout loads the role and routes to the (tutor) group (after the terms gate).
  async function crearCuenta(datos: VerificacionTutor): Promise<boolean> {
    setLoading(true)
    setError(null)
    const res = await invocar({
      action:    'verificar',
      dni_menor: datos.dniMenor,
      email:     datos.email,
      codigo:    datos.codigo,
      password:  datos.password,
      ...(datos.nombre ? { nombre: datos.nombre } : {}),
    })
    if (!res.ok) {
      setError(res.mensaje)
      setLoading(false)
      return false
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email:    datos.email,
      password: datos.password,
    })
    setLoading(false)
    if (signInError) {
      setError('Tu cuenta quedó creada, pero no pudimos iniciar sesión. Ingresá con tu mail y tu contraseña desde el inicio.')
      return false
    }
    return true
  }

  return { loading, error, setError, solicitarCodigo, crearCuenta }
}
