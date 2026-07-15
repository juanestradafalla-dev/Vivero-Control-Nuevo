# Participantes de jornadas en borrador — ETAPA 11

## Separación administrativa

La selección se guarda en `seleccionesParticipantesJornada/{jornadaId}`. Es un dato de preparación y no crea documentos en `jornadas/{jornadaId}/autorizaciones`. Por tanto, seleccionar una cuenta no le concede acceso operativo ni hace visible la jornada en Campo.

## Operaciones centrales

`listarParticipantesJornadaBorrador` recibe únicamente `jornadaId`, usa la identidad de Auth y valida perfil activo, rol administrativo, estado `BORRADOR` y propiedad. Devuelve usuarios centrales activos con nombre y rol, además de la selección actual.

`actualizarParticipantesJornadaBorrador` recibe `jornadaId`, una lista única de `{usuarioId, puedeContar}` y `claveIdempotencia`. En una transacción vuelve a validar actor, propiedad, estado y perfiles seleccionados; obtiene nombre y rol desde `usuarios`; guarda la selección, incrementa la versión, audita y persiste el resultado idempotente.

La misma cuenta, clave y payload recuperan el resultado anterior. Usar la clave con otro payload produce `IDEMPOTENCY_CONFLICT`. Ninguna escritura parcial se confirma.

## Seguridad

Auxiliares no consultan ni modifican la preparación. Un supervisor administra solo borradores propios y el administrador puede gestionar cualquiera. Firestore Rules niega lectura y escritura directa de la colección; Maestro usa exclusivamente Callables.

## Vivero Maestro y Campo

Maestro muestra los participantes dentro del borrador abierto, con búsqueda, filtro por rol, selección sin duplicados, control `puede contar` y confirmación previa. La interfaz mantiene visible que la jornada continúa en `BORRADOR`.

Campo permanece sin cambios y `listarJornadasActivas` continúa devolviendo exclusivamente jornadas `ACTIVA` autorizadas.
