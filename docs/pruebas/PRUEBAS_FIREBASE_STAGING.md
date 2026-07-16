# Pruebas — primera fase Firebase staging

## Android

- `debug` conserva `EMULATOR`, proyecto `demo-*` y `useEmulator`.
- `staging` exige `viverocontrol-3f83f`, API key y App ID locales.
- STAGING válido declara `usesEmulators=false`.
- Proyecto incorrecto y configuración faltante fallan de forma segura.
- El formulario se habilita en staging y el banner identifica datos de prueba.
- Las operaciones mutables se bloquean en la interfaz y repositorio.
- applicationId, base Room, preferencias, trabajos únicos y alias Keystore están separados por entorno.

CI compila `assembleStaging` con API key y App ID manifiestamente ficticios. Compilar no inicia la aplicación ni se conecta a Firebase real.

## Backend

Las pruebas unitarias cubren:

- lectura en Emulator Suite;
- lectura en `viverocontrol-3f83f` con `APP_ENV=staging`;
- rechazo de otro proyecto real;
- rechazo si falta `APP_ENV`;
- rechazo de `assertEmulatorOnly` aun cuando el proyecto staging y APP_ENV son correctos.

Las integraciones históricas continúan comprobando autenticación, perfil activo, autorizaciones y jornadas activas mediante los emuladores. Ninguna prueba usa Firebase real.

## Matriz obligatoria

Se ejecutan contratos, `assembleDebug`, `assembleStaging` ficticio, `testDebugUnitTest`, `lintDebug`, Maestro, backend unitario, compilación, Emulator Suite, reglas, concurrencia, auditorías y revisión de secretos/artefactos.

No se ejecuta `firebase deploy`, no se crea `google-services.json` y no se usa ninguna cuenta real durante CI.
