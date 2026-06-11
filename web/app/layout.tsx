import type { Metadata } from 'next'
import { Barlow, Barlow_Semi_Condensed } from 'next/font/google'
import './globals.css'

const barlow = Barlow({
  variable: '--font-barlow-var',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
})

const barlowSemi = Barlow_Semi_Condensed({
  variable: '--font-barlow-semi-var',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Uncas Rugby — Panel',
  description: 'Panel de gestión interna del Club Uncas Rugby',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${barlow.variable} ${barlowSemi.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-papel text-tinta antialiased">{children}</body>
    </html>
  )
}
