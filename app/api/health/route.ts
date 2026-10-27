import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Diagnóstico de despliegue: no devuelve secretos ni la cadena de conexión.
export async function GET() {
  const hasSecret = Boolean(process.env.PAYLOAD_SECRET)
  const db = process.env.DATABASE_URL ? 'postgres' : 'sqlite'
  let error: string | null = null

  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('@payload-config')
    await getPayload({ config })
  } catch (e) {
    const err = e as { code?: string; message?: string }
    error = err.code ?? (err.message?.includes('cannot connect') ? 'db_unreachable' : 'init_failed')
  }

  return NextResponse.json({ ok: hasSecret && db === 'postgres' && !error, hasSecret, db, error })
}
