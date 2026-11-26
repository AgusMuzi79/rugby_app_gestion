import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'
import { buscarJugadoresTenis } from '@/hooks/useTenisSocio'
import { normalizarDni } from '@/lib/entradaDni'
import { type JugadorBuscado, type JugadorEntrada } from '@/lib/tenis'
import { elegidoInvitado } from '@/lib/tenisReserva'
import { Aviso, Boton, Chip, estilosTenis } from './ui'

// Elegir un jugador: un socio del padrón (búsqueda por nombre o Nº de socio,
// nunca texto libre) o un invitado no socio con DNI, nombre y apellido. Con
// `dniOpcional` (reservas del socio y del staff) el invitado puede ir sólo con
// nombre y apellido, como en OnDepor; corregir jugadores sigue pidiendo DNI.

export interface JugadorElegido {
  clave:   string // socio_id, 'dni:<dni>', 'nom:<nombre apellido>' o 'designar:<n>', para no repetir jugadores
  nombre:  string
  entrada: JugadorEntrada
}

export function elegidoDeSocio(j: JugadorBuscado): JugadorElegido {
  return { clave: j.socio_id, nombre: j.nombre, entrada: { socio_id: j.socio_id } }
}

const MIN_BUSQUEDA = 3

export function BuscadorJugador({ excluir, onElegir, permitirInvitado = true, dniOpcional = false }: {
  excluir: string[]
  onElegir: (j: JugadorElegido) => void
  permitirInvitado?: boolean
  dniOpcional?: boolean
}) {
  const [modo, setModo] = useState<'socio' | 'invitado'>('socio')
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<JugadorBuscado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dni, setDni] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const pedido = useRef(0)

  // Busca 400 ms después de dejar de tipear; sólo vale la última respuesta.
  useEffect(() => {
    const texto = q.trim()
    if (texto.length < MIN_BUSQUEDA) {
      pedido.current++
      setResultados([]); setError(null); setBuscando(false)
      return
    }
    const n = ++pedido.current
    const t = setTimeout(async () => {
      setBuscando(true)
      const r = await buscarJugadoresTenis(texto)
      if (n !== pedido.current) return
      setBuscando(false)
      if (r.ok) { setResultados(r.data); setError(null) } else { setResultados([]); setError(r.mensaje) }
    }, 400)
    return () => clearTimeout(t)
  }, [q])

  function agregarInvitado() {
    const r = elegidoInvitado({ dni, nombre, apellido }, excluir, { dniOpcional })
    if (!r.ok) { setError(r.mensaje); return }
    onElegir(r.elegido)
    setDni(''); setNombre(''); setApellido(''); setError(null)
  }

  const visibles = resultados.filter(r => !excluir.includes(r.socio_id))

  return (
    <View style={s.root}>
      {permitirInvitado && (
        <View style={estilosTenis.fila}>
          <Chip texto="SOCIO" activo={modo === 'socio'} onPress={() => { setModo('socio'); setError(null) }} />
          <Chip texto="INVITADO" activo={modo === 'invitado'} onPress={() => { setModo('invitado'); setError(null) }} />
        </View>
      )}

      {modo === 'socio' ? (
        <>
          <TextInput
            style={[estilosTenis.input, s.espacio]}
            value={q}
            onChangeText={setQ}
            placeholder="Nombre o Nº de socio"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            accessibilityLabel="Buscar socio por nombre o número de socio"
          />
          {buscando && <ActivityIndicator color={colors.oro} style={s.espacio} />}
          {visibles.map(r => (
            <TouchableOpacity
              key={r.socio_id}
              style={s.resultado}
              onPress={() => { onElegir(elegidoDeSocio(r)); setQ(''); setResultados([]) }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Agregar a ${r.nombre}`}
            >
              <Text style={s.nombre}>{r.nombre}</Text>
              {r.numero_socio !== null && <Text style={s.numero}>Nº {r.numero_socio}</Text>}
            </TouchableOpacity>
          ))}
          {!buscando && q.trim().length >= MIN_BUSQUEDA && visibles.length === 0 && !error && (
            <Aviso>No hay socios con ese nombre (o están suspendidos).</Aviso>
          )}
        </>
      ) : (
        <>
          <TextInput
            style={[estilosTenis.input, s.espacio]}
            value={dni}
            onChangeText={t => setDni(normalizarDni(t))}
            placeholder={dniOpcional ? 'DNI (opcional)' : 'DNI'}
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            accessibilityLabel={dniOpcional ? 'DNI del invitado, opcional' : 'DNI del invitado'}
          />
          <TextInput
            style={[estilosTenis.input, s.espacio]}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Nombre"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Nombre del invitado"
          />
          <TextInput
            style={[estilosTenis.input, s.espacio]}
            value={apellido}
            onChangeText={setApellido}
            placeholder="Apellido"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Apellido del invitado"
          />
          <Boton texto="AGREGAR INVITADO" variante="secundario" onPress={agregarInvitado} />
        </>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}
    </View>
  )
}

const s = StyleSheet.create({
  root:      { gap: 2 },
  espacio:   { marginTop: 8 },
  resultado: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borde, paddingVertical: 8 },
  nombre:    { fontFamily: fonts.cuerpo, fontSize: 16, color: colors.texto, flex: 1 },
  numero:    { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
})
