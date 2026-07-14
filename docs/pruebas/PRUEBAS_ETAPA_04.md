# Pruebas de la ETAPA 4

## Contratos

`npm run validate` compila JSON Schema Draft 2020-12. `npm test` cubre conteo, suma, cero, rechazo de `total`, request/result e idempotencia.

## Backend y emuladores

`npm run test:emulators` levanta Auth, Firestore y Functions, carga datos ficticios y ejecuta:

- reserva real previa mediante `reservarLinea`;
- envío válido, total calculado y cero;
- negativos, decimales, desbordamiento y campos adicionales;
- token, titular, dispositivo, perfil, autorización, jornada, reserva y estado de línea;
- reintento idéntico, conflicto de payload y dos claves concurrentes;
- un conteo, una auditoría, una transición y una versión;
- ausencia de inventario y movimientos;
- lecturas permitidas y escrituras directas rechazadas por reglas.

## Android

`testDebugUnitTest` cubre validación, cálculo, cero, confirmación, congelación, clave única, aislamiento, restauración, edición después de error, estados locales, AES-GCM autenticado y eliminación del token en Room después del éxito. `assembleDebug` y `lintDebug` verifican integración Android.

## Maestro

Las pruebas verifican presentación de `PENDIENTE_REVISION`, cantidades, total, autor, dispositivo, snapshot actualizado, ocultación al auxiliar, búsqueda/filtro y ausencia de acciones operativas.

## Auditoría del repositorio

CI rechaza `google-services.json`, `.env`, APK, ejecutables, almacenes de claves y directorios `node_modules`, `build`, `.gradle` o `.idea`. También rechaza instrucciones de despliegue en workflow o scripts.

## Resultado esperado de concurrencia

Para dos claves simultáneas sobre una reserva, exactamente una promesa se resuelve; la otra recibe un error central controlado. Firestore termina con una reserva consumida, un conteo, una auditoría `CONTEO_ENVIADO`, una transición a `PENDIENTE_REVISION` y versión de línea 2.
