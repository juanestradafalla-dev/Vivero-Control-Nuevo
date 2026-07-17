# ETAPA 23 — Pruebas

## Cobertura

La matriz verifica:

- contratos estrictos de listado, registro, aprobación y devolución;
- cálculo del total único y superposición permitida de causas;
- rechazo de cero, campos adicionales, causa excesiva e inventario insuficiente;
- registro inmutable e idempotente sin modificación de inventario;
- aprobación atómica, diferencias negativas, movimiento, decisión y auditoría;
- devolución sin modificación de inventario;
- autorrevisión por rol y motivo de excepción;
- rechazo de una segunda aprobación obsoleta sobre la misma versión;
- reglas de lectura por autor/revisor y denegación de escrituras directas;
- índices y lista exacta de 34 Callables;
- validador local de Campo, caché Room, borrador y sincronización diferida;
- navegación y bandeja de descartes de Maestro.

## Comandos de cierre

```powershell
Set-Location contracts
npm ci
npm run check

Set-Location ../apps/campo-android
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
./gradlew.bat assembleDebug

Set-Location ../maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build

Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
```

Todas las pruebas remotas usan proyectos `demo-*` de Emulator Suite. Ningún comando despliega Firebase ni utiliza datos reales.

## Estado previo al PR

- backend: lint, typecheck, build y 53 pruebas locales aprobadas;
- contratos: JSON verificado sintácticamente; matriz Ajv pendiente de CI por dependencia local ausente;
- Android: validación completa pendiente de CI con JDK 21 y SDK configurado;
- Maestro: validación completa pendiente de CI con instalación limpia de npm;
- Emulator Suite: pendiente de CI con Java 21;
- operaciones sobre producción: cero.
