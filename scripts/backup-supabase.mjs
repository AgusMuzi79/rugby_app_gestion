// Backup manual del proyecto Supabase (plan Free = sin backups automáticos).
//
// Uso (desde scripts/):
//   node backup-supabase.mjs              # backup completo
//   node backup-supabase.mjs --keep 12    # cuántos backups conservar (default 8)
//
// Requisitos:
//   - Supabase CLI logueado y proyecto linkeado (`supabase projects list` muestra ●).
//   - Docker Desktop corriendo: `supabase db dump` usa pg_dump dentro de un contenedor.
//
// Guarda en ~/backups-uncas/<fecha-hora>/ (FUERA del repo y de OneDrive: contiene DNIs,
// mails y hashes de contraseña de ~1700 socios — nunca commitear ni subir a la nube sin cifrar):
//   schema.sql   estructura (tablas, RLS, funciones, triggers) del schema public
//   data.sql     datos del schema public
//   auth.sql     usuarios de Auth (schema auth, sólo datos)
//   storage.sql  metadata de Storage (schema storage, sólo datos — NO incluye los archivos)
//
// NO respalda: los archivos de Storage (fotos), secrets de Edge Functions ni el código de las
// funciones (ese vive en el repo, supabase/functions/). Para restaurar: psql < schema.sql, luego
// data.sql (ver `supabase db reset` / docs de Supabase sobre restore desde dump).
//
// Hacer un backup manual SIEMPRE antes de un importador masivo o un cambio de datos en bloque.

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const keepIdx = process.argv.indexOf('--keep')
const KEEP = keepIdx > -1 ? Number(process.argv[keepIdx + 1]) : 8
if (!Number.isInteger(KEEP) || KEEP < 1) {
  console.error('--keep debe ser un entero >= 1')
  process.exit(1)
}

const ROOT = path.join(os.homedir(), 'backups-uncas')
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const dir = path.join(ROOT, stamp)

const docker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true })
if (docker.status !== 0) {
  console.error('Docker no responde. Abrí Docker Desktop, esperá a que diga "running" y reintentá.')
  process.exit(1)
}

fs.mkdirSync(dir, { recursive: true })

const dumps = [
  ['schema.sql',  ['--schema', 'public']],
  ['data.sql',    ['--data-only', '--schema', 'public']],
  ['auth.sql',    ['--data-only', '--schema', 'auth']],
  ['storage.sql', ['--data-only', '--schema', 'storage']],
]

let failed = false
for (const [file, args] of dumps) {
  const out = path.join(dir, file)
  process.stdout.write(`- ${file} ... `)
  const r = spawnSync('supabase', ['db', 'dump', '--linked', ...args, '-f', out], {
    encoding: 'utf8', shell: true,
  })
  const size = fs.existsSync(out) ? fs.statSync(out).size : 0
  if (r.status !== 0 || size === 0) {
    failed = true
    console.log('FALLÓ')
    console.error((r.stderr || r.stdout || '').split('\n').slice(-6).join('\n'))
  } else {
    console.log(`${(size / 1024).toFixed(0)} KB`)
  }
}

if (failed) {
  console.error(`\nBackup INCOMPLETO en ${dir} — no se rotan backups viejos.`)
  process.exit(1)
}

// Rotación: conservar los KEEP más recientes (los nombres ordenan por fecha).
const all = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/.test(d.name))
  .map(d => d.name).sort()
for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
  fs.rmSync(path.join(ROOT, old), { recursive: true, force: true })
  console.log(`(rotado ${old})`)
}

console.log(`\nBackup OK: ${dir}`)
