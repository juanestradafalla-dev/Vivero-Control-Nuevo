# Administración central de perfiles — ETAPA 15

## Frontera de seguridad

Las tres operaciones funcionan solo con Firebase Emulator Suite, `FUNCTIONS_EMULATOR=true` y un proyecto `demo-*`. Authentication aporta `request.auth.uid`; ningún payload puede declarar actor, nombre, rol ni hora central.

`listarUsuariosAdministrables` exige un perfil actor activo con el rol central `ADMINISTRADOR`. Devuelve exclusivamente ID, nombre visible, rol, estado, versión y un resumen de jornadas, reservas y correcciones activas. No consulta ni devuelve contraseñas, tokens, correo, claims o metadatos internos de Firebase Auth.

Firestore Rules permiten leer el perfil propio para detectar una desactivación, niegan listados directos y niegan toda escritura de perfiles. La administración siempre pasa por Callables.

## Actualización de estado

`actualizarEstadoUsuario` recibe ID, versión esperada, `ACTIVO` o `INACTIVO`, motivo y clave idempotente. En una transacción valida al administrador, el perfil objetivo, la versión, la protección contra autodesactivación y el mínimo de un administrador activo; incrementa una vez la versión y crea auditoría y resultado idempotente.

Desactivar no modifica Firebase Auth, reservas, correcciones, autorizaciones, conteos, inventario ni historia. Las operaciones centrales ya existentes vuelven a leer el perfil y rechazan inmediatamente `USER_INACTIVE`. Reactivar cambia solo el estado y conserva el rol anterior.

## Actualización de rol

`actualizarRolUsuario` acepta exclusivamente `AUXILIAR`, `SUPERVISOR` o `ADMINISTRADOR`. Bloquea la retirada del propio rol administrador, la ausencia de otro administrador activo y cualquier jornada activa autorizada, reserva activa o corrección pendiente del perfil objetivo.

La transacción escribe solo el rol y versión actuales del perfil. Nombres, roles efectivos y actores denormalizados en autorizaciones, reservas, conteos y auditorías históricas permanecen intactos.

## Concurrencia e idempotencia

La clave se separa por actor y operación. El mismo payload recupera exactamente el resultado guardado y un payload diferente produce `IDEMPOTENCY_CONFLICT`. Dos administradores que actualizan la misma versión compiten por el documento del perfil: uno confirma y el otro recibe `USER_PROFILE_STALE_VERSION` sin auditoría ni escrituras parciales.

## Sesión desactivada

Maestro y Campo observan el perfil propio. Al recibir `activo=false`, cierran la sesión, detienen nuevas acciones y muestran “Cuenta desactivada”. Campo cancela el reintento programado visible, pero no elimina Room, el borrador, el payload congelado ni el token cifrado en Android Keystore.
