# Decisiones de alcance — MLO Ingeniería de Software

> Registro de las decisiones del Bloque C del plan `siguientes-pasos.md`, ya aplicadas en la
> rama `fix/estabilizacion-datos`. Fecha: 2026-10-08.

## C1. Autenticación local — **Conservar y justificar**

- **Decisión:** se mantiene el registro/login local (`accounts`, `auth_session`, `Stack.Protected`).
- **Justificación:** permite progreso, perfil e historial **por alumno** en un dispositivo
  compartido, sin backend ni red. Ya estaba construida y probada.
- **Mejora aplicada:** el hash pasó de SHA-256+salt a **PBKDF2-HMAC-SHA256** (100 000 iteraciones)
  con rehash transparente de cuentas legacy al iniciar sesión (`authLogic.ts`, `useAuth.tsx`).
- **Para el reporte:** declararlo como **extensión** respecto a MLO-AR (que no contempla
  administración de usuarios), justificada por el uso en dispositivo compartido.

## C2. Personalización por estilo — **Implementada como CHAEA abreviado**

- **Decisión:** se implementó el cuestionario en `src/app/(app)/(profile)/personalizacion`
  con lógica pura en `viewmodels/chaLogic.ts` (8 ítems, 2 por estilo) y persistencia del estilo
  dominante vía `useLearnerProfile.saveQuestionnaire`.
- **Alcance:** es una **versión abreviada** orientativa, no el CHAEA completo de 80 ítems; debe
  declararse así en el reporte.
- **Adaptación de contenido por estilo:** sigue siendo **parcial**; el contenido no se reordena
  automáticamente por estilo. La personalización efectiva hoy es por **desempeño**
  (`analyticsLogic.recommendReview`).

## C3. SCORM — **No se empaqueta en runtime**

- **Decisión:** se mantiene "sin empaquetado SCORM/LOM en runtime", coherente con
  `arquitectura-oam-react-native.md` y `AGENTS.md`.
- **Pendiente documental:** el `PlanDesarrollo.md` listaba un "paquete SCORM" (semana 13); debe
  corregirse o confirmarse con el asesor. Punto de extensión: `src/models/metadata.ts`.

## C4. Tabla `results` — **Eliminada**

- **Decisión:** se retiraron la tabla `results` (de `schema.ts`), la entidad `ExerciseResult`
  (`entities.ts`), `insertResult` (`exerciseRepository.ts`) y `useRecordExerciseResult`
  (`useExerciseEngine.ts`), por estar **inertes** (nadie los leía ni escribía en runtime).
- **Bitácora real:** `attempts` (`source = 'practice' | 'evaluation'`).
- **Documentos actualizados:** `AGENTS.md`.

## C5. Granularidad — **Justificar en el reporte**

- **Decisión:** el OAM cubre una asignatura de 5 unidades con subtemas; la **granularidad mínima
  es la lección** (`lessons`) y no la unidad. Se documenta como decisión de diseño frente al
  principio "tema lo menos divisible posible" de la tesis.

## C6. `attempts` compartida y `asExercise` — **Justificar en el reporte**

- **Bitácora común** (`attempts`) para práctica y evaluación: habilita analítica unificada
  (`summarizeAttempts`, `weakTypes`, `recommendReview`).
- **Reutilización de UI** (`EvaluationFlow.asExercise` adapta `Question` → `Exercise`): la
  separación de entidades se conserva; solo se reutiliza el componente de actividad con feedback
  distinto (inmediato en práctica; acumulado y con repaso final en evaluación).

## C7. Destino web — **Conservar como soporte**

- **Decisión:** se mantiene `react-native-web` y `expo export --platform web` como soporte para
  demo/desarrollo; **no** es un requisito móvil. El export web fue verificado (OK).

## C8. Dependencias sin import directo — **Auditar caso por caso**

- **Decisión:** se actualizaron los 7 paquetes a la versión esperada por SDK 57
  (`npx expo install --fix`). No se retiró ninguna dependencia solo por falta de imports
  directos (pueden ser requeridas por plugins o transitivas). Pendiente: auditoría fina con
  `expo-doctor` y revisión manual.

## F6. Ficha LOM — **Ficha descriptiva parcial**

- `src/models/metadata.ts` aporta una ficha descriptiva (título, descripción, autor, versión,
  idioma, palabras clave, estándar, fecha). **No** cubre las 9 categorías completas de IEEE
  1484.12.1. Se mantiene como **referencia conceptual**, no como empaquetado LOM.

---

## Resumen de impacto en el reporte

- **Afirmar:** MVVM con hooks, persistencia local, separación Ejercicios/Evaluación, sin RA,
  offline, autenticación local justificada, PBKDF2, cuestionario CHAEA abreviado.
- **Afirmar con matiz:** personalización (perfil + estilo abreviado + recomendación por
  desempeño); metadatos LOM parciales.
- **No afirmar sin verificar:** adaptación automática de contenido por estilo; empaquetado SCORM;
  cumplimiento completo LOM; portabilidad iOS probada en dispositivo.

---

## C9. Servicios y contenido remoto — **Offline-first con servicios opcionales** (2026-10-23)

- **Cambio de alcance:** MLO deja de declararse "sin red ni backend". Se añade una capa de
  servicios **desactivada por defecto** (`DATA_MODE = 'local'`), pensada para consumir solo
  **contenido publicado** por el sistema del maestro.
- **Qué no se hace:** no se sincroniza progreso, no hay cuentas remotas, no existen `sync/*`
  ni `auth/*`. SQLite sigue siendo la fuente de verdad local.
- **Cómo se integra:** los ViewModels consumen `useRepositories()`; un adaptador HTTP
  (`shared/services/http`) y `remoteContent.ts` validan el contenido con `parse*Seed` antes de
  aplicarlo. Si falla la red o el contenido es inválido, se conserva el contenido local.
- **Requisito para el reporte:** describir la app como **offline-first** con servicios
  opcionales, no como una app conectada. La prueba de modo avión sigue siendo válida y
  obligatoria para el comportamiento por defecto.

---

## C10. Varios maestros, cursos y grupos (2026-10-26)

- **D1 — un grupo por cuenta:** el alumno pertenece a un grupo a la vez; cambiar de grupo
  conserva el progreso anterior porque los ids de contenido son globales.
- **D2 — ids globales:** el servidor prefija los ids con la clave del curso
  (`k7f3q-l1.2`). El curso base conserva los ids actuales y no se añade `catalog_id` a
  `attempts` ni a las tablas de progreso.
- **D3 — lectura pública por curso:** la clave aleatoria del curso es suficiente; el
  contenido educativo no es sensible y la CDN puede cachearlo. El código de grupo solo se
  usa para unirse.
- **D4 — actualización diferida:** el contenido se descarga en segundo plano y se aplica
  al siguiente arranque, o de inmediato al unirse a un grupo. Nunca se cambia el contenido
  en caliente durante una actividad.
- **D5 — archivar, no borrar:** unidades, lecciones y evaluaciones retiradas se ocultan con
  `archived_at`; ejercicios, ejemplos y preguntas sí se pueden borrar. Se preservan
  `attempts`, `module_progress` y `evaluation_results`.
- **D6 — grupo cerrado:** solo bloquea nuevas uniones; los miembros actuales siguen
  recibiendo actualizaciones del curso.
- **D7 — sin purga de cursos:** los cursos que ya no usa ninguna cuenta se conservan (pesan
  pocos KB) para no borrar progreso por cascada.
- **Contrato:** v2 en `docs/api/contrato.md`. El curso base es `base` y no lleva prefijo.
- **Respaldo:** v3 incluye el grupo; se aceptan v1 y v2. Al importar se omiten las filas de
  cursos no disponibles y se informa cuántas. Si no hay red, `group_id` y `teacher_name`
  quedan nulos: nunca se inventa un id remoto con el código del grupo.
- **Lecciones de solo lectura:** una lección puede no tener ejercicios ni evaluación
  (por ejemplo, la introducción 1.1). Si publica evaluación, debe traer al menos una pregunta.
- **Publicación por grupos:** un curso puede compartirse entre varios grupos. Añadir contenido
  a un grupo concreto exige un catálogo propio para ese grupo; los grupos de un mismo catálogo
  ven el mismo contenido. Los ids se prefijan por catálogo.

---

## C11. Ajustes del contrato v2 para el sistema del maestro (2026-10-26)

Se derivan de `docs/planes/COMPARATIVA-consumo-servicios-vs-plan-maestro.md`.

- **`version`:** el API publica el entero de `releases.version` como texto; MLO acepta
  string o entero y lo normaliza a string. `hash` y `lessons[].hash` no pueden ir vacíos.
- **Ejemplos:** `examples` contiene solo ejemplos independientes y puede ser `[]`; los
  ejemplos de un ejercicio viajan en `exercises[].example`. MLO normaliza los campos vacíos
  omitidos (`codeSample`, `contextTitle`, `contextBody`, `synthesis`, `correctOrder`,
  `options`, `answer`), pero el serializador debe emitirlos.
- **Preguntas de ordenar:** `options` es la secuencia correcta y `answer` es `0`. En
  `fill`/`match`/`crossword`, `options` es `[]`, `answer` es `0` y la verdad está en `config`.
- **Códigos de grupo:** se envían en mayúsculas; MLO acepta minúsculas y espacios y los
  normaliza. El servidor debe aceptar esa forma canónica.
- **Publicación:** un release vacío no se publica; el release de `base` es un snapshot
  completo de lecciones activas. MLO archiva lo que no viene y rechaza un manifest vacío.
- **Integridad:** MLO descarta una lección si su `hash` no coincide con el manifest y rechaza
  ids repetidos entre lecciones del mismo curso. El servidor sigue siendo la validación
  principal.
- **Errores:** `429` se muestra como límite de intentos; un `404`/`410` al descargar el curso
  no se confunde con un código de grupo inexistente. Si falta `EXPO_PUBLIC_API_URL`, el
  cliente falla con un error de configuración y no hace peticiones relativas.
- **Imágenes:** fuera de alcance hasta que MLO tenga un bloque de imagen y su validador.
- **Ejemplos independientes** (`exA1.2`, `exA1.3`, `exA1.4`): se retiran del release; la UI de
  MLO solo muestra el ejemplo cuyo id coincide con un ejercicio.
