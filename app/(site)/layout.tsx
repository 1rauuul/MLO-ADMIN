import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'MLO Admin',
  description: 'Sistema del maestro para generar contenido de MLO',
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
