# Vivero Maestro

Aplicación Windows basada en Electron, React, TypeScript y Firebase Web SDK. Todas las mutaciones críticas se solicitan mediante Callables; el cliente no escribe directamente inventario, movimientos, decisiones, auditoría ni estados operativos.

## Ambientes

Maestro admite únicamente:

- `EMULATOR`: `VITE_APP_ENV=emulator`, `VITE_USE_FIREBASE_EMULATORS=true` y proyecto `demo-*`.
- `PRODUCTION`: `VITE_APP_ENV=production`, `VITE_USE_FIREBASE_EMULATORS=false` y proyecto exacto `viverocontrol-3f83f`.

Las seis variables se proporcionan en `.env.local`, ignorado por Git:

```dotenv
VITE_APP_ENV=production
VITE_USE_FIREBASE_EMULATORS=false
VITE_FIREBASE_PROJECT_ID=viverocontrol-3f83f
VITE_FIREBASE_API_KEY=VALOR_LOCAL
VITE_FIREBASE_APP_ID=VALOR_LOCAL
VITE_FIREBASE_AUTH_DOMAIN=VALOR_LOCAL
```

`.env.example` conserva una configuración completamente ficticia del emulador. No se usa `google-services.json` ni se versionan valores reales.

## Funciones por rol

- Auxiliar: solo la visibilidad que permiten las reglas y autorizaciones centrales; no recibe acciones administrativas.
- Supervisor autorizado: revisión de conteos y descartes, devolución, aprobación permitida, correcciones, reasignación, liberación y gestión de sus jornadas.
- Administrador activo: las operaciones anteriores más jornadas globales, usuarios, catálogo, inventario inicial, validación, importación y reversión controlada.

El backend vuelve a validar rol, perfil, jornada, versión, idempotencia y estado. La interfaz no sustituye la autorización central.

En descartes, Maestro muestra categorías, causas, total único, versión observada y autor. Devolver exige motivo y no toca inventario. Aprobar solicita la transacción central; un supervisor no puede autorrevisarse y un administrador necesita motivo de excepción para hacerlo.

## CSP

`index.html` permite únicamente los puertos locales necesarios de Vite y Emulator Suite, los endpoints oficiales de Auth y Firestore, y `https://us-central1-viverocontrol-3f83f.cloudfunctions.net`. No usa comodines de red ni `unsafe-eval`.

## Verificación

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

## Empaquetado preparado, no ejecutado

Electron Builder queda configurado con:

- appId `com.arles.viveromaestro`;
- productName y executableName `Vivero Maestro`;
- artifactName `Vivero-Maestro-Setup-${version}.${ext}`.

`npm run validate:production-env` valida la configuración local sin mostrar valores. `npm run package:win:production` queda disponible para una etapa posterior, pero la ETAPA 20 no lo ejecuta, no genera instalador definitivo y no incorpora certificados de firma.
