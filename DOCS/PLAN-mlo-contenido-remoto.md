# Plan: contenido remoto en MLO con varios maestros, cursos y grupos

- **Repositorio:** `https://github.com/1rauuul/MLO.git`, rama `main`, commit revisado `44a7df9`.
- **Base verificada:** `npx tsc --noEmit` y `npm run lint` sin errores; `npm test` con 48 suites y 297 tests en verde.
- **Servidor:** el sistema del maestro descrito en `PLAN-sistema-maestro.md`.

## Cambio de alcance

Antes había un solo catálogo compartido. Ahora **cada maestro tiene sus propios cursos y grupos**:

| Concepto | Qué es |
|---|---|
| **Maestro** | Usuario del sistema del maestro |
| **Curso** (`catalog`) | Conjunto de unidades → lecciones → ejemplos, ejercicios y evaluación. Pertenece a un maestro y se publica en versiones (`release`) |
| **Grupo** | Clase de un maestro. Apunta a un curso y tiene un **código para unirse**; varios grupos pueden usar el mismo curso |
| **Curso base** (`base`) | El contenido incluido hoy en MLO. Es lo que ve una cuenta que no está en ningún grupo, y también puede recibir actualizaciones |
| **Alumno** | Cuenta local de MLO. Pertenece a **un grupo a la vez**, o a ninguno |

**Sigue fuera de alcance:** sincronizar progreso, cuentas remotas y que el maestro vea los resultados de sus alumnos. El progreso sigue solo en SQLite.

## Restricciones

- No se cambian dependencias, comportamiento ni textos de la UI sin consultarlo. Esos pasos llevan **[Consultar]**.
- Los ejercicios conservan exactamente sus campos: `id`, `lessonId`, `type`, `prompt`, `instructions`, `correctOrder`, `config`, `explanation` y `example` (`title`, `steps[{ text, why }]`, `hints[]`).
- Con `DATA_MODE='local'` la app se comporta igual que hoy y no hace llamadas de red.
- **El arranque nunca espera a la red.**
- Un id de contenido publicado no cambia ni se reutiliza, porque `attempts`, `module_progress` y `evaluation_results` dependen de él.
- Cada fase termina con `npx tsc --noEmit`, `npm run lint` y `npm test` en verde.

## Decisiones (con la opción recomendada)

| # | Decisión | Recomendación | Alternativa |
|---|---|---|---|
| D1 | ¿Cuántos grupos por cuenta? | **Uno a la vez**; cambiar de grupo conserva el progreso anterior | Varios, con selector de curso (más UI y más consultas) |
| D2 | Ids entre cursos | **El servidor garantiza ids globalmente únicos**: `{clave del curso}-{id local}` (por ejemplo, `k7f3q-l1.2`). El curso base conserva sus ids actuales | Columna `catalog_id` en todas las tablas y llaves compuestas (migración grande, que también toca `attempts` y el progreso) |
| D3 | ¿Quién puede leer el contenido? | **Público por id de curso.** El contenido educativo no es sensible y la clave del curso es aleatoria; así la CDN lo guarda en caché | Exigir el código de grupo en cada petición (sin caché compartida) |
| D4 | ¿Cuándo se aplica una actualización? | **Se descarga en segundo plano y se aplica en el siguiente arranque**, de forma local y sin red. Al unirse a un grupo se aplica de inmediato | Aplicar en caliente, con el riesgo de cambiar el contenido a mitad de un ejercicio o evaluación |
| D5 | Contenido que el maestro retira | Unidades, lecciones y evaluaciones se **archivan** (se ocultan), no se borran, para no perder progreso por `ON DELETE CASCADE`. Ejercicios, ejemplos y preguntas sí se borran (`attempts` no tiene llave foránea hacia ellos) | Borrar todo, perdiendo el progreso de lo retirado |
| D6 | Grupo cerrado por el maestro | **Solo impide nuevas uniones**; quienes ya están siguen recibiendo actualizaciones del curso | Cortar también las actualizaciones (requiere validar el grupo en cada petición) |
| D7 | Cursos que ya no usa ninguna cuenta | **Se conservan** (pesan unos KB); la limpieza queda para después | Purgarlos al arrancar (borraría progreso por cascada) |

---

## Contrato v2

Sustituye `docs/api/contrato.md` v1. **Se puede cambiar sin compatibilidad hacia atrás**, porque ninguna compilación activa todavía `hybrid` (no hay clientes v1 instalados).

- **URL base:** `EXPO_PUBLIC_API_URL = https://<host>/api/mlo/v2`. No lleva secretos.
- **Errores:** `{ "error": string, "message": string }`.
- **`schemaVersion`:** debe ser `2`; cualquier otro valor se descarta.

| Endpoint | Uso | Respuesta |
|---|---|---|
| `GET /groups/{code}` | Unirse a un grupo | `{ schemaVersion, group: { id, name, teacherName }, catalog: { id, title } }` · `404` si el código no existe, `410` si el grupo está cerrado. Sin caché y con límite de peticiones por IP |
| `GET /catalogs/{catalogId}/manifest` | ¿Hay cambios? | `{ schemaVersion, catalogId, title, version, hash, publishedAt, lessons: [{ lessonId, unitId, hash }] }` |
| `GET /catalogs/{catalogId}/lessons/{lessonId}` | Contenido completo de una lección | Ver abajo |

```json
{
  "schemaVersion": 2,
  "catalogId": "k7f3q",
  "lessonId": "k7f3q-l1.2",
  "hash": "…",
  "unit":   { "id": "k7f3q-u1", "number": 1, "title": "…", "description": "…", "difficulty": "Fundamental", "color": "blue" },
  "lesson": { "id": "k7f3q-l1.2", "unitId": "k7f3q-u1", "code": "1.2", "title": "…", "eyebrow": "…", "body": "…",
              "codeSample": "", "contextTitle": "…", "contextBody": "…", "synthesis": ["…"],
              "content": [{ "type": "p", "text": "…" }], "position": 2 },
  "evaluation": { "id": "k7f3q-ev1.2", "lessonId": "k7f3q-l1.2", "title": "…", "description": "…",
                  "questionCount": 10, "exerciseCount": 5 },
  "exercises": [ /* ExerciseSeed, con example */ ],
  "examples":  [ /* ExampleSeed */ ],
  "questions": [ { "evaluationId": "k7f3q-ev1.2", "question": { "id": "k7f3q-q01", "type": "mcq", "…": "…" } } ]
}
```

Reglas:
1. La respuesta de una lección es **siempre completa**: lo que no viene, ya no existe en esa lección.
2. Una lección que deja de aparecer en el manifest se archiva.
3. `question.id` es obligatorio; `evaluation` puede ser `null`.
4. Los ids son únicos en todo el sistema. En el curso base, `catalogId` es `base` y los ids no llevan prefijo.

---

## Fase A0 — Migración `DATABASE_VERSION 16`

Es una sola migración para las tres fases, para no encadenar varias:

| Cambio | Para qué |
|---|---|
| `units.catalog_id` y `lessons.catalog_id` (`TEXT NOT NULL DEFAULT 'base'`) | Filtrar por curso activo y detectar ids que chocan entre cursos |
| `archived_at TEXT` en `units`, `lessons` y `evaluations` | Archivar sin perder progreso (D5) |
| `question_count` y `exercise_count` en `evaluations` (por defecto `10` y `5`, los valores actuales) | Tamaño de evaluación configurable por el maestro |
| `remote_catalogs(catalog_id PK, title, version, manifest_hash, lesson_ids, fetched_at)` | Último manifest descargado por curso |
| `remote_lessons(catalog_id, lesson_id, hash, payload, fetched_at, applied_hash, PK(catalog_id, lesson_id))` | **Área de espera:** contenido ya validado, pendiente de aplicar o para reaplicar sin red |
| `account_group(account_id PK → accounts ON DELETE CASCADE, group_id, group_code, group_name, teacher_name, catalog_id, joined_at)` | Grupo y curso activos de cada cuenta |
| Índices en `units(catalog_id)` y `lessons(catalog_id)` | Consultas del hub |

Se elimina la clave `meta.remote_content_hash`, porque la reemplaza `remote_catalogs`.

**Tests:**
- una instalación nueva y una actualización desde la versión 15 terminan con el mismo esquema;
- el progreso existente se conserva;
- todo el contenido actual queda con `catalog_id = 'base'`.

## Fase A — Bloqueantes (antes de activar `hybrid`)

### A1. La red sale del arranque (M1)

1. **Quitar `syncRemoteContent` de `migrateAndSeed`**, tanto en la instalación nueva como en `syncBundledAndRemote`. `onInit` queda así: migraciones → sincronización del contenido incluido → `applyStagedContent(db)`. Este último paso es local: aplica las filas de `remote_lessons` cuyo `hash` difiere de `applied_hash`.
2. **`ContentSyncProvider`** (`shared/services/content/ContentSyncProvider.tsx`), montado dentro de `DataProvider`. Llama a `refreshCatalogs()` en segundo plano:
   - una vez al montar, y al volver a primer plano (`AppState` `active`) si pasaron al menos 15 minutos;
   - revisa los cursos en uso: `base` y los `catalog_id` de `account_group`;
   - por cada curso: pide el manifest; si su `hash` coincide con `remote_catalogs.manifest_hash` no hace nada; si no, descarga **solo las lecciones cuyo hash cambió** (M9), las valida (A3) y las guarda en `remote_lessons`.
   - Nunca escribe en las tablas de contenido: eso ocurre en el siguiente arranque (D4).
3. Los errores se registran solo con `__DEV__` y la sincronización se reintenta en el siguiente disparo. No hay textos nuevos.

**Tests:**
- `onInit` no llama a `fetch`;
- el arranque sin red tarda lo mismo que en modo `local`;
- la descarga escribe en `remote_lessons` y no en `exercises`;
- el siguiente `onInit` aplica lo que quedó en espera.

### A2. Aplicar la jerarquía completa (M2)

`applyLessonPayload(db, payload)` reemplaza a `applyRemoteContent`. Aplica cada lección en una transacción, en este orden, para respetar las llaves foráneas:

`unit` → `lesson` → `evaluation` → `exercises` (con su `example`) → `examples` → `questions`

- Escribe `catalog_id` en `units` y `lessons`, y pone `archived_at = NULL` (si una lección vuelve a publicarse, reaparece).
- `insertQuestionRow` conserva `order_index` según la posición en la respuesta.
- `useQuizEngine` toma `question_count` y `exercise_count` de la evaluación, en lugar de las constantes 10 y 5. Con los valores por defecto, el comportamiento es el mismo.
- Si falla una lección (por ejemplo, por una llave foránea), solo se revierte esa lección; las demás se aplican, y la fallida queda pendiente en `remote_lessons`.

**Tests:**
- una lección **nueva** con unidad y evaluación nuevas se aplica;
- una lección con error se revierte sin afectar a las demás;
- aplicar dos veces la misma lección no cambia nada.

### A3. Validación por tipo (M5)

`shared/services/content/remote/validateLessonPayload.ts` se ejecuta **antes** de guardar en `remote_lessons`. Si cualquier regla falla, se descarta la lección completa.

| Elemento | Reglas |
|---|---|
| Encabezado | `schemaVersion === 2`; `catalogId` es el solicitado; `lessonId` es el solicitado y coincide en `lesson`, en cada hijo y en `evaluation.lessonId`; `questions[].evaluationId === evaluation.id` |
| Ids | No vacíos, únicos dentro de la respuesta y sin chocar con un id de **otro** curso ya guardado (se consulta `lessons.catalog_id`) |
| Unidad y lección | `difficulty` y `color` dentro de sus valores; bloques de `content` válidos (`p` y `h` con `text`; `bullets` y `numbers` con `items`; `table` con todas las filas del largo de `header`) |
| Ordenar | `correctOrder` con al menos 2 elementos, sin vacíos y sin repetidos |
| Completar | `config.sentences` no vacío, al menos un `{{…}}` por oración (con `extractFillAnswers`) y `bank` como arreglo de textos |
| Relacionar | Al menos 2 pares, sin `left` ni `right` repetidos |
| Crucigrama | `rows` y `cols` enteros positivos; palabras en mayúsculas dentro de la cuadrícula; cruces sin letras en conflicto (con `crosswordCells`); cada entrada con pista |
| Opción múltiple | Al menos 2 opciones sin repetir; `answer` entero en `[0, options.length)` |
| Preguntas de otros tipos | Las mismas reglas de su tipo sobre `config` |
| Ejemplo | Al menos un paso con `text` y `why` no vacíos; `hints` como arreglo de textos |
| Evaluación | `questionCount` y `exerciseCount` enteros mayores que 0 |

`extractFillAnswers` y `crosswordCells` viven en `features/exercises/viewmodel/exercise.logic.ts`. Si la regla de capas impide importarlas desde `shared`, se mueven a `shared/utils/exerciseRules.ts` sin cambiar su comportamiento, y `exercise.logic.ts` las reexporta.

**Tests:** un caso válido y uno inválido por cada regla de la tabla, usando el fixture del contrato v2.

## Fase B — Necesarios

### B1. Reemplazo completo y archivado (M3)

- **Dentro de `applyLessonPayload`:** borrar los `exercises` y `examples` de la lección, y las `questions` de su evaluación, que no vengan en la respuesta. `attempts` no se toca.
- **Evaluación retirada:** si `evaluation` viene `null` y la lección tenía una, se archiva.
- **Lecciones fuera del manifest:** en `applyStagedContent`, las lecciones del curso que ya no están en `remote_catalogs.lesson_ids` se archivan, junto con su evaluación. Una unidad sin lecciones activas también se archiva.
- **Consultas:** todas las de contenido filtran `archived_at IS NULL`: `selectUnits`, `selectLessons`, `selectLesson`, `selectEvaluationByLesson`, `selectEvaluationSummaries` y `countCompletedByUnit`.
- **Contenido incluido:** `deleteContentOrphans` sigue limitado al contenido incluido del curso base.

**Tests:**
- un reactivo retirado desaparece y su intento sigue en `attempts`;
- una lección retirada se oculta, su `module_progress` y `evaluation_results` se conservan, y reaparece si se publica de nuevo.

### B2. Lo remoto sobrevive a una actualización de la app (M4)

Cuando `syncContentIfChanged` reescribe el contenido incluido, se marca `applied_hash = NULL` en las filas de `remote_lessons` del curso base. Así `applyStagedContent` las vuelve a aplicar enseguida, **sin red**. Se quita el `DELETE … remote_content_hash` y la nueva descarga de `syncBundledAndRemote`.

**Test:** con un cambio en el hash del contenido incluido y sin red, el contenido remoto del curso base sigue visible después del arranque.

### B3. Id de pregunta obligatorio (M6)

`parseRemoteQuestion` exige `id`. `parseQuestionSeed` conserva el id opcional para el contenido incluido. Se elimina el id generado a partir de la posición (`…-remote-q{n}`).

### B4. Tests de integración contra la base (M7)

Usan el mismo mock de `expo-sqlite` que `database.test.ts`:
- falla de llave foránea que revierte toda la lección;
- `manifest_hash` que solo se guarda cuando todas las lecciones quedaron en espera;
- reaplicación tras sincronizar el contenido incluido (B2);
- idempotencia;
- choque de ids entre cursos rechazado;
- archivado que conserva el progreso.

### B5. Activación por perfil (M8) **[Consultar: configuración]**

- `eas.json`: `env` en `preview` con `EXPO_PUBLIC_DATA_MODE=hybrid` y `EXPO_PUBLIC_API_URL=https://<host>/api/mlo/v2`. `production` sigue en `local` hasta validar en `preview`.
- `.env.example`: documentar las dos variables, ambas sin secretos.

## Fase C — Varios cursos y grupos

Nueva feature `src/features/groups/{model,viewmodel,view}`.

### C1. Curso activo por cuenta

- `groupRepository`: `selectAccountGroup`, `saveAccountGroup` y `clearAccountGroup`. Se expone en `createRepositories()`.
- `useActiveCatalog()` devuelve `{ catalogId, group }`, y `base` si la cuenta no tiene grupo.
- Reciben `catalogId`: `selectUnits`, `selectLessons` y `selectEvaluationSummaries`. `selectRecentEvaluationResults` filtra por las evaluaciones del curso activo. `useCatalog`, `useEvaluationsCatalog`, `useRecentResults` y `useModuleProgress` le pasan el curso activo.
- `selectLesson` y la reanudación (`last_location`) solo aceptan lecciones del curso activo; si no, se va al hub.

### C2. Unirse a un grupo **[Consultar: pantalla, ruta y textos nuevos]**

Ruta `app/(app)/(profile)/join-group.tsx` y entrada en `ProfileScreen`:
1. El alumno escribe el código (6 caracteres; se aceptan minúsculas y espacios).
2. `GET /groups/{code}` → tarjeta de confirmación con grupo, maestro y curso.
3. Al confirmar: `refreshCatalog(catalogId)` descarga **todo** el curso con un indicador de progreso, y se ejecuta `applyStagedContent(db, catalogId)` de inmediato (D4; el alumno no está en ninguna actividad).
4. Se guarda `account_group` y se navega al hub del curso.

Errores con mensaje propio: código inexistente (`404`), grupo cerrado (`410`), sin conexión y contenido inválido. En ningún caso se cambia de curso a medias: si algo falla, la cuenta sigue en su curso anterior.

Si el modo es `local`, la entrada no se muestra.

### C3. Salir o cambiar de grupo **[Consultar: textos de confirmación]**

- **Salir:** borra `account_group` y vuelve al curso base. El contenido del curso queda guardado (D7) y el progreso se conserva, porque los ids son únicos. Volver a unirse restaura el avance.
- **Cambiar de grupo:** es "unirse" a otro; si el curso nuevo es el mismo, no se descarga nada.
- En ambos casos se borra `last_location`, porque apunta a otro curso.

### C4. Actualizaciones de todos los cursos en uso

`refreshCatalogs()` (A1) recorre `base` más los cursos de **todas** las cuentas locales, no solo de la sesión actual. Un grupo cerrado (D6) no afecta, porque la actualización es por curso.

### C5. Respaldo de progreso v3 **[Consultar: textos de importación]**

Hoy `replaceProgressFromBackup` falla completo si el respaldo menciona una lección que no existe en el dispositivo (llave foránea de `module_progress`). Con varios cursos eso será frecuente:
- **Exportar:** agrega `group: { code, catalogId, name } | null`. `version: 3`; se siguen aceptando v1 y v2.
- **Importar:** si el curso del respaldo no está en el dispositivo y hay red, primero se une al grupo (C2) y después importa. Si no es posible, importa solo las filas cuyas lecciones y evaluaciones existen, y avisa cuántas omitió.

**Tests:** respaldo v3 con el curso presente, ausente con red y ausente sin red; los respaldos v1 y v2 siguen funcionando.

### C6. Tests de la fase

- dos cuentas en el mismo dispositivo, cada una en un curso, solo ven su contenido;
- unirse sin red no cambia el curso;
- salir y volver conserva el progreso;
- la reanudación de otro curso lleva al hub.

## Documentación

- `docs/api/contrato.md`: pasa al contrato v2.
- `docs/estado/decisiones-alcance.md`: nueva decisión C10 "Varios maestros, cursos y grupos", con D1 a D7.
- `docs/reporte/capitulo-3-desarrollo.md` y `docs/diagramas-mlo.md`: flujo de unión a grupo y diagrama del área de espera.
- `AGENTS.md`: regla "el arranque nunca espera a la red".

## Orden y dependencias

```
A0 ─► A1 ─► A2 ─► A3 ─► B1 ─► B2 ─► B3 ─► B4 ─► B5 (preview con hybrid)
                                              └──► C1 ─► C2 ─► C3 ─► C4 ─► C5 ─► C6
Servidor (PLAN-sistema-maestro): contrato v2 y fixture ─► necesario desde A3
                                 grupos y códigos     ─► necesarios desde C2
```

A y B pueden avanzar solo con el fixture del contrato, sin servidor real. C2 necesita el endpoint `/groups/{code}` desplegado, o un doble en los tests.

## Riesgos

- **Contenido que cambia durante una actividad:** evitado por D4, porque la aplicación ocurre al arrancar o en la pantalla de unión.
- **Choque de ids entre cursos:** lo previene el prefijo del servidor (D2) y lo detecta A3 como respaldo.
- **Pérdida de progreso por cascada:** evitada archivando en lugar de borrar (D5) y sin purgar cursos (D7).
- **Códigos de grupo adivinables:** 6 caracteres de un alfabeto de 31 (sin 0/O/1/I/L) dan unos 887 millones de combinaciones, con límite de peticiones en el servidor y códigos que el maestro puede regenerar.

## Pendiente de consulta

1. Decisiones D1 a D7 (las recomendaciones están en la tabla).
2. Pantalla, ruta y textos de "Unirme a un grupo", confirmación y errores (C2).
3. Textos de salir o cambiar de grupo (C3).
4. Textos del respaldo v3 cuando se omiten filas (C5).
5. Variables de `hybrid` en `eas.json` y `.env.example` (B5).
6. ¿Mostrar el nombre del curso o grupo en el encabezado del hub? No está incluido; sería un cambio de UI.
