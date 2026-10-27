# Contrato de API v2 — contenido publicado con maestros, cursos y grupos

Revisión 2.1 (2026-10-26): aclara versión, ejemplos, preguntas de ordenar, campos
vacíos, códigos de grupo, releases vacíos/parciales y errores de descarga. El
`schemaVersion` sigue siendo `2`.

Solo contenido. La sincronización de progreso, las cuentas remotas y la lectura
de resultados por el maestro siguen fuera de alcance. SQLite es la fuente de
verdad local y con `DATA_MODE=local` (por defecto) no se hace ninguna petición.

- **URL base:** `EXPO_PUBLIC_API_URL = https://<host>/api/mlo/v2` (sin secretos).
- **Formato:** JSON UTF-8; fechas ISO-8601.
- **Errores:** `{ "error": string, "message": string }`.
- **`schemaVersion`:** debe ser `2`; cualquier otro valor se descarta.

## GET /groups/{code}

Código de 6 caracteres en mayúsculas; el cliente acepta minúsculas y espacios
pero envía la forma canónica en mayúsculas. Sin caché y con límite de peticiones
por IP. Si se supera el límite, responde `429` con `Retry-After`.

```json
{
  "schemaVersion": 2,
  "group": { "id": "g1", "name": "Grupo A", "teacherName": "Profesora Ríos" },
  "catalog": { "id": "k7f3q", "title": "Curso de prueba" }
}
```

`404` si el código no existe; `410` si el grupo está cerrado. El cliente no
cambia de grupo si la descarga o la aplicación del curso falla.

## GET /catalogs/{catalogId}/manifest

```json
{
  "schemaVersion": 2,
  "catalogId": "k7f3q",
  "title": "Curso de prueba",
  "version": "3",
  "hash": "8f14e45f",
  "publishedAt": "2026-10-26T00:00:00.000Z",
  "lessons": [{ "lessonId": "k7f3q-l1.2", "unitId": "k7f3q-u1", "hash": "a1b2c3d4" }]
}
```

`version` es el entero incremental de `releases.version` serializado como texto;
el cliente también acepta un número y lo normaliza. `hash` no puede ir vacío,
`lessons` no puede ir vacío y no puede repetir `lessonId`.

## GET /catalogs/{catalogId}/lessons/{lessonId}

La respuesta es **siempre completa**: lo que no viene ya no existe en la
lección. `lessonId` y `evaluation.lessonId` deben coincidir; `question.id` es
obligatorio. Una lección puede ser **de solo lectura** (por ejemplo, 1.1): sin
ejercicios, sin evaluación y sin preguntas. Si publica evaluación, debe traer al
menos una pregunta. Todos los ids (unidad, lección, evaluación, ejercicios,
ejemplos y preguntas) son globales y no pueden coincidir con los de otro curso
ni con los de otra lección del mismo curso.

- `examples` solo contiene ejemplos **independientes**; los ejemplos de un
  ejercicio viajan en `exercises[].example`. Puede ser `[]`.
- El serializador debe enviar siempre los campos, aunque estén vacíos:
  `codeSample`, `contextTitle`, `contextBody`, `synthesis`, `correctOrder`,
  `options` y `answer`. El cliente normaliza los que falten.
- Preguntas `order`: `options` es la **secuencia correcta** y `answer` es `0`.
  En `fill`/`match`/`crossword`, `options` es `[]`, `answer` es `0` y la verdad
  está en `config`.
- No hay bloques de imagen: un bloque desconocido descarta la lección completa.

```json
{
  "schemaVersion": 2,
  "catalogId": "k7f3q",
  "lessonId": "k7f3q-l1.2",
  "hash": "…",
  "unit": { "id": "k7f3q-u1", "number": 1, "title": "…", "description": "…", "difficulty": "Fundamental", "color": "blue" },
  "lesson": {
    "id": "k7f3q-l1.2", "unitId": "k7f3q-u1", "code": "1.2", "title": "…",
    "eyebrow": "…", "body": "…", "codeSample": "", "contextTitle": "…",
    "contextBody": "…", "synthesis": ["…"],
    "content": [{ "type": "p", "text": "…" }], "position": 2
  },
  "evaluation": {
    "id": "k7f3q-ev1.2", "lessonId": "k7f3q-l1.2", "title": "…",
    "description": "…", "questionCount": 10, "exerciseCount": 5
  },
  "exercises": [],
  "examples": [],
  "questions": [{ "evaluationId": "k7f3q-ev1.2", "question": { "id": "k7f3q-q01", "type": "mcq", "…": "…" } }]
}
```

`evaluation` puede ser `null`.

## Reglas del cliente

1. Con `DATA_MODE=local` no se ejecuta ninguna petición; el arranque nunca
   espera a la red.
2. La descarga valida con `validateLessonPayload` y guarda en `remote_lessons`
   (área de espera). No escribe en las tablas de contenido.
3. Un fallo de validación descarta la lección y no avanza el `manifest_hash`.
   Un manifiesto vacío, con hash vacío, con lecciones repetidas o una misma
   versión con otro hash también se descartan.
4. La lección descargada debe traer el mismo `hash` que su entrada del manifest.
   Si no coincide, se descarta (protege contra una lección vieja en caché).
5. Los ids de una lección no pueden repetirse en otra lección del mismo curso;
   el cliente compara contra el área de espera y descarta el manifest si chocan.
6. Al arrancar, `applyStagedContent` aplica lo pendiente de forma local y
   devuelve las lecciones que fallaron; unirse a un grupo se aborta si hay
   alguna fallida.
7. Un `4xx` no se reintenta; la red y los `5xx` sí (backoff exponencial). Un
   `429` se muestra como límite de intentos y no cambia el grupo.
8. Si falta `EXPO_PUBLIC_API_URL`, el cliente no hace peticiones relativas:
   falla con un error de configuración y el modo local sigue funcionando.
9. Una lección que deja de aparecer en el manifest se archiva (también en el
   curso base); no se borra para conservar `attempts`, `module_progress` y
   `evaluation_results`.
10. El respaldo v3 restaura el grupo aunque el curso ya esté descargado; los
    respaldos v1 y v2 siguen aceptándose. Si el grupo cambió de catálogo, se
    comprueba el catálogo que devuelve el servidor antes de restaurarlo.
11. Publicar en varios grupos: si comparten `catalogId`, el contenido es el
    mismo y no se duplica; si son catálogos distintos, el servidor debe prefijar
    los ids con cada clave de curso.
