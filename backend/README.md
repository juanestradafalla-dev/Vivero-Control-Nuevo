# Backend local de Vivero Control

Backend de la ETAPA 3 para Firebase Emulator Suite. Exporta `reservarLinea`,
reglas de lectura mínima y un seed enteramente ficticio. No tiene credenciales,
proyecto real ni despliegue.

## Requisitos

- Node.js 22 o posterior.
- Java 21 para Firestore Emulator.
- Dependencias instaladas en `functions/` con `npm ci`.

## Desarrollo local

Desde `backend/functions`:

```powershell
npm ci
npm run build
npm run emulators:start
```

Con los emuladores activos:

```powershell
npm run emulator:seed
```

El proyecto permitido es `demo-vivero-control-etapa3`; el seed y la Function se
niegan a operar fuera de un entorno `demo-*` local.

## Verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev
```

`test:emulators` inicia Auth, Firestore y Functions, carga los datos ficticios,
prueba autorización, atomicidad, idempotencia y concurrencia, y valida las
reglas. No use `firebase deploy`.

Las alertas moderadas conocidas están registradas en
[Dependencias y riesgos](../docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md) y
bloquean cualquier decisión de despliegue hasta su evaluación.
