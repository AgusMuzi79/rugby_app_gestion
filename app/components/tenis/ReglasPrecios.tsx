import { useEffect, useState } from 'react'
import { View, Text, TextInput, ScrollView, Switch, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { colors } from '@/constants/theme'
import { accionesTenis } from '@/hooks/useTenisGestor'
import { accionesGestion, useConfigExtra } from '@/hooks/useTenisGestion'
import { DIAS_SEMANA, validarHorarios, type HorarioDia } from '@/lib/tenisGestion'
import { esHoraValida, type TenisConfig } from '@/lib/tenis'
import { formatMonto } from '@/lib/formatoMonto'
import { Aviso, Boton, Titulo, estilosTenis } from './ui'

// Reglas y precios de tenis (`tenis_config_guardar`). Los cambios valen para
// las reservas nuevas; las ya hechas conservan su precio. Arriba, el horario de
// cada día (`tenis_horarios_guardar`) y los días que se ven en el calendario
// (`dias_vista`), como en OnDepor.

type CampoNumero = { [K in keyof TenisConfig]: TenisConfig[K] extends number ? K : never }[keyof TenisConfig]

const SECCIONES: { titulo: string; campos: { k: CampoNumero; label: string; pesos?: boolean }[] }[] = [
  {
    titulo: 'PRECIOS POR JUGADOR',
    campos: [
      { k: 'precio_socio_single', label: 'Socio · singles', pesos: true },
      { k: 'precio_socio_dobles', label: 'Socio · dobles', pesos: true },
      { k: 'precio_nosocio_single', label: 'No socio · singles', pesos: true },
      { k: 'precio_nosocio_dobles', label: 'No socio · dobles', pesos: true },
    ],
  },
  {
    titulo: 'TURNOS',
    campos: [
      { k: 'singles_min', label: 'Duración singles (min)' },
      { k: 'dobles_min', label: 'Duración dobles (min)' },
      { k: 'margen_inicio_min', label: 'Minutos de barrido antes de empezar' },
    ],
  },
  {
    titulo: 'LÍMITES POR TITULAR',
    campos: [
      { k: 'max_reservas_dia', label: 'Reservas por día' },
      { k: 'max_activas', label: 'Reservas activas a la vez' },
      { k: 'anticipacion_dias', label: 'Días de anticipación' },
      { k: 'cancelacion_horas', label: 'Cancelar hasta (horas antes)' },
    ],
  },
  {
    titulo: 'INVITADOS (WEB)',
    campos: [
      { k: 'hold_min', label: 'Minutos para confirmar por mail' },
      { k: 'comprobante_horas_antes', label: 'Subir comprobante hasta (horas antes)' },
    ],
  },
]

export function ReglasPrecios({ config, onGuardado }: { config: TenisConfig; onGuardado: () => void }) {
  const [form, setForm] = useState<TenisConfig>(config)
  const [textos, setTextos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [versionExtra, setVersionExtra] = useState(0)
  const extra = useConfigExtra(config, versionExtra)
  const [horarios, setHorarios] = useState<HorarioDia[] | null>(null)
  const [diasVista, setDiasVista] = useState('')

  useEffect(() => { setForm(config); setTextos({}) }, [config])
  useEffect(() => {
    if (!extra.datos) return
    setHorarios(extra.datos.horarios)
    setDiasVista(String(extra.datos.diasVista))
  }, [extra.datos])

  function cambiarDia(dia: number, cambio: Partial<HorarioDia>) {
    setHorarios(h => h && h.map(x => x.dia_semana === dia ? { ...x, ...cambio } : x))
  }

  const valor = (k: CampoNumero) => textos[k] ?? String(form[k])

  async function guardar() {
    const nuevo: TenisConfig = { ...form }
    for (const sec of SECCIONES) for (const c of sec.campos) {
      const n = Number(valor(c.k))
      if (!Number.isInteger(n) || n < 0) { setError(`Revisá "${c.label}".`); return }
      nuevo[c.k] = n
    }
    if (!esHoraValida(nuevo.hora_desde) || !esHoraValida(nuevo.hora_hasta) || nuevo.hora_hasta <= nuevo.hora_desde) {
      setError('Revisá el horario de las canchas (HH:MM).'); return
    }
    if (!nuevo.alias_pago.trim()) { setError('Completá el alias para transferencias.'); return }
    const vista = Number(diasVista)
    if (horarios) {
      const e = validarHorarios(horarios)
      if (e) { setError(e); return }
      if (!Number.isInteger(vista) || vista < 1 || vista > 14) { setError('Los días visibles en el calendario van de 1 a 14.'); return }
      if (vista < nuevo.anticipacion_dias + 1) { setError('Los días visibles tienen que incluir los días de anticipación para reservar.'); return }
    }
    setError(null)
    setOk(false)
    setGuardando(true)
    const c = { ...nuevo, alias_pago: nuevo.alias_pago.trim() }
    // Sin horarios cargados (servidor anterior o falló la lectura) se guarda como antes.
    const r = horarios ? await accionesGestion.configGuardar(c, vista) : await accionesTenis.configGuardar(c)
    const rh = r.ok && horarios ? await accionesGestion.horariosGuardar(horarios) : null
    setGuardando(false)
    if (!r.ok) { setError(r.mensaje); return }
    if (rh && !rh.ok) { setError(rh.mensaje); onGuardado(); return }
    setOk(true)
    setVersionExtra(v => v + 1)
    onGuardado()
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Titulo>HORARIO GENERAL</Titulo>
        <Text style={estilosTenis.mutedCard}>Se usa para un día sin horario propio.</Text>
        <View style={s.fila}>
          <View style={{ flex: 1 }}>
            <Text style={estilosTenis.label}>ABRE</Text>
            <TextInput style={estilosTenis.input} value={form.hora_desde} onChangeText={t => setForm(f => ({ ...f, hora_desde: t }))} accessibilityLabel="Hora de apertura" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilosTenis.label}>CIERRA</Text>
            <TextInput style={estilosTenis.input} value={form.hora_hasta} onChangeText={t => setForm(f => ({ ...f, hora_hasta: t }))} accessibilityLabel="Hora de cierre" />
          </View>
        </View>

        <Titulo>HORARIO POR DÍA</Titulo>
        {!horarios && !extra.error && <Text style={estilosTenis.mutedCard}>Cargando horarios…</Text>}
        {extra.error && <Aviso tipo="error">No se pudieron cargar los horarios por día. Se guarda sólo el horario general.</Aviso>}
        {horarios?.map(h => (
          <View key={h.dia_semana} style={s.dia}>
            <View style={s.diaTop}>
              <Text style={[estilosTenis.textoCard, { flex: 1 }]}>{DIAS_SEMANA[h.dia_semana - 1]}</Text>
              <Text style={estilosTenis.mutedCard}>{h.activo ? 'Abierto' : 'Cerrado'}</Text>
              <Switch
                value={h.activo}
                onValueChange={v => cambiarDia(h.dia_semana, { activo: v })}
                trackColor={{ true: colors.oro, false: colors.bordeRealce }}
                thumbColor={colors.blanco}
                accessibilityLabel={`${DIAS_SEMANA[h.dia_semana - 1]} abierto`}
              />
            </View>
            {h.activo && (
              <View style={s.fila}>
                <TextInput style={[estilosTenis.input, { flex: 1 }]} value={h.hora_desde} onChangeText={t => cambiarDia(h.dia_semana, { hora_desde: t })}
                  accessibilityLabel={`${DIAS_SEMANA[h.dia_semana - 1]}: abre`} />
                <TextInput style={[estilosTenis.input, { flex: 1 }]} value={h.hora_hasta} onChangeText={t => cambiarDia(h.dia_semana, { hora_hasta: t })}
                  accessibilityLabel={`${DIAS_SEMANA[h.dia_semana - 1]}: cierra`} />
              </View>
            )}
          </View>
        ))}
        {horarios && (
          <>
            <Text style={estilosTenis.label}>DÍAS VISIBLES EN EL CALENDARIO</Text>
            <TextInput
              style={estilosTenis.input}
              value={diasVista}
              onChangeText={t => setDiasVista(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              accessibilityLabel="Días visibles en el calendario"
            />
            <Text style={estilosTenis.mutedCard}>Los socios ven la grilla de estos días; reservar sigue con los días de anticipación.</Text>
          </>
        )}

        {SECCIONES.map(sec => (
          <View key={sec.titulo}>
            <Titulo>{sec.titulo}</Titulo>
            {sec.campos.map(c => (
              <View key={c.k}>
                <Text style={estilosTenis.label}>{c.label.toUpperCase()}</Text>
                <TextInput
                  style={estilosTenis.input}
                  value={valor(c.k)}
                  onChangeText={t => setTextos(x => ({ ...x, [c.k]: t.replace(/\D/g, '') }))}
                  keyboardType="number-pad"
                  accessibilityLabel={c.label}
                />
                {c.pesos && <Text style={estilosTenis.mutedCard}>{formatMonto(Number(valor(c.k)) || 0)}</Text>}
              </View>
            ))}
          </View>
        ))}

        <Titulo>COBRO</Titulo>
        <Text style={estilosTenis.label}>ALIAS PARA TRANSFERENCIAS</Text>
        <TextInput
          style={estilosTenis.input}
          value={form.alias_pago}
          onChangeText={t => setForm(f => ({ ...f, alias_pago: t }))}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Alias para transferencias"
        />
        <View style={s.switchFila}>
          <Text style={[estilosTenis.textoCard, { flex: 1 }]}>No dejar reservar a socios con la cuota atrasada</Text>
          <Switch
            value={form.bloquear_morosos}
            onValueChange={v => setForm(f => ({ ...f, bloquear_morosos: v }))}
            trackColor={{ true: colors.oro, false: colors.bordeRealce }}
            thumbColor={colors.blanco}
            accessibilityLabel="Bloquear socios con la cuota atrasada"
          />
        </View>

        {error && <Aviso tipo="error">{error}</Aviso>}
        {ok && <Aviso>Reglas guardadas.</Aviso>}
        <Boton texto="GUARDAR REGLAS" onPress={guardar} cargando={guardando} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  contenido:  { paddingHorizontal: 20, paddingBottom: 60 },
  fila:       { flexDirection: 'row', gap: 12 },
  switchFila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  dia:        { marginTop: 8, gap: 6 },
  diaTop:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
