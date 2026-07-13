# Estructura del repositorio

## Carpetas

| Ruta | Finalidad |
|---|---|
| `.github/workflows/` | Validación continua sin despliegues ni secretos. |
| `apps/campo-android/` | Aplicación Android nativa y su Gradle Wrapper. |
| `apps/maestro-desktop/` | Aplicación Windows con Electron, React y Vite. |
| `backend/functions/` | Fundación TypeScript de las operaciones centrales. |
| `backend/` | Reglas, índices y configuración de emuladores. |
| `contracts/enums/` | Estados y roles aprobados. |
| `contracts/schemas/` | Entidades compartidas en JSON Schema. |
| `docs/arquitectura/` | Vista técnica transversal. |
| `docs/adr/` | Decisiones de arquitectura y sus consecuencias. |
| `docs/` | Definición funcional conservada de la ETAPA 1. |
| `tests/` | Punto de entrada para pruebas integrales futuras. |

## Comandos

Los comandos se ejecutan desde la raíz, salvo indicación contraria.

### Contratos

```powershell
node contracts/validate.mjs
```

### Vivero Campo

```powershell
Set-Location apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

### Vivero Maestro

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

### Backend

```powershell
Set-Location backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rules:emulator
```

La última orden usa Java y el emulador local con un identificador de proyecto
ficticio. Ninguna orden configura o despliega Firebase real.
