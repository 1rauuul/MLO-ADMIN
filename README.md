# MLO Admin — sistema del maestro

Panel donde los maestros capturan lecciones, ejercicios, preguntas y evaluaciones, y publican cursos que MLO consume como contenido remoto. Proyecto independiente: Next.js (App Router) + Payload 3.

Estado: **F0** (base, autenticación y roles). Las colecciones de contenido llegan en F1.

## Requisitos

- Node `>= 22.18` (el proyecto usa el soporte nativo de TypeScript de Node). Payload declara soporte desde `24.22.1`; se probó en `24.13.0` con los scripts de este repo.
- No hace falta Docker ni Postgres para desarrollo.

## Arranque local

```bash
npm install
npm run dev
```

- Panel: http://localhost:3000/admin
- El primer usuario que se registra en el panel queda como **admin**. Los siguientes se crean desde *Maestros* y nacen como `maestro`.

Sin `DATABASE_URL` la app usa SQLite en `mlo-admin.db` (ignorado por git). Para usar Postgres/Supabase, copia `.env.example`, llena `DATABASE_URL` (pooler, puerto 6543) y `DATABASE_URL_DIRECT` (5432), y reinicia.

En este repo el `.env` ya apunta a Supabase: el esquema `payload` se crea con `push` en desarrollo y la migración inicial está en `migrations/`.

## Variables

| Variable | Uso |
|---|---|
| `PAYLOAD_SECRET` | Obligatoria. Firma de sesiones y tokens |
| `DATABASE_URL` | Opcional. Postgres/Supabase; sin ella, SQLite |
| `DATABASE_URL_DIRECT` | Solo migraciones contra Postgres |
| `SQLITE_URL` | Opcional. Ruta del archivo SQLite |

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y arranque de producción |
| `npm run generate:types` | Regenera `payload-types.ts` tras cambiar colecciones |
| `npm run generate:importmap` | Regenera `app/(payload)/admin/importMap.js` al añadir componentes propios |
| `npm run payload` | CLI de Payload (`migrate`, `info`, …) |
| `npm run lint` | ESLint |

Los tres scripts de Payload usan `--disable-transpile`: el CLI de Payload carga el config con `tsx`, y esa combinación rompe `undici` en Node 24. Con el flag, Node carga el `.ts` de forma nativa.

## Despliegue

El despliegue lo hace el dueño del repositorio. En el proveedor hay que definir `PAYLOAD_SECRET`, `DATABASE_URL` y `DATABASE_URL_DIRECT`, y correr las migraciones de Payload (`npm run payload migrate`). Las tablas van al esquema `payload`, fuera de `public`.

Notas verificadas en local contra una base vacía:

- `npm run payload migrate` crea el esquema `payload` y las tablas; es el camino para una base nueva. En desarrollo `push` ya las crea, así que no hace falta migrar.
- La conexión directa de Supabase (`db.<ref>.supabase.co`) resuelve **solo IPv6**. En Vercel usa el **pooler** (puerto 6543) como `DATABASE_URL` y deja la directa en `DATABASE_URL_DIRECT` para migrar.
- Las migraciones nuevas las genera el CLI con `import { MigrateUpArgs, ... }`; con `--disable-transpile` hay que separarlo en `import type` o falla al cargar.
- El cliente no verifica la CA de Supabase (`rejectUnauthorized: false` en `payload.config.ts`). Si se quiere verificación, cargar la CA en `ssl.ca`.

## Estructura

```
app/(payload)/     panel y API de Payload
app/(site)/        sitio público: solo redirige a /admin
app/manifest.ts    manifiesto PWA (sin service worker)
collections/       colecciones de Payload (hoy: Users)
payload.config.ts  configuración de Payload y de la base
```
