# Plan: sistema del maestro para generar contenido de MLO

Sistema independiente donde los maestros capturan **lecciones, ejemplos, ejercicios y evaluaciones**, y que MLO consume como servicio.
Define qué servicio consume MLO: el contenido publicado por el maestro, **sin** sincronización de progreso ni cuentas remotas. Esto cierra D1 a D4 de `PLAN-optimizacion-servicios.md` y deja fuera de alcance su sincronización (Fase 5, punto 5; los `sync/*` del punto 8; Fase 6, puntos 2 y 4). El resto de su Fase 5 (puertos, validadores y cliente HTTP) se reutiliza en la sección 7.

> **Actualización (2026-10-26):** la sección 7 se escribió contra `44a7df9`.
> El estado real del consumo en MLO está en
> [`COMPARATIVA-consumo-servicios-vs-plan-maestro.md`](COMPARATIVA-consumo-servicios-vs-plan-maestro.md):
> M1–M7 y M9 ya están implementados, M8 está parcial y el contrato requiere los
> ajustes K1–K18 de esa comparativa.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Stack | Next.js (App Router) + Payload CMS 3 + PostgreSQL, instalable como PWA |
| Conectividad | Los maestros siempre tienen internet al capturar, así que la app funciona con conexión, sin edición offline |
| Infraestructura | **Vercel** (app y API) + **Supabase** (PostgreSQL y, cuando haga falta, Storage). Justificación en la sección 8 |
| Captura | Manual, con formularios (sin IA) |
| Alcance del contenido | **Varios maestros, cada uno con sus cursos y grupos.** El alumno se une a un grupo con un código y recibe el curso de ese grupo; sin grupo, ve el curso base. Detalle de MLO en `PLAN-mlo-contenido-remoto.md` |

## Restricciones

- El contrato que consume MLO reproduce **exactamente** los tipos actuales de MLO (`src/shared/model/entities.ts`, `banks/types.ts`, `unit1.content.ts`). En especial, los ejercicios conservan `id`, `lessonId`, `type`, `prompt`, `instructions`, `correctOrder`, `config`, `explanation` y `example` (`title`, `steps[{ text, why }]`, `hints[]`).
- MLO sigue siendo offline-first: el contenido incluido en la app queda como respaldo y la red es opcional.
- En MLO no se cambian dependencias, comportamiento ni textos sin consultarlo. Esos pasos llevan **[Consultar MLO]**.
- Un id de contenido ya publicado no cambia nunca, porque `attempts.item_id` de MLO depende de él.

---

## 1. Modelo de datos (Payload)

Los maestros son los usuarios del panel de Payload. No hay cuentas de alumno en este sistema: el alumno solo usa un código de grupo desde MLO, y su progreso no sale del teléfono.

| Colección | Campos principales | Notas |
|---|---|---|
| `users` (maestros) | `name`, `email`, `role` (`admin` \| `maestro`) | Auth de Payload. `admin` gestiona usuarios y el curso base; `maestro` gestiona sus propios cursos y grupos |
| `catalogs` (cursos) | `title`, `key` (5 caracteres aleatorios, inmutable; `base` para el curso base), `owner`, `collaborators[]`, `clonedFrom`, `isBase` | Cada maestro crea los suyos. El curso base lo administra `admin` y cualquier maestro puede duplicarlo |
| `groups` | `name`, `catalog`, `owner`, `joinCode` (6 caracteres, único, regenerable), `active`, `period` | Una clase del maestro. Varios grupos pueden compartir curso. Con `active = false` ya no se aceptan uniones |
| `units` | `catalog`, `contentId` (`u1`), `number`, `title`, `description`, `difficulty` (`Fundamental` \| `Intermedio` \| `Avanzado`), `color` (`blue` \| `violet` \| `green`), `position` | |
| `lessons` | `catalog`, `unit`, `contentId` (`l1.2`), `code` (`1.2`), `title`, `eyebrow`, `body`, `codeSample`, `contextTitle`, `contextBody`, `synthesis[]`, `content` (bloques), `position` | `content` es un campo **blocks** con los 5 tipos de MLO: `p`, `h`, `bullets`, `numbers` y `table` |
| `exercises` | `catalog`, `lesson`, `contentId` (`ordn`), `type` (`order` \| `fill` \| `match` \| `crossword`), `prompt`, `instructions`, `correctOrder[]`, `config` (grupo condicional por tipo), `explanation`, `example` (grupo: `title`, `steps[{text, why}]`, `hints[]`) | El `example` va dentro del ejercicio, como en el banco actual |
| `questions` | `catalog`, `lesson`, `contentId`, `type` (`mcq` o los 4 tipos de ejercicio), `prompt`, `options[]`, `answer`, `config`, `explanation` | Banco de evaluación. En opción múltiple, la respuesta se marca con un control "correcta" y `answer` se calcula |
| `evaluations` | `catalog`, `lesson`, `contentId` (`ev1.2`), `title`, `description`, `questionCount` (10), `exerciseCount` (5) | Hoy MLO arma la evaluación con 10 preguntas + 5 ejercicios al azar; aquí queda configurable |
| `releases` | `catalog`, `version` (entero incremental), `contentHash`, `schemaVersion`, `publishedAt`, `publishedBy`, `notes`, `snapshot` (JSON completo) | **Inmutable.** Es lo único que ve MLO |

**Ciclo de vida.** Cada documento de contenido usa borradores de Payload (`versions.drafts`), para guardar trabajo incompleto sin validar y tener historial por documento. Pero MLO no lee documentos sueltos: lee el `release` de un curso, una foto consistente de todo lo publicado en él. Así, MLO nunca recibe un curso a medio editar.

**Ids de contenido (`contentId`).**
- Al crear un documento se propone uno automáticamente (prefijo del tipo más un sufijo corto) y se puede editar mientras el documento no se haya publicado.
- Después del primer release, un hook impide cambiarlo.
- Es único **dentro del curso**, con un índice compuesto `(catalog, contentId)`. Así cada maestro puede usar nombres como `l1.2` en su curso.
- **Id publicado** (el que recibe MLO): `{catalog.key}-{contentId}`, por ejemplo `k7f3q-l1.2`. Es único en todo el sistema sin que el maestro tenga que pensarlo. En el curso base el id publicado es el mismo `contentId`.
- Los ids existentes (`ordn`, `filln`, `ev1.2`, …) se conservan al importar el curso base.
- Las preguntas también reciben `contentId`, lo que resuelve la decisión P1 de `PLAN-fix-review.md`.

**Borrar.** Un documento que ya salió en un release no se elimina: se marca `archived` y desaparece del siguiente release. MLO borra los reactivos retirados y archiva (oculta) las unidades, lecciones y evaluaciones retiradas, para no perder el progreso del alumno (B1 en `PLAN-mlo-contenido-remoto.md`). Solo el dueño del curso o `admin` pueden borrar de verdad, y solo si el documento nunca se publicó.

**`createdBy` y `updatedBy`** se asignan en el servidor desde el usuario actual, en todas las colecciones de contenido.

## 2. Varios maestros, cursos y grupos

**Acceso.** Payload aplica una función de acceso por colección que devuelve un filtro (`Where`), no solo sí o no. Así cada lista del panel ya viene filtrada en el servidor.

| Colección | `maestro` | `admin` |
|---|---|---|
| `catalogs` | Lee y edita los cursos donde es `owner` o está en `collaborators`; lee el curso base para duplicarlo | Todo |
| Contenido (`units`, `lessons`, `exercises`, `questions`, `evaluations`) | Lee y edita si el curso del documento es suyo o colabora en él; el campo `catalog` solo admite esos cursos | Todo |
| `releases` (publicar) | Solo el `owner` del curso | Todo, incluido el curso base |
| `groups` | Solo los suyos; el curso del grupo debe ser propio o de colaboración | Todo |
| `users` | Solo su propio perfil | Todo |

Las reglas viven en un solo módulo (`access/catalog.ts`) con `editableCatalogIds(user)`, que se reutiliza en todas las colecciones. Así no puede haber una colección "olvidada".

**Duplicar curso.** Es una acción del panel. Copia unidades, lecciones, ejercicios, preguntas y evaluación de un curso, normalmente el base, a un curso nuevo del maestro, como borradores:
- se conservan los mismos `contentId`; los ids publicados cambian solos por el prefijo del curso nuevo, sin remapear nada;
- se guarda `clonedFrom`; después los dos cursos son independientes (los cambios del base no llegan a la copia).

**Grupos.**
- El maestro crea un grupo, elige el curso y obtiene un código de 6 caracteres de un alfabeto sin 0, O, 1, I ni L.
- Puede regenerar el código o cerrar el grupo. Cerrarlo solo impide nuevas uniones; quienes ya están siguen recibiendo actualizaciones del curso.
- No hay lista de alumnos: MLO no envía datos del alumno.

**Fuera de alcance:** inscripciones nominales, ver el progreso de los alumnos y sincronizar cambios del curso base hacia sus copias.

## 3. Validación

Se aplica en el servidor: es flexible en borradores, estricta al publicar el documento y vuelve a correr completa al crear un release.

- **Orden:** al menos 3 elementos (para que la mezcla de MLO no sea trivial) y sin repetidos.
- **Completar:** cada oración tiene al menos un `{{respuesta}}` y ningún distractor del banco es igual a una respuesta.
- **Relacionar:** al menos 2 pares, sin conceptos ni definiciones repetidos.
- **Crucigrama:** las palabras se normalizan a `A-ZÑ` (mayúsculas, sin acentos), quedan dentro de `rows`×`cols`, coinciden en las letras donde se cruzan y todas tienen pista. `rows` y `cols` se pueden calcular solos.
- **Opción múltiple:** al menos 2 opciones, sin repetidas y exactamente una correcta.
- **Ejemplo:** `title`, al menos un paso con `text` y `why`, y al menos una pista.
- **Release:** ids únicos en el curso, referencias válidas (lección → unidad), cada evaluación con banco suficiente (al menos `questionCount` preguntas y `exerciseCount` ejercicios en la lección), aviso de preguntas con `prompt` repetido y verificación de que el resultado cumple el contrato v2.

## 4. Editores del panel

La interfaz del panel va en español (i18n de Payload).

| Tipo | Editor | Esfuerzo |
|---|---|---|
| Lección | Campo blocks nativo (párrafo, subtítulo, viñetas, numerada, tabla); la tabla usa un editor de filas y columnas propio | Medio |
| Ordenar | Arreglo nativo con arrastrar para reordenar; el orden capturado es `correctOrder` | Bajo |
| Relacionar | Arreglo nativo de pares `{left, right}` | Bajo |
| Opción múltiple | Arreglo de opciones con una opción marcada como correcta; `answer` se calcula | Bajo |
| Completar | Campo propio: textarea con resaltado de `{{…}}`, botón "convertir selección en hueco" y chips para el banco de distractores | Medio |
| Crucigrama | Campo propio: lista de entradas (palabra, pista, dirección, fila, columna) con la cuadrícula en vivo, marcando choques y salidas de rango | Alto |
| Ejemplo | Grupo nativo dentro del ejercicio: pasos `{text, why}` y pistas | Bajo |
| Vista previa | Panel lateral que muestra el reactivo como lo verá el alumno, reutilizando la lógica de `exercise.logic.ts` de MLO (copiada, sin depender de MLO) | Medio |

Flujo en el panel: **Mis cursos → Unidad → Lección → (Ejercicios | Preguntas | Evaluación)**, con filtros por lección y tipo. Hay un tablero de **"Publicar versión"** por curso que muestra los cambios desde el último release y los errores de validación antes de publicar, y una sección **"Mis grupos"** con el código de cada grupo listo para compartir.

## 5. API para MLO (contrato v2)

La forma exacta de cada respuesta está en la sección "Contrato v2" de `PLAN-mlo-contenido-remoto.md`. Reemplaza al v1 de `docs/api/contrato.md`, y se puede cambiar sin compatibilidad hacia atrás porque ninguna compilación de MLO tiene activo `hybrid`.

Son rutas propias de Next.js bajo `https://<host>/api/mlo/v2`, que leen solo del último `release` de cada curso; no se expone la API REST de Payload con borradores.

| Endpoint | Respuesta | Caché y protección |
|---|---|---|
| `GET /groups/{code}` | Grupo, maestro y curso; `404` si el código no existe y `410` si el grupo está cerrado | `no-store`, con límite de peticiones por IP (regla de Vercel Firewall, por ejemplo 10 por minuto) contra el barrido de códigos |
| `GET /catalogs/{catalogId}/manifest` | Versión, hash y `[{ lessonId, unitId, hash }]` del curso | Corta (`s-maxage=60`, `stale-while-revalidate`), con etiqueta `catalog:{id}` que se invalida al publicar ese curso |
| `GET /catalogs/{catalogId}/lessons/{lessonId}` | Unidad, lección, evaluación, ejercicios, ejemplos y preguntas, siempre completos | Igual que el manifest, más `ETag` con el hash de la lección |

- `catalogId` es la `key` del curso (`base` o 5 caracteres aleatorios). Todos los ids van con el prefijo del curso (sección 1).
- `hash` es el SHA-256 del release en JSON canónico (claves ordenadas), y cada `lessons[].hash` corresponde a esa lección.
- El contenido es **público por id de curso**: no es sensible y la clave no se puede adivinar. MLO no guarda secretos.
- Los errores responden `{ error, message }`.

El contrato se define con Zod en el sistema del maestro. De ahí se generan un **JSON Schema** y un fixture que se copia a `src/shared/services/http/fixtures.ts` de MLO. MLO valida con sus propias funciones (A3 en `PLAN-mlo-contenido-remoto.md`), sin agregar dependencias.

## 6. PWA y despliegue

- **PWA:** `app/manifest.ts` (nombre, iconos, `start_url: /admin`, `display: standalone`) y un service worker con Serwist, que guarda en caché **solo los archivos estáticos** y muestra una página "Sin conexión". No guarda datos del panel ni de la API, para no mostrar contenido viejo.
- **Vercel:**
  - Supabase Postgres vía `@payloadcms/db-postgres`. La app usa el **pooler de conexiones** de Supabase en modo transacción (puerto 6543), porque cada función serverless abre su propia conexión. Las migraciones usan la conexión directa. Variables: `DATABASE_URL`, `DATABASE_URL_DIRECT` y `PAYLOAD_SECRET`.
  - Las tablas de Payload van en un esquema propio (`schemaName: 'payload'`), no en `public`. Así la API REST automática de Supabase (Data API) no las expone. La autenticación de Supabase y RLS no se usan: los permisos los controla Payload.
  - La región de las funciones de Vercel es la misma que la del proyecto de Supabase, para bajar la latencia de cada consulta.
  - Migraciones de Payload versionadas (`payload migrate:create`) que corren en cada despliegue.
  - Despliegues de prueba por rama, con un proyecto de Supabase aparte para pruebas (las ramas de Supabase son opcionales y de pago).
- **Archivos:** hoy no hace falta almacenamiento, porque no hay imágenes en el contenido. Si se agregan, se usa Supabase Storage mediante su endpoint compatible con S3 (`@payloadcms/storage-s3`).
- **Respaldo:** el plan Pro de Supabase hace respaldos diarios, y cada `release` ya es en sí una copia completa del contenido publicado. Además, un `pg_dump` periódico guardado fuera de Supabase.

## 7. Consumo en MLO

El plan de cambios en MLO, con las fases A0 a C (bloqueantes, necesarios y cursos y grupos), está en **`PLAN-mlo-contenido-remoto.md`**. Aquí queda el resultado de la revisión que lo originó.

### Lo que ya existe (commit `44a7df9`, revisado)

Verificado en ese commit: `npx tsc --noEmit` y `npm run lint` sin errores; `npm test` con 48 suites y 297 tests en verde.

- **Cliente HTTP** (`shared/services/http/client.ts`): `fetch` nativo, timeout de 8 s, 2 reintentos con backoff solo para errores de red y 5xx, y errores tipados.
- **Contenido remoto** (`shared/services/content/remoteContent.ts`): pide el manifest y, si el hash cambió, descarga cada lección, la valida con `parse*Seed` y la aplica en una sola transacción (`applyRemoteContent`). Ante cualquier error conserva el contenido local.
- **Modo de datos** (`dataMode.ts`): `EXPO_PUBLIC_DATA_MODE`, con `local` por defecto. Sin `hybrid` no hay ninguna llamada de red.
- **Repositorios** (`DataProvider` y `useRepositories()`): una regla de lint impide importar `expo-sqlite` en los ViewModels.
- **Bloque A de `PLAN-fix-review.md` aplicado:** escrituras que actualizan (upserts), `content_hash`, limpieza de huérfanos e ids explícitos de preguntas con migración de `attempts`.
- **Decisión C9 registrada** en `decisiones-alcance.md` y contrato documentado en `docs/api/contrato.md`.

### Lo que falta para recibir contenido del sistema del maestro

| # | Hallazgo | Impacto | Cambio propuesto |
|---|---|---|---|
| M1 | `syncRemoteContent` se espera dentro de `migrateAndSeed`, que es el `onInit` de `SQLiteProvider` | **Alto.** En modo `hybrid` la pantalla de inicio espera a la red. Con red lenta son hasta ~25 s por el manifest (8 s × 3 intentos más backoff) y otro tanto por las lecciones | Sacar la red del `onInit`: descargar en segundo plano a un área de espera (`remote_lessons`) y aplicar en el siguiente arranque, de forma local |
| M2 | `applyRemoteContent` solo escribe ejercicios, ejemplos y preguntas | **Alto.** No actualiza unidades, lecciones (texto y bloques) ni evaluaciones. Una lección o evaluación nueva viola la llave foránea y **se descarta todo el contenido remoto sin aviso** | Aplicar `unit`, `lesson` y `evaluation` del contrato v2 antes que sus hijos, en una transacción por lección |
| M3 | El contenido remoto nunca borra | **Medio.** Lo que el maestro archiva sigue apareciendo en MLO | Como cada respuesta v2 es completa, borrar los reactivos que ya no vienen y archivar unidades, lecciones y evaluaciones retiradas; `attempts` y el progreso no se tocan |
| M4 | Al actualizar la app cambia el contenido incluido, la limpieza de huérfanos borra lo remoto de la unidad 1 y se vuelve a descargar | **Medio.** Si en ese momento no hay red, el alumno vuelve al contenido incluido hasta la siguiente conexión | Guardar el último contenido remoto válido (por ejemplo, en una tabla `remote_lessons(lesson_id, hash, payload)`) y volver a aplicarlo localmente después de esa sincronización, sin red |
| M5 | La validación revisa la estructura, no las reglas de cada tipo | **Medio.** `config` se acepta sin revisar su forma y no se comprueban `answer` dentro del rango de opciones, los `{{…}}` de completar, el crucigrama ni que cada `lessonId` coincida con la lección. Un reactivo mal formado pasa y falla al mostrarse | Validar por tipo reutilizando `extractFillAnswers` y `crosswordCells` de `exercise.logic.ts`. Si un reactivo falla, se descarta toda la lección |
| M6 | El id de pregunta es opcional y, si falta, se genera a partir de la posición | Bajo con el sistema del maestro, que siempre envía id | En modo `hybrid`, exigir `question.id` |
| M7 | No hay tests de `applyRemoteContent` ni `syncRemoteContent` contra la base | Medio | Tests de: falla de llave foránea que revierte todo, hash que solo se guarda si se aplicó, reaplicación tras sincronizar el contenido incluido, arranque sin red que no bloquea |
| M8 | Ningún perfil de compilación activa `hybrid` (`eas.json` no tiene `env`, `.env.example` no menciona las variables) | Esperado por la decisión C9 | Agregar `EXPO_PUBLIC_DATA_MODE` y `EXPO_PUBLIC_API_URL` al perfil `preview` primero, y documentarlas en `.env.example` **[Consultar MLO: configuración]** |
| M9 | Los hashes por lección del manifest no se usan: cualquier cambio descarga todas las lecciones | Bajo | Descargar solo las lecciones cuyo hash cambió |

M1, M2 y M5 deben resolverse antes de activar `hybrid` en cualquier compilación. M3, M4 y M6 son necesarios para que la edición del maestro, incluido archivar, se refleje fielmente. Con varios cursos se suman ids que chocan entre cursos, el curso activo por cuenta, la unión a grupos y el respaldo de progreso (fase C del plan de MLO).

## 8. Justificación de la infraestructura: Vercel + Supabase frente a AWS, Azure y Google Cloud

**El tamaño del problema.** Hay decenas de maestros con unos pocos cursos cada uno, contenido de texto que pesa unos KB por lección y una lectura de MLO por apertura de la app, que además se sirve casi siempre desde la caché. Ninguna de las ventajas propias de una nube grande se necesita: escalar a millones de usuarios, redes privadas, cumplimiento normativo o decenas de servicios. Lo que sí importa es el tiempo de desarrollo, el costo bajo y la poca operación para un equipo pequeño.

| Criterio | Vercel + Supabase | AWS / Azure / Google Cloud |
|---|---|---|
| **Piezas que hay que armar** | Dos servicios: Vercel resuelve cómputo, CDN, TLS, dominios y despliegues; Supabase resuelve la base de datos y los archivos | Cómputo (Lambda/App Runner, App Service, Cloud Run), base de datos (RDS, Azure Database for PostgreSQL, Cloud SQL), almacenamiento (S3, Blob, GCS), CDN, IAM, red, secretos y CI/CD, cada uno por separado |
| **Compatibilidad con Next.js** | Nativa: Vercel creó Next.js. Caché de rutas, `revalidateTag` (que usa la invalidación del manifest al publicar) y despliegues de prueba por rama sin configurar nada | Requiere adaptadores (OpenNext o Amplify en AWS) o empaquetar en Docker (Cloud Run, Azure Container Apps); en Azure Static Web Apps el soporte de Next.js es parcial |
| **Despliegue** | `git push` publica; cada pull request tiene su URL de prueba | Hay que construir el pipeline (GitHub Actions, CodePipeline, Cloud Build) |
| **Base de datos** | PostgreSQL estándar con panel, editor SQL, respaldos y pooler incluidos | PostgreSQL administrado igual de sólido, pero con tamaño de instancia, red, parámetros y respaldos por configurar |
| **Costo inicial** | Planes gratuitos para desarrollo; en producción, Supabase Pro (alrededor de 25 USD al mes) y Vercel Pro (alrededor de 20 USD por miembro al mes) si el uso es institucional o comercial | La instancia de base de datos administrada más pequeña cobra por hora aunque no se use, más la transferencia de datos, el CDN y el balanceador; las capas gratuitas son temporales o por créditos |
| **Curva de aprendizaje** | Baja: paneles simples, documentación centrada en este caso de uso | Alta: IAM, VPC y facturación por servicio son temas por sí solos |
| **Infraestructura de fondo** | Ambos corren sobre AWS, así que la confiabilidad de base es la misma sin tener que operarla | — |

**Por qué Supabase y no solo Vercel con Neon.** Las dos son PostgreSQL administrado y Payload funciona igual con cualquiera. Supabase suma en un mismo proyecto almacenamiento de archivos compatible con S3, para cuando el contenido tenga imágenes. También ofrece autenticación y tiempo real por si más adelante los alumnos o los grupos necesitan cuentas en línea, sin cambiar de proveedor.

**Riesgo de quedar atado al proveedor: bajo.**
- La app es Next.js + Payload estándar y corre igual en un contenedor de Docker.
- La base de datos es PostgreSQL normal (`pg_dump` y `pg_restore`).
- El almacenamiento usa el protocolo S3.
- No se usan funciones exclusivas de Supabase (autenticación, RLS, Edge Functions) en el núcleo del sistema.

Migrar a Cloud Run + Cloud SQL, a App Service + Azure Database o a ECS + RDS sería un cambio de despliegue, no una reescritura.

**Cuándo convendría una nube grande:**
- si la institución exige un proveedor (por ejemplo, un convenio con Azure o inicio de sesión con Microsoft Entra ID);
- si hay requisitos de residencia de datos o de cumplimiento;
- si se consiguen créditos educativos que cubran el costo;
- si el sistema crece a muchos catálogos con tráfico alto.

Mientras nada de eso aplique, Vercel + Supabase es la opción con menor tiempo de entrega y menor carga de operación.

**Cuidados técnicos de esta combinación** (ya incluidos en la sección 6):
- **Pausa del plan gratuito:** Supabase pausa los proyectos gratuitos que pasan cerca de una semana sin actividad. Producción debe ir en Pro, o al menos en un proyecto con uso constante.
- **Conexiones:** usar el pooler en modo transacción desde las funciones serverless, para no agotar el límite de conexiones.
- **Tablas expuestas:** las tablas de Payload van fuera del esquema `public`, para que la API automática de Supabase no las exponga.
- **Plan Hobby de Vercel:** es solo para uso personal y no comercial. Si el sistema lo opera una institución, corresponde el plan Pro.
- **Precios:** verificar los precios y límites vigentes antes de contratar, porque ambos proveedores los ajustan con frecuencia.

---

## Fases

| Fase | Contenido | Criterio de terminado |
|---|---|---|
| **F0 · Base** | Proyecto Next.js + Payload, Postgres en Supabase, despliegue en Vercel, panel en español, roles `admin`/`maestro`, PWA mínima | Login de maestro en producción; la app se instala en escritorio y móvil |
| **F1 · Modelo, acceso y contrato** | Colecciones de la sección 1, acceso por curso de la sección 2 (`access/catalog.ts`), hooks de `contentId`, `catalog` y `createdBy`, validaciones de la sección 3, contrato Zod v2 y serializador con ids prefijados | Tests de validación por tipo y del serializador; **un maestro no puede leer ni editar el curso de otro**, ni por el panel ni por la API de Payload |
| **F2 · Importación del curso base** | Script que importa `unit1.content.ts`, `lesson1.2.bank.ts`, `lesson1.2.questions.ts`, `richContent.ts` y las unidades y lecciones de `seed.ts` al curso `base`, conservando los ids; crea su primer release | **Prueba de ida y vuelta:** el release del curso base coincide con el contenido incluido hoy en MLO |
| **F3 · Editores** | Editores nativos (ordenar, relacionar, opción múltiple, ejemplo, lección) y propios (completar, crucigrama, tabla) con vista previa | Un maestro captura un ejercicio de cada tipo sin tocar JSON |
| **F4 · Publicación y API** | Tablero "Publicar versión" por curso, releases inmutables, endpoints de manifest y lección v2 con caché e invalidación por curso | Publicar un curso solo invalida su manifest; los releases viejos siguen disponibles |
| **F4b · Cursos y grupos** | "Duplicar curso", colección `groups` con códigos, endpoint `/groups/{code}` con límite de peticiones | Un maestro duplica el curso base, lo publica, crea un grupo y el código devuelve su curso; un código cerrado devuelve `410` |
| **F5 · Consumo en MLO** | Fases A0 a C de `PLAN-mlo-contenido-remoto.md` | Un alumno se une con un código y ve el curso de su maestro; un cambio publicado aparece al reabrir la app desde cero (o al unirse a un grupo); la pantalla de inicio no espera a la red; en modo avión, MLO funciona igual |
| **F6 · Documentación** | Manual del maestro (cursos, grupos, publicar), contrato v2 en `docs/api/`, decisión C10 en `decisiones-alcance.md` y `AGENTS.md` de MLO | Documentos revisados |

```
F0 → F1 → F2 → F3 → F4 → F4b → F5 → F6
                └── F3 y F4 pueden avanzar en paralelo una vez cerrada F2
MLO A0–B (solo con el fixture v2) ──────────┘ puede avanzar desde F1; la fase C necesita F4b
```

## Riesgos

- **Editor de crucigrama:** es la pieza más compleja. Empezar con captura de coordenadas y la cuadrícula en vivo; la colocación automática queda como mejora posterior.
- **Diferencias entre el contrato y MLO:** la prueba de ida y vuelta de F2 y el fixture compartido detectan cualquier diferencia de forma.
- **Un maestro que ve o edita el curso de otro:** todo el acceso pasa por `access/catalog.ts`, con tests de aislamiento en F1.
- **Ediciones simultáneas entre colaboradores de un curso:** el bloqueo de documentos de Payload y el historial por documento.
- **Barrido de códigos de grupo:** límite de peticiones, alfabeto de 31 caracteres y códigos regenerables.
- **Ids publicados que cambian:** bloqueados por un hook después del primer release.

## Pendiente de decidir

1. **Repositorio:** uno nuevo e independiente, `mlo-admin` (recomendado), o un monorepo junto con MLO. Este último obliga a pasar MLO de npm a un workspace.
2. **Dónde se construye:** en este workspace de Figma Make (tiene plantilla de Next.js + Payload; luego habría que configurar la base y las variables para llevarlo a Vercel) o directamente en un repositorio propio conectado a Vercel.
3. **¿Los colaboradores pueden publicar?** Recomiendo que solo publique el dueño del curso, y no agregar todavía un rol revisor.
4. **Ejemplos independientes** `exA1.2`, `exA1.3` y `exA1.4`: hoy no están ligados a ningún ejercicio. Opciones: importarlos como ejercicios con su `example` o retirarlos.
5. **Decisiones D1 a D7 y consultas de MLO:** en `PLAN-mlo-contenido-remoto.md`.
