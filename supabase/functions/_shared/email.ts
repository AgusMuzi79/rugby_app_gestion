// Envío de mails vía Resend — usado por admin-usuarios (bienvenida) y
// socios-pagos (comprobantes). Fire-and-forget: si falta RESEND_API_KEY o
// CLUB_EMAIL_FROM, no envía y no rompe el flujo que lo llama (igual que antes).
//
// Cuando el club tenga su propia cuenta de Resend con el dominio verificado,
// alcanza con setear los 2 secrets — no hace falta tocar código:
//   supabase secrets set RESEND_API_KEY=re_xxx CLUB_EMAIL_FROM="UNCAS Rugby Club <no-reply@dominio-del-club.com>"

const RESEND_API = 'https://api.resend.com/emails'

type EmailAttachment = { filename: string; content: string }

type EnviarEmailParams = {
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

export async function enviarEmail({ to, subject, html, attachments }: EnviarEmailParams): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('CLUB_EMAIL_FROM')
  if (!resendKey || !from || !to) return false

  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(attachments ? { attachments } : {}),
      }),
    })
    if (!res.ok) {
      console.error('Resend respondió con error:', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('Error enviando email vía Resend:', err)
    return false
  }
}

// Shell visual compartido — misma identidad de marca en todos los mails del club.
export function emailTemplate(bodyHtml: string): string {
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#15110A;padding:32px 24px;text-align:center">
        <h1 style="color:#F5B41C;font-size:22px;margin:0;letter-spacing:2px">UNCAS RUGBY CLUB</h1>
      </div>
      <div style="padding:32px 24px;background:#ffffff">
        ${bodyHtml}
      </div>
      <div style="background:#15110A;padding:16px 24px;text-align:center">
        <p style="color:#8E8574;font-size:12px;margin:0">UNCAS Rugby Club · Gestión Operativa</p>
      </div>
    </div>
  `
}
