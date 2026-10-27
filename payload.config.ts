import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { es } from '@payloadcms/translations/languages/es'
import { buildConfig } from 'payload'

import { Users } from './collections/Users.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Locally we run on SQLite so the project starts with no infrastructure.
// Deploying with DATABASE_URL (Supabase pooler, port 6543) switches to Postgres.
const databaseUrl = process.env.DATABASE_URL

if (process.env.NODE_ENV === 'production' && !databaseUrl) {
  throw new Error('DATABASE_URL no está definida: en producción no se usa SQLite')
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · MLO Admin' },
  },
  collections: [Users],
  i18n: {
    supportedLanguages: { es },
    fallbackLanguage: 'es',
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: databaseUrl
    ? postgresAdapter({
        pool: {
          connectionString: databaseUrl,
          // shortcut: Supabase usa su propia CA, que Node no trae; no se verifica el certificado.
          // Cuando haya dominio propio, cargar la CA de Supabase en `ssl.ca` y activar rejectUnauthorized.
          ssl: { rejectUnauthorized: false },
        },
        schemaName: 'payload',
      })
    : sqliteAdapter({
        client: { url: process.env.SQLITE_URL || 'file:./mlo-admin.db' },
      }),
})
