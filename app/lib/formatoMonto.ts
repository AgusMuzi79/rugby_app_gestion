// Montos en pesos con formato argentino: "$ 12.500", "$ 1.500,50", "− $ 200".
// Única fuente para Cobranzas, Eventos, Egresos, Informes y el inicio del
// Manager (auditoría UX manager-subcomisión, T13: antes había copias que
// mostraban "$12.5k" o "$1.3k"). No depende de Intl/toLocaleString, que no da
// el mismo resultado en todos los motores JS. Verificado en formatoMonto.check.ts.

function conPuntos(entero: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function formatMonto(n: number): string {
  const valor = Number.isFinite(n) ? n : 0
  const centavos = Math.round(Math.abs(valor) * 100)
  const entero   = Math.floor(centavos / 100)
  const resto    = centavos % 100
  const cuerpo   = '$ ' + conPuntos(String(entero)) + (resto > 0 ? ',' + String(resto).padStart(2, '0') : '')
  return valor < 0 && centavos > 0 ? '− ' + cuerpo : cuerpo
}
