# Pruebas — ETAPA 11

## Backend, contratos y emuladores

La suite cubre permisos por rol, aislamiento entre supervisores, administración global, usuarios inexistentes o inactivos, IDs duplicados, campos adicionales, nombres y roles centrales, recuperación idempotente y conflicto por payload diferente.

También compara las colecciones antes y después para confirmar que no se crean autorizaciones operativas, `jornadaLineas`, reservas, conteos, inventario ni movimientos. Las reglas rechazan lectura y escritura directa de la selección y Campo sigue excluyendo borradores.

## Vivero Maestro

Las pruebas verifican catálogo de usuarios activos, nombre y rol visibles, búsqueda, filtro, selección única, configuración `puede contar`, resumen previo y envío mediante el repositorio de Callables. Auxiliares no ven la sección administrativa.

## Matriz

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
