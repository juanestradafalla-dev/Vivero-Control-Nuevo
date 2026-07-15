# Pruebas — ETAPA 9

## Backend y emuladores

La suite integrada comprueba identidad tomada exclusivamente de Auth, exclusión de jornadas inactivas o no autorizadas, orden del resultado, reserva en la jornada seleccionada y aislamiento de las demás jornadas y del inventario oficial.

La matriz completa conserva las pruebas de reserva, envío, revisión, corrección, reasignación, liberación, concurrencia y reglas.

## Campo y Maestro

Campo prueba selección automática con una jornada, selección explícita con varias, observación de líneas de la elegida, reserva con su `jornadaLineaId` y bloqueo del cambio con trabajo pendiente.

Maestro prueba selección automática, selector con varias jornadas, cancelación de la suscripción anterior y ausencia de líneas mezcladas después del cambio.

## Comandos

```powershell
Set-Location contracts
npm run check

Set-Location ../apps/campo-android
./gradlew.bat assembleDebug testDebugUnitTest lintDebug

Set-Location ../maestro-desktop
npm run lint
npm run typecheck
npm test
npm run build

Set-Location ../../backend/functions
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
```
