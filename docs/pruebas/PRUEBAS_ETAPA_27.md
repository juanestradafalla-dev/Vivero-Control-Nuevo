# ETAPA 27B — Pruebas

## Contratos

- solicitudes y resultados estrictos de inicio, finalización, estado y revocación;
- callback exclusivo `127.0.0.1`, challenge PKCE y una selección;
- rechazo de scopes amplios, propiedades adicionales y tokens en respuestas;
- sincronización del registro de 42 Callables.

## Backend y Emulator Suite

- matriz `fake` frente a producción exacta y rechazo de configuración incompleta;
- URL con `drive.file`, Picker, PKCE S256 y consentimiento explícito;
- administrador permitido; sesión anónima, auxiliar, supervisor o perfil inactivo rechazados;
- selección de plantilla y carpeta, estado `LISTO`, replay idempotente y conflicto de payload;
- cuenta distinta, scope amplio, callback inválido, sesión vencida e `invalid_grant` rechazados;
- token ficticio ausente de Firestore, auditoría, idempotencia y resultados;
- revocación idempotente y estado sanitizado;
- Rules niega lectura y escritura directa de configuración y sesiones.

## Vivero Maestro

- panel visible únicamente para administrador;
- apertura por IPC en navegador del sistema, host exacto y loopback efímero;
- flujo permitido para plantilla y carpeta, estado y revocación;
- botones bloqueados durante envío y mensajes de cancelación o expiración;
- respuestas y UI sin tokens;
- supervisor conserva informes de solo lectura sin controles OAuth.

## Comandos enfocados

```powershell
Set-Location contracts
npm run validate
npm test

Set-Location ../backend/functions
npm run lint
npm run typecheck
npm test
npm run build

Set-Location ../../apps/maestro-desktop
npm run lint
npm run typecheck
npm test
npm run build
```

La prueba integrada y las Rules se ejecutan con Firebase Emulator Suite y proyecto `demo-*`. CI ejecuta además la matriz completa existente, Android y el control de secretos y artefactos. Ninguna prueba contacta Google Drive real ni guarda tokens reales.
