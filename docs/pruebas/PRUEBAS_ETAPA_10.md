# Pruebas — ETAPA 10

## Backend y emuladores

La suite integrada cubre creación por supervisor y administrador, rechazo del auxiliar y del nombre vacío, recuperación idempotente, conflicto por payload distinto, aislamiento entre supervisores, administración global, líneas inexistentes o inactivas, IDs duplicados, líneas usadas en jornadas activas y rechazo de jornadas que dejaron de ser `BORRADOR`.

También comprueba que la selección queda separada de `jornadaLineas`, que no se crea inventario, que Campo recibe únicamente jornadas `ACTIVA` y que las reglas rechazan lecturas y escrituras directas de los borradores y su preparación.

## Vivero Maestro

Las pruebas de interfaz verifican visibilidad por rol, creación del borrador, agrupación y filtrado del catálogo, conteo de selección, resumen previo, guardado central y ausencia de acciones de activación, cierre o eliminación.

## Matriz local

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
npm audit --omit=dev --audit-level=high

Set-Location ../../backend/functions
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```
