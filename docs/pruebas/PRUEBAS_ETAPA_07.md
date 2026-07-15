# Pruebas de la Etapa 7

## Cobertura central con Emulator Suite

La suite integrada reserva, envía y devuelve un conteo antes de probar la reasignación con Auth, Functions y Firestore Emulator reales.

- supervisor y administrador pueden reasignar;
- auxiliar, destino inactivo y destino sin autorización son rechazados;
- estado distinto de `DEVUELTA`, motivo vacío y selección sin cambio son rechazados;
- la misma clave recupera exactamente el resultado previo;
- dos claves concurrentes hacia el mismo destino crean una sola reasignación;
- solo el responsable asignado inicia la corrección;
- la versión nueva apunta a la anterior y registra al corrector como autor;
- conteo original, versiones previas e inventario oficial permanecen idénticos;
- no se crea movimiento de inventario;
- las reglas permiten las lecturas mínimas y rechazan toda escritura directa.

Resultado local verificado: 54 pruebas integradas y 16 pruebas de reglas aprobadas.

## Campo

Las pruebas de ViewModel cubren restauración del borrador de corrección y agregan el caso donde el autor original conserva la tarjeta como solo lectura, sin iniciar una reserva cuando otro usuario es responsable. La suite Android completa mantiene validación, Room, WorkManager, idempotencia y cifrado de token.

## Maestro

Las 11 pruebas verifican presentación del historial, revisión, datos de la asignación, selección de candidato, motivo obligatorio, resumen previo, Callable y ausencia de la acción para un auxiliar.

## Comandos

```powershell
Set-Location contracts
npm run check

Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug

Set-Location ../maestro-desktop
npm run lint
npm run typecheck
npm test -- --run
npm run build

Set-Location ../../backend/functions
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
```
