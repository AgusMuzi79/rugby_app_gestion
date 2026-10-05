// Verificación autocontenida de calendarioImport.ts (no hay runner de tests en el repo).
//   npx tsx web/lib/calendarioImport.check.ts
// Sale con código distinto de 0 si algo falla.

import assert from 'node:assert/strict'
import { parseCalendario, PLANTILLA_CSV, MAX_FILAS_IMPORTACION } from './calendarioImport'

let casos = 0
function caso(nombre: string, fn: () => void) {
  fn()
  casos++
  console.log(`ok   - ${nombre}`)
}

// Resumen compacto de las filas: "dia hh:mm-hh:mm cupo profesor".
function resumen(texto: string): string[] {
  return parseCalendario(texto).filas.map(
    (f) => `${f.dia_semana} ${f.hora_desde}-${f.hora_hasta} ${f.cupo} ${f.profesor ?? '-'}`,
  )
}
function sinErrores(texto: string) {
  const r = parseCalendario(texto)
  assert.deepEqual(r.errores, [], `no se esperaban errores: ${JSON.stringify(r.errores)}`)
  return r.filas
}
function errores(texto: string): string[] {
  return parseCalendario(texto).errores.map((e) => e.motivo)
}

// ─── Delimitadores ────────────────────────────────────────────────────────────

caso('tabulaciones (pegado desde Excel / Sheets)', () => {
  assert.deepEqual(resumen('Lun\t07:00\t08:00\t20\tAna'), ['1 07:00-08:00 20 Ana'])
})
caso("punto y coma (CSV de Excel en español)", () => {
  assert.deepEqual(resumen('Lun;07:00;08:00;20;Ana'), ['1 07:00-08:00 20 Ana'])
})
caso('coma', () => {
  assert.deepEqual(resumen('Lun,07:00,08:00,20,Ana'), ['1 07:00-08:00 20 Ana'])
})
caso('tabulación gana sobre comas dentro de la lista de días', () => {
  assert.deepEqual(resumen('Lun, Mié\t07:00\t08:00\t20\t'), ['1 07:00-08:00 20 -', '3 07:00-08:00 20 -'])
})

// ─── Encabezado, BOM, CRLF, líneas en blanco ─────────────────────────────────

caso('con encabezado se saltea; sin encabezado también funciona', () => {
  assert.deepEqual(resumen('Día;Desde;Hasta;Cupo;Profesor\nLun;07:00;08:00;20;Ana'), ['1 07:00-08:00 20 Ana'])
  assert.deepEqual(resumen('dia;desde;hasta;cupo;profesor\nLun;07:00;08:00;20;Ana'), ['1 07:00-08:00 20 Ana'])
  assert.deepEqual(resumen('Lun;07:00;08:00;20;Ana'), ['1 07:00-08:00 20 Ana'])
})
caso('BOM y CRLF', () => {
  assert.deepEqual(resumen('﻿Día;Desde;Hasta;Cupo\r\nLun;07:00;08:00;20\r\nMar;07:00;08:00;20\r\n'), [
    '1 07:00-08:00 20 -',
    '2 07:00-08:00 20 -',
  ])
})
caso('líneas en blanco se ignoran y el número de fila cuenta las físicas', () => {
  const r = parseCalendario('Día;Desde;Hasta;Cupo\n\nLun;07:00;08:00;20\n\n\nMar;07:00;08:00;xx\n')
  assert.equal(r.filas.length, 1)
  assert.equal(r.filas[0].linea, 3)
  assert.equal(r.errores.length, 1)
  assert.equal(r.errores[0].linea, 6)
  assert.match(r.errores[0].motivo, /^Fila 6:/)
})
caso('filas con sólo delimitadores se ignoran', () => {
  assert.deepEqual(resumen('Lun;07:00;08:00;20\n;;;;\n\t\t\t\n'), ['1 07:00-08:00 20 -'])
})
caso('comas de más al final (exportaciones de Excel) no molestan', () => {
  assert.deepEqual(resumen('Lun,07:00,08:00,20,,,'), ['1 07:00-08:00 20 -'])
})

// ─── Comillas ─────────────────────────────────────────────────────────────────

caso('campos entre comillas con el delimitador adentro', () => {
  assert.deepEqual(resumen('"Lun, Mié, Vie",07:00,08:00,20,"Pérez, Ana"'), [
    '1 07:00-08:00 20 Pérez, Ana',
    '3 07:00-08:00 20 Pérez, Ana',
    '5 07:00-08:00 20 Pérez, Ana',
  ])
})
caso('comillas escapadas y saltos de línea dentro de comillas', () => {
  assert.deepEqual(resumen('Lun;07:00;08:00;20;"Ana ""la Profe"""'), ['1 07:00-08:00 20 Ana "la Profe"'])
  const r = parseCalendario('Lun;07:00;08:00;20;"Ana\nLuis"\nMar;07:00;08:00;20;')
  assert.equal(r.errores.length, 0)
  assert.equal(r.filas[1].linea, 3) // el salto dentro de comillas cuenta como línea física
})
caso('comillas sin cerrar se reportan', () => {
  assert.match(errores('Lun;07:00;08:00;20;"Ana').join('|'), /comillas sin cerrar/)
})

// ─── Días: simples, rangos y listas ──────────────────────────────────────────

caso('días simples: abreviados, completos, con tilde, mayúsculas y números', () => {
  const dias = (d: string) => sinErrores(`${d};07:00;08:00;20`).map((f) => f.dia_semana)
  assert.deepEqual(dias('Lun'), [1])
  assert.deepEqual(dias('lunes'), [1])
  assert.deepEqual(dias('MARTES'), [2])
  assert.deepEqual(dias('Miércoles'), [3])
  assert.deepEqual(dias('mie'), [3])
  assert.deepEqual(dias('Mié'), [3])
  assert.deepEqual(dias('Jue'), [4])
  assert.deepEqual(dias('viernes'), [5])
  assert.deepEqual(dias('Sáb'), [6])
  assert.deepEqual(dias('sabado'), [6])
  assert.deepEqual(dias('Dom.'), [7])
  assert.deepEqual(dias('domingo'), [7])
  assert.deepEqual(dias('1'), [1])
  assert.deepEqual(dias('7'), [7])
})
caso('rangos: Lun-Vie, Lunes a Viernes, con espacios y guion largo', () => {
  const dias = (d: string) => sinErrores(`${d};07:00;08:00;20`).map((f) => f.dia_semana)
  assert.deepEqual(dias('Lun-Vie'), [1, 2, 3, 4, 5])
  assert.deepEqual(dias('Lunes a Viernes'), [1, 2, 3, 4, 5])
  assert.deepEqual(dias('lun - vie'), [1, 2, 3, 4, 5])
  assert.deepEqual(dias('Lun–Mié'), [1, 2, 3])
  assert.deepEqual(dias('Sáb-Dom'), [6, 7])
  assert.deepEqual(dias('1-5'), [1, 2, 3, 4, 5])
  assert.deepEqual(dias('Mié-Mié'), [3])
})
caso('listas: coma, "y", barra y mezcla con rangos', () => {
  const dias = (d: string) => sinErrores(`"${d}";07:00;08:00;20`).map((f) => f.dia_semana)
  assert.deepEqual(dias('Lun, Mié, Vie'), [1, 3, 5])
  assert.deepEqual(dias('Lun y Mié'), [1, 3])
  assert.deepEqual(dias('Lun/Mié'), [1, 3])
  assert.deepEqual(dias('Lun-Mié, Vie'), [1, 2, 3, 5])
  assert.deepEqual(dias('Lun, Lun, Mar'), [1, 2]) // sin repetidos
})
caso('cada fila expandida conserva la línea de origen', () => {
  const r = parseCalendario('Día;Desde;Hasta;Cupo\nLun-Mié;07:00;08:00;20')
  assert.deepEqual(r.filas.map((f) => f.linea), [2, 2, 2])
})

// ─── Horas ───────────────────────────────────────────────────────────────────

caso('formatos de hora: H, H:MM, HH:MM, HH:MM:SS, HH.MM, 7hs, 7h', () => {
  const horas = (d: string, h: string) => {
    const f = sinErrores(`Lun;${d};${h};20`)[0]
    return `${f.hora_desde}-${f.hora_hasta}`
  }
  assert.equal(horas('7', '8'), '07:00-08:00')
  assert.equal(horas('7:30', '9:05'), '07:30-09:05')
  assert.equal(horas('07:00', '08:00'), '07:00-08:00')
  assert.equal(horas('07:00:00', '08:30:00'), '07:00-08:30')
  assert.equal(horas('7.30', '8.45'), '07:30-08:45')
  assert.equal(horas('7hs', '8hs'), '07:00-08:00')
  assert.equal(horas('7h', '8:30 hs'), '07:00-08:30')
  assert.equal(horas('18hs', '19:30h'), '18:00-19:30')
  assert.equal(horas('0:00', '23:59'), '00:00-23:59')
})

// ─── Cupo y profesor ─────────────────────────────────────────────────────────

caso('profesor: recortado y vacío = null; cupo entero', () => {
  const f = sinErrores('Lun;07:00;08:00;25;   Ana Pérez  ')[0]
  assert.equal(f.profesor, 'Ana Pérez')
  assert.equal(f.cupo, 25)
  assert.equal(sinErrores('Lun;07:00;08:00;25;   ')[0].profesor, null)
  assert.equal(sinErrores('Lun;07:00;08:00;25')[0].profesor, null)
  assert.equal(sinErrores('Lun;07:00;08:00;25;Ana / Luis')[0].profesor, 'Ana / Luis')
})

// ─── Errores ─────────────────────────────────────────────────────────────────

caso('día desconocido: mensaje con número de fila', () => {
  const e = errores('Día;Desde;Hasta;Cupo\nLun;07:00;08:00;20\nMar;07:00;08:00;20\nLunez;07:00;08:00;20')
  assert.deepEqual(e, ['Fila 4: el día "Lunez" no se reconoce'])
})
caso('día desconocido dentro de un rango o lista', () => {
  assert.match(errores('Lun-Vix;07:00;08:00;20')[0], /el día "Vix" no se reconoce/)
  assert.match(errores('"Lun, Xyz";07:00;08:00;20')[0], /el día "Xyz" no se reconoce/)
})
caso('rango al revés y día vacío', () => {
  assert.match(errores('Vie-Lun;07:00;08:00;20')[0], /al revés/)
  assert.match(errores(';07:00;08:00;20\nLun;07:00;08:00;20')[0], /falta el día/)
})
caso('hora inválida, hasta <= desde', () => {
  assert.match(errores('Lun;25:00;08:00;20')[0], /hora de inicio "25:00"/)
  assert.match(errores('Lun;07:00;8:99;20')[0], /hora de fin "8:99"/)
  assert.match(errores('Lun;abc;08:00;20')[0], /hora de inicio "abc"/)
  assert.match(errores('Lun;08:00;08:00;20')[0], /posterior/)
  assert.match(errores('Lun;09:00;08:00;20')[0], /posterior/)
  assert.match(errores('Lun;07:00;24:00;20')[0], /hora de fin/)
})
caso('cupo inválido: cero, negativo, decimal, texto, vacío, excedido', () => {
  for (const c of ['0', '-3', '2.5', 'veinte', '', '501']) {
    const e = errores(`Lun;07:00;08:00;${c}`)
    assert.equal(e.length, 1, `cupo "${c}"`)
    assert.match(e[0], /cupo/)
  }
  assert.equal(sinErrores('Lun;07:00;08:00;500')[0].cupo, 500)
})
caso('profesor de más de 80 caracteres', () => {
  assert.match(errores(`Lun;07:00;08:00;20;${'x'.repeat(81)}`)[0], /80 caracteres/)
  assert.equal(sinErrores(`Lun;07:00;08:00;20;${'x'.repeat(80)}`).length, 1)
})
caso('columnas de menos o de más', () => {
  assert.match(errores('Lun;07:00;08:00')[0], /faltan columnas/)
  assert.match(errores('Lun;07:00;08:00;20;Ana;extra')[0], /columnas de más/)
})
caso('todos los errores juntos, una fila mala no esconde a las otras', () => {
  const r = parseCalendario('Lunez;7;8;20\nMar;9;8;20\nMié;7;8;0\nJue;7;8;20')
  assert.equal(r.filas.length, 1)
  assert.deepEqual(r.errores.map((e) => e.linea), [1, 2, 3])
})
caso('varios errores en la misma fila se informan todos', () => {
  const e = errores('Lunez;25:00;8:00;0')
  assert.equal(e.length, 3) // día, hora de inicio, cupo
  assert.ok(e.every((m) => m.startsWith('Fila 1:')))
})
caso('una fila con error no genera filas expandidas', () => {
  assert.equal(parseCalendario('Lun-Vie;07:00;08:00;0').filas.length, 0)
})
caso('texto vacío y sólo encabezado', () => {
  assert.equal(parseCalendario('').errores.length, 1)
  assert.equal(parseCalendario('   \n\n').errores.length, 1)
  assert.equal(parseCalendario('Día;Desde;Hasta;Cupo;Profesor').errores.length, 1)
  assert.equal(parseCalendario('').filas.length, 0)
})
caso('más de 300 franjas expandidas', () => {
  const lineas = Array.from({ length: 60 }, (_, i) => {
    const h = String(Math.floor(i / 4) + 6).padStart(2, '0')
    return `Lun-Dom;${h}:${i % 4 === 0 ? '00' : '15'};${h}:${i % 4 === 0 ? '10' : '25'};5`
  })
  const r = parseCalendario(lineas.join('\n')) // 60 x 7 = 420
  assert.equal(r.filas.length, 420)
  assert.ok(r.errores.some((e) => e.linea === 0 && e.motivo.includes(String(MAX_FILAS_IMPORTACION))))
})

// ─── Plantilla ───────────────────────────────────────────────────────────────

caso('la plantilla descargable: BOM, ";" y se lee sin errores', () => {
  assert.ok(PLANTILLA_CSV.startsWith('﻿'))
  const lineas = PLANTILLA_CSV.replace(/^﻿/, '').split(/\r\n/).filter(Boolean)
  assert.equal(lineas.length, 4) // encabezado + 3 ejemplos
  assert.ok(lineas.every((l) => l.includes(';')))
  const r = parseCalendario(PLANTILLA_CSV)
  assert.deepEqual(r.errores, [])
  assert.equal(r.filas.length, 5 + 3 + 1) // Lun-Vie, Lun/Mié/Vie, Sáb
  assert.equal(r.filas.find((f) => f.dia_semana === 6)?.profesor, null)
  assert.equal(r.filas.find((f) => f.dia_semana === 3 && f.hora_desde === '18:00')?.profesor, 'Luis Gómez / Marta Díaz')
})

console.log(`\n${casos} casos OK`)
