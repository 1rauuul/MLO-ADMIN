# Comparativa: consumo de servicios de MLO frente al plan del sistema del maestro

- **Fecha:** 2026-10-26
- **Base revisada:** `44a7df9` **más el árbol de trabajo** (A0–C6 y los arreglos K1–K26 de esta iteración). El `PLAN-sistema-maestro.md` se escribió contra `44a7df9`, por lo que su sección 7 ya no refleja el código.
- **Alcance:** MLO. El sistema del maestro (`mlo-admin`) no está en este repositorio: sus tareas se contrastan con lo que el cliente espera, no se verifican contra un servidor real.
- **Verificación:** `npx tsc --noEmit` sin errores · `npm run lint` sin errores · `npm test` = **53 suites / 330 tests** en la revisión inicial y **54 / 345** tras los arreglos.
- **Revisado:** `src/shared/services/{http,content,data,db}`, `src/features/{groups,profile,modules,evaluations}`, los tests de esas capas, `docs/api/contrato.md`, `PLAN-mlo-contenido-remoto.md`, `PLAN-sistema-maestro.md`, `docs/estado/decisiones-alcance.md`, `eas.json` y `.env.example`.

---

## 1. Veredicto

| # | Conclusión |
|---|---|
| 1 | **El consumo de servicios ya está implementado en MLO.** Las fases A0–C6 de `PLAN-mlo-contenido-remoto.md` están en el árbol de trabajo: área de espera, aplicación diferida, validación por tipo, archivado, curso activo, grupos, respaldo v3 y pruebas. |
| 2 | **La sección 7 del plan maestro quedó desfasada.** M1, M2, M3, M4, M5, M6, M7 y M9 están hechos; M8 está a medias (`.env.example` sí, `eas.json` no). |
| 3 | **La brecha ya no está en el cliente sino en el contrato.** Hay incompatibilidades que rompen la integración si el servidor serializa “como dice el plan maestro” sin ajustes: `version` numérica, `examples[]`, el caso del código de grupo, preguntas de ordenar y campos vacíos omitidos. |
| 4 | **La fase F5 del plan maestro debe redefinirse**: ya no es “implementar A0–C”, sino “cerrar contrato, probar ida y vuelta y activar `hybrid` en un perfil”. |
| 5 | **Falta la prueba que de verdad cierra el riesgo:** un release real del curso base aplicado por el cliente, y una compilación `preview` con `hybrid` contra el servidor. |
| 6 | **El trabajo A0–C6 está sin commitear.** Eso no invalida el código, pero sí el criterio de terminado de F5 hasta que se revise y se confirme en un commit. |

---

## 2. Qué existe hoy en el consumo de servicios

| Capa | Implementación | Estado |
|---|---|---|
| Cliente HTTP | `src/shared/services/http/client.ts`: `fetch` nativo, timeout 8 s, 2 reintentos con backoff solo para red y 5xx, errores `NetworkError`/`HttpError`/`ParseError` | Completo |
| Modo de datos | `src/shared/services/data/dataMode.ts`: `EXPO_PUBLIC_DATA_MODE`, `local` por defecto | Completo |
| Puertos | `DataProvider.tsx` + `useRepositories()`; los ViewModels no importan `expo-sqlite` | Completo |
| Contrato | `remoteContent.ts`: parseo de grupo, manifest y lección; validación por tipo en `remote/validateLessonPayload.ts` | Completo con los matices de la sección 4 |
| Descarga | `ContentSyncProvider.tsx`: segundo plano al montar y al volver a primer plano, mínimo 15 min | Completo |
| Área de espera | `remote_lessons` / `remote_catalogs`; solo se descargan las lecciones cuyo hash cambió | Completo |
| Aplicación local | `applyStagedContent.ts` + `applyLessonPayload` en `seed.ts`: unidad → lección → evaluación → ejercicios → ejemplos → preguntas, una transacción por lección | Completo |
| Archivado | Lecciones fuera del manifest, su evaluación y unidades sin lecciones activas; `attempts` y progreso intactos | Completo |
| Grupos | `src/features/groups/*`: unirse, código, curso activo por cuenta, salir/cambiar, `410` y `404` | Completo |
| Respaldo | v3 con grupo; v1/v2 siguen aceptándose; restaura el grupo aunque el curso ya esté descargado | Completo |
| Arranque | `migrateAndSeed`: migraciones → contenido incluido → `applyStagedContent`; **sin red** | Completo |
| Activación | `eas.json` no tiene `env`; `.env.example` sí documenta las variables | **Parcial** |

**Fuera de alcance confirmado:** no hay `sync/*`, `auth/*`, outbox ni cuentas remotas en el código; el único tráfico es contenido y grupos. SQLite sigue siendo la fuente de verdad y el progreso no sale del dispositivo. Las decisiones C9/C10 están registradas en `docs/estado/decisiones-alcance.md` y el contrato v2 en `docs/api/contrato.md`.

**Fortalezas del consumo actual**

- El arranque no espera a la red y el modo `local` no hace ninguna petición.
- La descarga valida **antes** de escribir y no avanza el manifest si una lección falla.
- La aplicación es atómica por lección y conserva el contenido anterior ante cualquier error.
- El archivado preserva `attempts`, `module_progress` y `evaluation_results`.
- Los ids globales y el filtro por `catalog_id` permiten varios cursos y cuentas en el mismo dispositivo.
- El respaldo v3 restaura el grupo y sigue aceptando v1/v2.
- La suite cubre parseo, validación, aplicación, grupos, curso activo y migraciones.

**Lo que el plan maestro acierta y conviene conservar:** offline-first, red fuera del arranque, contenido público por clave de curso, archivado en vez de borrado, ids globales, grupos por código, validación en el servidor y la prueba de ida y vuelta como criterio de F2.

---

## 3. Comparación con las fases y la sección 7 del plan maestro

### 3.1 Sección 7: “lo que falta” (M1–M9)

| # | Lo que decía el plan | Estado real | Evidencia |
|---|---|---|---|
| M1 | La red se esperaba en `migrateAndSeed` | **Hecho.** La red salió del `onInit`; la descarga es en segundo plano y se aplica al siguiente arranque | `ContentSyncProvider.tsx`, `database.ts:33-58`, `database.ts:291-294` |
| M2 | Solo se escribían ejercicios, ejemplos y preguntas | **Hecho.** Se aplica unidad, lección, evaluación, ejercicios, ejemplos y preguntas | `seed.ts:567-678` |
| M3 | El contenido remoto nunca borraba | **Hecho.** Reemplazo completo por lección; archivado de lecciones/evaluaciones/unidades | `seed.ts:643-676`, `applyStagedContent.ts:70-116` |
| M4 | Una actualización de la app borraba lo remoto del curso base | **Hecho.** `applied_hash = NULL` y reaplicación local sin red | `seed.ts:513-530` |
| M5 | La validación no revisaba las reglas de cada tipo | **Hecho.** Reglas por tipo, ids, referencias y bloques | `validateLessonPayload.ts:115-262`, `316-443` |
| M6 | El id de pregunta era opcional | **Hecho.** `question.id` obligatorio en remoto | `validateLessonPayload.ts:398-400` |
| M7 | Faltaban tests de aplicación y sincronización | **Hecho, con un límite:** los tests usan un doble de SQLite; no prueban FKs reales en dispositivo | `applyLessonPayload.test.ts`, `remoteContent.test.ts`, `database.test.ts` |
| M8 | Ningún perfil activaba `hybrid` | **Parcial.** `.env.example` documenta; `eas.json` sigue sin `env` | `.env.example`, `eas.json` |
| M9 | Cualquier cambio descargaba todas las lecciones | **Hecho.** Solo las que cambiaron de hash | `remoteContent.ts:178-190` |

### 3.2 Fases A0–C6 del plan de MLO

| Fase | Estado | Nota |
|---|---|---|
| A0 · Migración 16 | Hecho | `DATABASE_VERSION = 16`; `remote_*`, `account_group`, `catalog_id`, `archived_at`, conteos de evaluación |
| A1 · Red fuera del arranque | Hecho | `ContentSyncProvider` + `applyStagedContent` |
| A2 · Jerarquía completa | Hecho | `applyLessonPayload` por lección |
| A3 · Validación por tipo | Hecho | Incluye cruces de crucigrama y `extractFillAnswers` |
| B1 · Reemplazo y archivado | Hecho | Reactivos retirados se borran; lecciones/evaluaciones/unidades se archivan |
| B2 · Remoto sobrevive a la actualización | Hecho | Reaplicación del curso base sin red |
| B3 · Id de pregunta obligatorio | Hecho | — |
| B4 · Tests de integración | Hecho con mock | Falta una prueba con SQLite real o en dispositivo |
| B5 · Activación por perfil | **Pendiente** | `eas.json` sin `env` |
| C1 · Curso activo por cuenta | Hecho | `useActiveCatalog`, filtros por `catalog_id`, reanudación filtrada |
| C2 · Unirse a un grupo | Hecho | `JoinGroupScreen`, `useJoinGroup` |
| C3 · Salir/cambiar | Hecho | `ProfileScreen` + `clearAccountGroup` |
| C4 · Actualizar todos los cursos en uso | Hecho | `catalogsInUse` recorre `base` + `account_group` |
| C5 · Respaldo v3 | Hecho | Exporta/importa grupo; v1/v2 aceptados |
| C6 · Tests de la fase | **Parcial** | No hay test de dos cuentas en el mismo dispositivo ni de `refreshCatalogs` con varios cursos |

### 3.3 Fases F0–F6 del plan maestro

| Fase | Estado desde MLO | Qué falta para cerrarla |
|---|---|---|
| F0 · Base | No verificable aquí | Servidor Next.js/Payload desplegado |
| F1 · Modelo, acceso y contrato | No verificable aquí | Contrato Zod + fixture generado |
| F2 · Importación del curso base | **Parcial desde MLO** | La prueba de ida y vuelta real no existe en este repositorio |
| F3 · Editores | No verificable aquí | Que cada editor emita la forma exacta del contrato (K4/K5) |
| F4 · Publicación y API | No verificable aquí | Caché/invalidación de lecciones, no solo del manifest |
| F4b · Cursos y grupos | No verificable aquí | Endpoint real de grupos |
| F5 · Consumo en MLO | **Casi completo** | Contrato v2.1, endurecimiento, `eas.json` y prueba real |
| F6 · Documentación | **Parcial** | Actualizar la sección 7 del plan maestro y el contrato con las decisiones D-a…D-l de este documento |

### 3.4 Infraestructura del plan maestro (sección 8)

| Elemento | Impacto en MLO | Acción |
|---|---|---|
| Vercel (app y API) | Solo cambia `EXPO_PUBLIC_API_URL`; no hay secretos en el cliente | Ninguna |
| Supabase Postgres, pooler y esquema `payload` | Sin impacto: MLO no habla con la base | Ninguna |
| CDN y caché por etiqueta | Un manifest nuevo puede convivir con lecciones viejas en caché | K9 y E1 |
| Límite de peticiones por IP | Afecta a un aula tras NAT y MLO no trata `429` | K12 y E3 |
| Supabase Storage / imágenes | MLO no tiene bloque de imagen | K8 |
| Plan gratuito de Supabase / Hobby de Vercel | Si el proyecto se pausa o el plan no es comercial, MLO conserva lo local pero deja de recibir cambios | Producción en planes de pago si el uso es institucional |
| Respaldos y `pg_dump` | Sin impacto en MLO | Ninguna |
| PWA del panel | Sin impacto en MLO | Ninguna |
| CORS (no está en el plan) | Solo afecta a Expo web | K21 |

---

## 4. Contrato: diferencias que rompen o degradan la integración

> Los hallazgos K1–K26 describen la revisión inicial. La sección 4.5 marca
> cuáles ya se corrigieron en MLO y cuáles dependen del servidor o de una
> decisión.

### 4.1 Bloqueantes (P0)

| # | Diferencia | Efecto en MLO | Corrección propuesta |
|---|---|---|---|
| **K1** | `releases.version` es **entero incremental** en el plan maestro; el contrato v2 y el fixture usan **string** (`"2026-10-26"`). El cliente ya acepta string o entero y normaliza a string. | Si el servidor responde `version: 3`, MLO lo acepta como `"3"`; el contrato debe fijar la forma canónica. | El API serializa `version` como string (`String(release.version)`); entero en la base. |
| **K2** | El modelo del maestro no tiene colección `examples`; solo `example` dentro del ejercicio. El contrato v2 pide `examples[]` con `ExampleSeed` completo (`id`, `lessonId`, `type`, `title`, `prompt`, `explanation`, `steps`, `hints`). | MLO ya trata `examples` omitido como `[]`. Si se copia el `example` del ejercicio dentro de `examples[]`, le faltan campos y choca el id con el del ejercicio. | Mantener **`examples: []`** y los ejemplos dentro de `exercises[].example`. Los ejemplos independientes (`exA1.2`, …) hoy **no se muestran**: `useExamplesEngine` solo pinta el ejemplo cuyo id coincide con un ejercicio. Decidir retirarlos o ligarlos a un ejercicio. |
| **K3** | El plan maestro no define si el código de grupo se guarda en mayúsculas; MLO ya lo normaliza a **mayúsculas** (`normalizeGroupCode` y `fetchGroup`). | Si el servidor guarda minúsculas y compara exacto, las uniones fallan; el código canónico debe ser mayúsculas. | El servidor acepta la forma canónica en mayúsculas (o compara sin distinguir mayúsculas). |
| **K4** | Payload puede omitir campos vacíos (`codeSample`, `contextTitle`, `contextBody`, `synthesis`, `correctOrder`, `options`, `answer`). MLO ya los normaliza, pero el contrato debe ser explícito. | Una lección con un campo omitido ya no se rechaza; el serializador debe emitirlos igualmente para no depender del cliente. | El serializador emite siempre: strings vacíos `""`, arreglos `[]`, `answer: 0` cuando no aplica. |
| **K5** | Preguntas de tipo `order`: el plan maestro solo dice `options[]` y `answer`; MLO interpreta **`options` como el orden correcto** y `answer` no se usa. | Si el servidor manda las opciones desordenadas y el orden en otro campo, la evaluación califica mal. | Definir en el contrato: para `order`, `options` = secuencia correcta y `answer = 0`. Para `fill`/`match`/`crossword`, `options = []`, `answer = 0` y la verdad va en `config`. |
| **K6** | MLO rechaza un manifest con `lessons: []`. | Un curso con todas las lecciones archivadas **nunca se actualiza** y las lecciones viejas siguen visibles. | Recomendado: el servidor **no permite publicar un release vacío** y MLO conserva el rechazo como defensa. Si se quiere permitir vaciar un curso, hay que cambiar el parser y probar el archivado total. |
| **K7** | Si el release base no incluye **todas** las lecciones activas, MLO archiva las que no vienen. | Publicar un base parcial (por error o por secciones) **oculta unidades 2–5** en todos los dispositivos. | El release de `base` debe ser un **snapshot completo** de las lecciones activas; validarlo en el servidor. |
| **K8** | El plan maestro prevé imágenes en Storage; el contrato v2 solo admite bloques `p`, `h`, `bullets`, `numbers` y `table`. | Una imagen publicada hace que `validateLessonPayload` **descarte la lección completa**. | Imágenes fuera de alcance hasta que MLO añada un bloque de imagen y su validador. Documentarlo como límite del contrato. |

### 4.2 Importantes (P1)

| # | Hallazgo | Efecto | Corrección |
|---|---|---|---|
| **K9** | `refreshCatalog` no compara `payload.hash` con el hash del manifest (`remoteContent.ts:186-190`). | Si el CDN sirve una lección vieja con hash viejo, MLO la acepta y la aplica; el alumno ve contenido anterior hasta el siguiente ciclo. | Rechazar la lección si `payload.hash !== manifest.lessons[].hash`; además, invalidar las lecciones con la etiqueta `catalog:{id}` o versionar la URL. |
| **K10** | La validación de ids solo compara contra **otros cursos** y dentro de la misma lección (`remoteContent.ts:124-153`); no contra otras lecciones del mismo curso. | Dos lecciones del mismo curso con el mismo id de ejercicio/evaluación/pregunta pasan; al aplicar, una reasigna el contenido de la otra y rompe `attempts`. | El servidor ya debe validar ids únicos en el curso; añadir en MLO una comprobación contra lo ya almacenado/en espera del mismo `catalog_id`. |
| **K11** | El fixture de MLO es manual; no se genera desde el esquema Zod del servidor. | Deriva silenciosa entre lo que el servidor publica y lo que el cliente espera. La prueba de ida y vuelta de F2 no existe. | Generar el fixture desde el esquema, versionarlo y comprobar su hash en CI. Ver E0/E2. |
| **K12** | Límite de 10 peticiones/min por IP en `/groups/{code}`. MLO no trata `429` (`remoteContent.ts:265-279`). | Un aula completa detrás de un NAT puede agotar el límite al unirse; el alumno ve **“No hay conexión”** y debe reintentar a mano. | Limitar **fallos** de código o permitir ráfagas; mapear `429` a un mensaje propio y respetar `Retry-After`. |
| **K13** | `isGroupError` se usa tanto para el grupo como para el contenido (`useJoinGroup.ts:92-95`). Un `404` del manifest o de una lección se convierte en `not_found`. | Al unirse, un curso sin publicar muestra **“No encontramos un grupo con ese código”**. | Separar errores de grupo y de contenido; definir el estado de “grupo existe pero curso sin release”. |
| **K14** | `apiBaseUrl()` devuelve `''` si falta `EXPO_PUBLIC_API_URL` (`client.ts:138-142`); además no normaliza la barra final. | En `hybrid` las peticiones fallan en silencio (solo `console.warn` en desarrollo); con `/` final se generan `//`. | Validar la URL al arrancar en `hybrid` y normalizarla; fallar con un mensaje claro en desarrollo. |
| **K15** | El respaldo decide si hay contenido con el catálogo del **respaldo**, pero guarda el catálogo que devuelve el **servidor** (`useProgressBackup.tsx:62-77`). | Si el maestro cambió el curso del grupo, se guarda el catálogo nuevo sin descargarlo y el alumno ve el curso vacío. | Calcular `hasContent` con `info.catalog.id` y descargar si falta; o impedir cambiar el catálogo de un grupo. |
| **K16** | MLO no vuelve a resolver el código de grupo después de unirse (`remoteContent.ts:239-244` usa el `catalog_id` guardado). | Si el maestro cambia `groups.catalog`, nombre o docente, los alumnos siguen con el curso/valores anteriores. | Hacer `groups.catalog` inmutable o añadir una re-resolución ligera al arrancar. |
| **K17** | El contenido descargado se aplica en `onInit` (arranque frío) o al unirse. | “Reabrir la app” desde segundo plano **no aplica** lo descargado; el criterio F5 puede no cumplirse como se lee. | Decidir: mantener D4 (“siguiente arranque” = proceso nuevo) y corregir la redacción de F5, o aplicar al volver a primer plano cuando no haya actividad. |
| **K18** | `eas.json` no define `EXPO_PUBLIC_DATA_MODE` ni `EXPO_PUBLIC_API_URL`. | El APK de `preview` no activa `hybrid`; el `.env` no se sube al build de EAS. | Añadir `env` a `preview` (y `production` en `local` hasta validar) o usar variables de EAS. |

### 4.3 Menores (P2)

| # | Hallazgo | Corrección |
|---|---|---|
| K19 | `parseCatalogManifest` ya exige hash no vacío, rechaza lecciones repetidas y una versión numérica que retrocede. | Se mantiene como defensa de caché. |
| K20 | No se usa `ETag`/`If-None-Match`, aunque el contrato lo ofrece. | No es bloqueante: el hash por lección ya evita descargas. Se puede dejar como mejora. |
| K21 | CORS no está en el plan maestro; Expo web (`demo:web`) sí existe. | Añadir CORS si la web va a consumir el API; en móvil no aplica. |
| K22 | `refreshCatalogs` se invoca con `void` sin `.catch` (`ContentSyncProvider.tsx:28`); un fallo de `catalogsInUse` deja una promesa rechazada sin manejar. | Añadir `.catch` con log de desarrollo. |
| K23 | La unión descarga las lecciones en serie con timeout de 8 s y 2 reintentos. Un curso grande puede tardar minutos sin barra de progreso ni cancelación. | Mostrar “lección X de N” y considerar un límite global de tiempo; opcional paralelizar 2–3 descargas. |
| K24 | Los `DELETE … NOT IN (…)` con muchos ids pueden superar el límite de parámetros de SQLite (999 en versiones antiguas; 32766 en las recientes). | Imposible con cursos normales; anotarlo como límite si se prevén cientos de lecciones por curso. |
| K25 | Los tests de aplicación usan un doble de SQLite; no demuestran FKs reales. | Añadir la prueba de ida y vuelta (E2) y una prueba manual en dispositivo con SQLite real. |
| K26 | `examples[]` independientes se guardan pero no se muestran (`useExamplesEngine.ts:151`). | Retirarlos del release o ligarlos a un ejercicio; ver K2. |

### 4.4 Validación: quién comprueba qué

| Regla | Servidor (plan maestro) | Cliente (MLO) | Implicación |
|---|---|---|---|
| Ordenar | ≥3 elementos, sin repetidos | ≥2, sin repetidos | El servidor es más estricto; no hay conflicto |
| Completar | `{{…}}` por oración y ningún distractor igual a una respuesta | `{{…}}` y `bank` como arreglo | El servidor debe comprobar los distractores |
| Relacionar | ≥2 pares, sin repetidos | Igual | Sin conflicto |
| Crucigrama | Normaliza a `A-ZÑ`, límites, cruces y pistas | Exige mayúsculas, límites, cruces y pista | El servidor debe normalizar antes de serializar |
| Opción múltiple | ≥2 opciones, sin repetir, exactamente una correcta | ≥2, sin repetir, `answer` en rango | El servidor debe garantizar “exactamente una” |
| Ejemplo | `title`, ≥1 paso y ≥1 pista | Pasos con `text`/`why`; `hints` como arreglo (puede ir vacío) | El servidor debe exigir título y pista |
| Evaluación | Banco suficiente para `questionCount`/`exerciseCount` | Solo exige conteos positivos | El servidor debe validar el banco |
| Ids | Únicos en el curso | Únicos en la lección y contra otros cursos | **K10**: falta la comprobación entre lecciones |
| Hash y contrato | Zod + release | Parseo manual | **K9/K11**: el cliente no verifica el hash del manifest |

**Conclusión:** el cliente no sustituye la validación del servidor. El servidor es la puerta; MLO solo evita aplicar contenido basura.

### 4.5 Estado de la implementación (2026-10-26)

| Issue | Estado |
|---|---|
| K1 | **Resuelto en MLO:** `version` string o entera se normaliza a string. |
| K2 | **Decisión:** `examples: []` y ejemplos dentro de `exercises[].example`; el cliente ya acepta la lista vacía u omitida. |
| K3 | **Resuelto en MLO:** el código se envía en mayúsculas desde la pantalla y desde el respaldo. |
| K4 | **Resuelto en MLO:** los campos vacíos omitidos se normalizan; el servidor debe emitirlos igualmente. |
| K5 | **Pendiente de contrato:** `order` con `options` = secuencia correcta y `answer = 0`. |
| K6 | **Decisión del servidor:** bloquear releases vacíos; MLO conserva el rechazo. |
| K7 | **Decisión del servidor:** el release de `base` debe ser un snapshot completo. |
| K8 | **Fuera de alcance:** imágenes hasta que MLO tenga bloque de imagen. |
| K9 | **Resuelto en MLO:** se compara `payload.hash` con el manifest y se descarta si no coincide. |
| K10 | **Resuelto en MLO:** se detectan ids repetidos entre lecciones contra el área de espera. |
| K11 | **Pendiente del servidor:** generar el fixture desde Zod y verificarlo en CI. |
| K12 | **Resuelto en MLO:** `429` se muestra como `rate_limited`; el servidor debe enviar `Retry-After`. |
| K13 | **Resuelto en MLO:** errores de grupo y de contenido están separados (`content_missing`). |
| K14 | **Resuelto en MLO:** URL normalizada y `ConfigError` si falta. |
| K15 | **Resuelto en MLO:** el respaldo mira el catálogo que devuelve el servidor. |
| K16 | **Pendiente del servidor:** `groups.catalog` inmutable o re-resolución. |
| K17 | **Decisión:** se mantiene D4 (arranque frío o unión); F5 debe redactarse igual. |
| K18 | **Pendiente:** falta el host real para `eas.json`. |
| K19 | **Resuelto en MLO:** hash vacío, lecciones repetidas y versión numérica que retrocede. |
| K20 | **No aplica:** el hash por lección evita descargas; ETag queda como mejora. |
| K21 | **Pendiente del servidor:** CORS solo si Expo web consume el API. |
| K22 | **Resuelto en MLO:** `refreshCatalogs` tiene `.catch`. |
| K23 | **Pendiente:** progreso de descarga y límite global (P2). |
| K24 | **Documentado:** límite de parámetros de SQLite. |
| K25 | **Pendiente:** prueba con SQLite real/en dispositivo. |
| K26 | **Decisión:** retirar los ejemplos independientes inertes. |

---

## 5. Riesgos del plan maestro vistos desde MLO

| Riesgo | Por qué importa en MLO | Mitigación |
|---|---|---|
| **Contrato que cambia sin cambiar `schemaVersion`** | MLO descarta el manifest o aplica una forma distinta; el alumno deja de recibir contenido. | Congelar v2.1 y versionar cualquier cambio de forma. |
| **Release base parcial o vacío** | Un base parcial archiva lo que no viene; uno vacío se rechaza y deja el contenido anterior. | Snapshot completo y release no vacío; validación en el servidor. |
| **CDN con lecciones viejas** | El cliente no compara hashes y aplica contenido anterior. | `payload.hash === manifest.hash` + invalidación por etiqueta. |
| **Límite por IP en un aula** | Bloquea uniones legítimas y MLO lo muestra como falta de red. | Limitar fallos, no éxitos; `429` con mensaje y reintento. |
| **`groups.catalog` editable** | Los alumnos quedan en un curso que ya no corresponde. | Inmutabilidad o re-resolución. |
| **Ids repetidos dentro del curso** | Corrupción de contenido y pérdida de trazabilidad en `attempts`. | Validación de release + defensa en el cliente. |
| **Imágenes** | El contrato no las soporta y la lección se descarta. | Fuera de alcance explícito. |
| **Fixture manual** | Deriva entre servidor y cliente; F2 no prueba nada real. | Fixture generado + prueba de ida y vuelta. |

---

## 6. Plan adaptado

El plan maestro sigue siendo válido para el servidor (F0–F4b). Lo que cambia es **F5** y el orden: primero se cierra el contrato y la prueba de ida y vuelta; después se activa `hybrid`.

```
E0 ─► E1 ─► E2 ─► E4 ─► E5
  └────► E3 ────┘
E3 puede correr en paralelo con E1/E2.
```

### E0 · Cerrar el trabajo pendiente y congelar el contrato (P0)

1. Revisar, commitear y verificar el trabajo A0–C6 que hoy está en el árbol de trabajo.
2. Resolver K1–K8 en `docs/api/contrato.md` y en el esquema Zod del servidor.
3. Generar el fixture del contrato desde el esquema e incluirlo en `src/shared/services/http/fixtures.ts`, con un test que lo valide.
4. Añadir un fixture con **los cinco tipos** (order, fill, match, crossword, mcq), no solo `order`.
5. Documentar la política de `version`, `examples`, release vacío, base parcial, código de grupo y preguntas de ordenar.

**Terminado cuando:** `tsc`, `lint` y `test` verdes; el contrato y el fixture cubren todos los tipos; las decisiones K1–K8 están escritas.

### E1 · Servidor F0–F4b (heredado, sin cambio de alcance)

1. Ejecutar las fases F0–F4b del plan maestro.
2. Incorporar al serializador y a los validadores: `version` string, `examples: []`, código de grupo sin distinguir mayúsculas, campos vacíos explícitos, `order` con `options` correctas y `answer = 0`, release base completo/no vacío, imágenes fuera de alcance.
3. Calcular el hash de la lección sobre el **payload v2 serializado** (sin incluir el propio campo `hash`), no sobre el documento de Payload.
4. Etiquetar manifest y lecciones con `catalog:{id}` para invalidar ambos al publicar.
5. Añadir CORS si la web va a consumir el API.

**Terminado cuando:** se cumplen los criterios del plan maestro y el contrato de E0 se valida contra el servidor.

### E2 · Prueba de ida y vuelta del curso base (P0)

1. Script en el servidor que exporte el release del curso `base` como JSON.
2. Test en MLO que cargue ese JSON, ejecute `parseCatalogManifest`, `validateLessonPayload` y `applyLessonPayload`, y compare con el contenido incluido:
   - unidades y lecciones (ids, títulos, orden);
   - ejercicios, ejemplos embebidos y preguntas (ids y conteos);
   - `questionCount` / `exerciseCount`;
   - ids de preguntas que usa `attempts` (`ev1.2-q*`, `ev1.2-bank-q*`);
   - deduplicación de `ev1.2` (`isBankDuplicate`).
3. Excluir del comparativo los ejemplos independientes inertes o retirarlos del release.

**Terminado cuando:** el release base reproduce el contenido incluido sin perder campos ni ids, y la prueba corre en CI.

### E3 · Endurecer MLO (P1)

1. **K9:** comparar `payload.hash` con el hash del manifest.
2. **K10:** detectar ids repetidos entre lecciones del mismo curso.
3. **K13:** separar errores de grupo y de contenido; definir “curso sin release”.
4. **K14:** validar/normalizar `EXPO_PUBLIC_API_URL` en `hybrid`.
5. **K15:** corregir `hasContent` en la importación del respaldo.
6. **K12:** mapear `429` y mostrar un mensaje propio.
7. **K17:** decidir arranque frío vs. primer plano y ajustar F5.
8. **K19/K22:** hash no vacío, lecciones duplicadas, `.catch` en `refreshCatalogs`.
9. Tests por cada corrección, sin cambiar el comportamiento en `local`.

**Terminado cuando:** los nuevos tests verdes y el modo local sigue sin peticiones.

### E4 · Activación y aceptación (P0 para cerrar F5)

1. **K18:** `eas.json` con `env` en `preview` (`EXPO_PUBLIC_DATA_MODE=hybrid`, `EXPO_PUBLIC_API_URL=https://<host>/api/mlo/v2`); `production` en `local` hasta validar.
2. Compilar `preview`, unirse con un código real y verificar el curso del maestro.
3. Publicar un cambio, reabrir la app y comprobar que aparece.
4. Modo avión: recorrer lección, práctica y evaluación; el contenido local sigue funcionando.
5. Probar código inexistente (`404`), grupo cerrado (`410`), código con minúsculas/espacios y `429`.
6. Verificar que un cambio en un curso **no** invalida el manifest de otro.

**Terminado cuando:** se cumplen los cuatro criterios de F5 del plan maestro y no hay regresión en `local`.

### E5 · Documentación y cierre

1. Actualizar la sección 7 y F5 de `PLAN-sistema-maestro.md` con el estado real (M1–M9).
2. Actualizar `docs/api/contrato.md` con las decisiones K1–K8.
3. Registrar las decisiones nuevas en `docs/estado/decisiones-alcance.md` (C11 o ampliación de C10).
4. Actualizar `AGENTS.md` si cambian reglas de arranque, caché o errores.
5. Revisar la documentación del reporte que afirma “sin servidor real” para reflejar el estado final.

---

## 7. Decisiones para consultar

| # | Decisión | Recomendación | Alternativa |
|---|---|---|---|
| D-a | Tipo de `version` en el API | **String** (`String(release.version)`); entero solo en la base | Aceptar número en MLO y normalizar |
| D-b | `examples[]` | **`[]`** + ejemplos dentro de `exercises[].example`; retirar los independientes inertes | Añadir una colección `examples` completa y cambiar la UI de MLO |
| D-c | Release vacío | **Bloquearlo en el servidor**; MLO mantiene el rechazo | Permitir vaciar el curso y cambiar el parser de MLO |
| D-d | Release base parcial | **Bloquearlo**; base = snapshot de lecciones activas | Que MLO mezcle base remoto con contenido incluido |
| D-e | Código de grupo | **Mayúsculas como forma canónica**; el servidor puede además comparar sin distinguirlas | Guardar en minúsculas y comparar sin distinguir |
| D-f | Preguntas de ordenar | **`options` = orden correcto, `answer = 0`** | Añadir `correctOrder` a las preguntas (cambio de contrato y de MLO) |
| D-g | `groups.catalog` | **Inmutable** después de crear el grupo | Re-resolver el código al arrancar |
| D-h | Aplicación de contenido | **Mantener D4** (arranque frío o unión) y corregir la redacción de F5 | Aplicar al volver a primer plano sin actividad |
| D-i | Límite de `/groups` | **Limitar fallos** o permitir ráfagas de aula; `429` con mensaje propio | Subir el límite global |
| D-j | Imágenes | **Fuera de alcance** hasta que MLO tenga bloque de imagen | Añadir bloque y almacenamiento |
| D-k | Repositorio y fixture | Repo separado + **fixture generado y verificado en CI** | Monorepo con paquete `contracts` |
| D-l | Ejemplos independientes (`exA1.2`…) | **Retirarlos** del release | Ligarlos a un ejercicio existente |

---

## 8. Criterio de terminado de todo el plan

- [ ] El trabajo A0–C6 está commiteado y verificado.
- [x] `docs/api/contrato.md` v2.1 incluye K1–K8.
- [x] El fixture cubre los cinco tipos y se valida.
- [ ] La prueba de ida y vuelta del curso base pasa.
- [x] MLO compara `payload.hash` y detecta ids repetidos entre lecciones.
- [ ] El servidor bloquea releases base vacíos/parciales y calcula el hash sobre el payload v2.
- [ ] `eas.json` activa `hybrid` solo en `preview`.
- [ ] Unión real, cambio publicado, reapertura y modo avión verificados.
- [x] `local` sigue sin peticiones y con la suite verde.
- [ ] La sección 7 y F5 del plan maestro reflejan el estado real.

---

## 9. Anexo: checklist de serialización para el servidor

**Manifest**
- `schemaVersion: 2`
- `catalogId` = clave del curso (`base` o 5 caracteres)
- `title` string
- `version` **string**
- `hash` no vacío
- `publishedAt` ISO-8601
- `lessons[]` no vacío y sin `lessonId` repetidos
- cada lección con `lessonId`, `unitId`, `hash`

**Lección**
- `catalogId`, `lessonId` y `hash` coherentes con la URL y el manifest
- `unit`: `id`, `number` entero, `title`, `description`, `difficulty` (`Fundamental`/`Intermedio`/`Avanzado`), `color` (`blue`/`violet`/`green`)
- `lesson`: `id`, `unitId`, `code`, `title`, `eyebrow`, `body`, `codeSample`, `contextTitle`, `contextBody`, `synthesis[]`, `content[]`, `position` entero
- `content`: solo `p`, `h`, `bullets`, `numbers`, `table`; en `table`, todas las filas con el largo del `header`
- `evaluation`: `null` o `id`, `lessonId`, `title`, `description`, `questionCount > 0`, `exerciseCount > 0`
- `exercises[]`: `id`, `lessonId`, `type` (`order`/`fill`/`match`/`crossword`), `prompt`, `instructions`, `correctOrder[]` **siempre presente** (vacío si no es `order`), `config`, `explanation`, `example` opcional (`title`, `steps[{text, why}]`, `hints[]`)
- `examples[]`: **vacío** salvo que se decida lo contrario; si no, cada uno con `id`, `lessonId`, `type`, `title`, `prompt`, `config`, `steps`, `hints`, `explanation`
- `questions[]`: `evaluationId` = `evaluation.id`; `question.id` obligatorio y global; `type`; `prompt`; `options[]`; `answer` entero; `config`; `explanation`
- `order`: `options` = orden correcto, `answer = 0`
- `mcq`: `options` con al menos 2 sin repetir; `answer` entero en `[0, options.length)`
- `fill`/`match`/`crossword`: `options: []`, `answer: 0`, verdad en `config`
- crucigrama: `word` en `A-ZÑ`, `direction` `across`/`down`, `row`/`col` enteros, pista no vacía

**Grupo**
- código de 6 caracteres, búsqueda sin distinguir mayúsculas
- `404` si no existe, `410` si está cerrado, `429` con `Retry-After`
- `{ schemaVersion, group: { id, name, teacherName }, catalog: { id, title } }`

**Caché**
- manifest y lecciones con etiqueta `catalog:{id}`; invalidar ambos al publicar
- lecciones con `ETag`; el cliente puede ignorarlo, pero el CDN no debe mezclar versiones
- grupos con `no-store`
