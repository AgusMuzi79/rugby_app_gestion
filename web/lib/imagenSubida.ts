// Imágenes de noticias y promos (auditoría web-subcomisión T16).
//
// Antes se subía el original del teléfono (4000 px, varios MB) y la lista lo
// bajaba entero para mostrar una miniatura de 64 px. Ahora, antes de subir, se
// achica en el navegador a 1600 px del lado mayor y se guarda como JPEG 0.82;
// se rechaza lo que pase de 10 MB. Las cuentas son puras
// (imagenSubida.check.ts); `prepararImagen` usa canvas y sólo corre en el navegador.

export const LADO_MAXIMO   = 1600
export const CALIDAD_JPEG  = 0.82
export const BYTES_MAXIMOS = 10 * 1024 * 1024

/** Medidas finales: el lado mayor queda en `maximo` como mucho; nunca agranda. */
export function medidasDestino(ancho: number, alto: number, maximo = LADO_MAXIMO): { ancho: number; alto: number } {
  const escala = Math.min(1, maximo / Math.max(ancho, alto))
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto:  Math.max(1, Math.round(alto * escala)),
  }
}

/** Mensaje si el archivo elegido es demasiado grande; null si se puede usar. */
export function errorTamano(bytes: number): string | null {
  return bytes > BYTES_MAXIMOS ? 'La imagen pesa más de 10 MB. Elegí una más liviana.' : null
}

/** Mismo nombre con extensión .jpg (lo que se sube siempre es JPEG). */
export function nombreJpeg(nombre: string): string {
  const punto = nombre.lastIndexOf('.')
  return `${punto > 0 ? nombre.slice(0, punto) : nombre}.jpg`
}

/**
 * Achica la imagen y la convierte a JPEG. Si el navegador no puede leerla
 * (p. ej. HEIC en Chrome) devuelve el archivo original tal cual.
 */
export async function prepararImagen(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const { ancho, alto } = medidasDestino(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    // Fondo blanco: un PNG con transparencia no queda negro en JPEG.
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, ancho, alto)
    ctx.drawImage(bitmap, 0, 0, ancho, alto)
    bitmap.close()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', CALIDAD_JPEG))
    if (!blob) return file
    return new File([blob], nombreJpeg(file.name), { type: 'image/jpeg' })
  } catch {
    return file
  }
}
