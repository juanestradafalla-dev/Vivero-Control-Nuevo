# Pruebas de la ETAPA 15

## Contratos y backend

Se validan solicitudes vacías de listado, payloads estrictos de estado y rol, propiedades adicionales, motivo, roles cerrados, resultados versionados e idempotencia. Las pruebas con Auth, Functions y Firestore Emulator cubren administrador, supervisor, auxiliar, autodesactivación, último administrador, reactivación, versión obsoleta, trabajo activo, historia intacta y ausencia de cambios en Firebase Auth.

La desactivación con una reserva real creada por `reservarLinea` conserva exactamente la reserva y la línea. Las operaciones posteriores del titular reciben `USER_INACTIVE`; un supervisor puede liberar después el trabajo mediante `liberarReservaLinea`.

Las carreras entre administradores producen un ganador, una versión nueva y una auditoría. El segundo intento se rechaza sin escritura parcial. Repetir clave y payload recupera el mismo resultado; cambiar el payload produce `IDEMPOTENCY_CONFLICT`.

## Reglas e interfaces

Las reglas niegan listado, lectura de terceros y toda escritura directa sobre `usuarios`, incluso para administradores. El perfil propio permanece legible para detectar la desactivación.

Maestro prueba visibilidad exclusiva de “Usuarios”, búsqueda y filtros, advertencias, confirmación, actualización de versión y bloqueo de rol. Campo prueba que una desactivación invalida la sesión, cancela el reintento y conserva el borrador local congelado.

## Matriz

Se ejecutan contratos `validate` y pruebas; Android `assembleDebug`, `testDebugUnitTest` y `lintDebug`; Maestro lint, typecheck, pruebas, build y audit; backend lint, typecheck, unitarias, build, emuladores, reglas y audit; además de revisión de secretos y artefactos. No existe despliegue.
