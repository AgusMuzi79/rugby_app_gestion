#!/usr/bin/env node
// Bump automático del patch de la versión "marketing" (1.0.X) en app.config.js
// y package.json — correr SIEMPRE antes de un build de producción, sin
// excepción, sin chequear App Store Connect primero.
//
// Por qué existe: EAS sólo auto-incrementa el buildNumber/versionCode
// (eas.json → autoIncrement), nunca esta versión. Si Apple aprueba/publica
// la versión actual mientras hay un build nuevo en camino con el mismo
// número, ese build falla al subir (90062/90186, "tren cerrado") — ya pasó
// 4 veces en este proyecto (ver .claude/context/historial.md). Bumpear acá
// siempre, incondicionalmente, hace que el número sólo suba y elimina la
// clase de error entera — no hace falta que el bump "signifique" nada, un
// número de versión salteado en el historial de la store es cosmético.
//
// Uso: node scripts/bump-version.mjs   (desde app/, o desde cualquier lado)

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH  = join(APP_DIR, 'app.config.js')
const PACKAGE_PATH = join(APP_DIR, 'package.json')

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Versión con formato inesperado: "${version}"`)
  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

function bumpFile(path, pattern) {
  const contents = readFileSync(path, 'utf8')
  const match = contents.match(pattern)
  if (!match) throw new Error(`No se encontró el campo "version" en ${path}`)
  const current = match[1]
  const next = bumpPatch(current)
  const updated = contents.replace(pattern, (full) => full.replace(current, next))
  writeFileSync(path, updated)
  return { current, next }
}

const configResult  = bumpFile(CONFIG_PATH, /version:\s*'([\d.]+)'/)
const packageResult = bumpFile(PACKAGE_PATH, /"version":\s*"([\d.]+)"/)

if (configResult.next !== packageResult.next) {
  throw new Error(
    `Desincronización: app.config.js quedó en ${configResult.next}, package.json en ${packageResult.next}. Revisar a mano.`
  )
}

console.log(`Versión bumpeada: ${configResult.current} → ${configResult.next}`)
