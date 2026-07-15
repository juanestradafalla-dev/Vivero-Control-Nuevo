# Pruebas de la Etapa 8

## Backend y Emulator Suite

La suite integrada utiliza Auth, Functions y Firestore Emulator reales y cubre:

- liberación por supervisor y administrador;
- rechazo de auxiliar, motivo vacío, reserva inexistente o consumida;
- rechazo cuando `reservaActivaId` no coincide;
- reserva inicial a `DISPONIBLE`;
- reserva `CORRECCION` a `DEVUELTA`;
- conservación de responsable y reasignación activa;
- recuperación idempotente y conflicto de payload;
- dos liberaciones concurrentes con un solo efecto;
- carrera liberar contra enviar con un solo ganador controlado;
- reserva, conteos, versiones e historial sin eliminaciones;
- inventario oficial idéntico y ausencia de movimientos;
- lecturas mínimas y escrituras directas rechazadas por reglas.

Resultado esperado de la suite completa: 60 pruebas integradas y 17 pruebas de reglas.

## Campo

Las pruebas verifican que una liberación conserva el borrador Room y el token cifrado, cambia la sincronización a `ERROR`, cancela el trabajo único, oculta el reintento y nunca marca `ENVIADA`. Continúan pasando validación, aislamiento, restauración, payload congelado, idempotencia y Keystore.

## Maestro

Las 13 pruebas verifican datos de reserva, tipo normal o corrección, versión de línea, motivo obligatorio, advertencia, resumen, estado resultante, Callable y ausencia de la acción para auxiliares.

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
