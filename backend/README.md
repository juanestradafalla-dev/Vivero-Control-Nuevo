# Backend local de Vivero Control

Esta carpeta contiene la fundación técnica de Firebase Functions y las reglas de
Firestore. En la ETAPA 2 no existe conexión a un proyecto Firebase real, no hay
credenciales y no se despliega ningún recurso.

## Requisitos

- Node.js 22 o posterior.
- Java 21 para el emulador de Firestore.
- Dependencias instaladas en `functions/` con `npm ci`.

## Validación local

Desde `backend/functions`:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rules:emulator
```

El último comando utiliza exclusivamente el proyecto ficticio
`demo-vivero-control-tests` y arranca el emulador local de Firestore. Las reglas
de la ETAPA 2 rechazan toda lectura y escritura, incluso sin autenticación.

## Configuración futura

`.firebaserc.example` es solo una plantilla local. No debe renombrarse ni
rellenarse con un identificador real hasta que se aprueben los ambientes, la
región y los responsables de credenciales.
