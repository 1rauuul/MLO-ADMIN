import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Diagnóstico de despliegue: no devuelve secretos ni credenciales.
export async function GET() {
  const hasSecret = Boolean(process.env.PAYLOAD_SECRET)
  const raw = process.env.DATABASE_URL ?? ''
  const db = raw ? 'postgres' : 'sqlite'

  let dbHost: string | null = null
  let dbPort: string | null = null
  try {
    const url = new URL(raw)
    dbHost = url.hostname
    dbPort = url.port
  } catch {
    dbHost = raw ? 'invalid' : null
  }

  let error: string | null = null

  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('@payload-config')
    await getPayload({ config })
  } catch (e) {
    const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } }
    const msg = `${err.message ?? ''} ${err.cause?.message ?? ''}`
    error =
      err.code ??
      err.cause?.code ??
      (/password authentication failed/i.test(msg)
        ? 'auth_failed'
        : /self-signed|certificate/i.test(msg)
          ? 'tls'
          : /ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED/i.test(msg)
            ? 'timeout'
            : /ENOTFOUND|EAI_AGAIN/i.test(msg)
              ? 'dns'
              : 'init_failed')
  }

  return NextResponse.json({
    ok: hasSecret && db === 'postgres' && !error,
    hasSecret,
    db,
    dbHost,
    dbPort,
    error,
  })
}
