# Vivero Control

Vivero Control es un sistema nuevo para administrar el inventario del vivero
mediante dos aplicaciones conectadas a una única fuente central. Este repositorio
no es una modificación ni una copia del proyecto anterior `Vivero-Control`.

## Estado del proyecto

La ETAPA 1 definió el MVP y sus reglas funcionales. La ETAPA 2 instala una
fundación técnica compilable para:

- **Vivero Campo:** aplicación Android nativa con Kotlin, Jetpack Compose y MVVM.
- **Vivero Maestro:** aplicación Windows con Electron, React, TypeScript y Vite.
- **Backend central:** base TypeScript para Firebase Functions, reglas cerradas
  de Firestore y Emulator Suite local.
- **Contratos compartidos:** estados, roles y entidades en JSON Schema.

Todavía no existe un flujo funcional de inventario. No están implementadas las
jornadas, reservas, conteos, correcciones, aprobaciones, descartes, despachos,
autenticación ni administración. Firebase real **no está configurado** y ningún
recurso se despliega desde este repositorio.

## Estructura

```text
Vivero-Control-Nuevo/
|-- .github/workflows/       # validación continua sin despliegue
|-- apps/
|   |-- campo-android/       # esqueleto Android
|   `-- maestro-desktop/     # esqueleto Electron/React
|-- backend/                 # Functions, reglas y emuladores locales
|-- contracts/               # enums y JSON Schema compartidos
|-- docs/
|   |-- adr/                 # decisiones técnicas
|   `-- arquitectura/        # arquitectura transversal
`-- tests/                   # futuros escenarios integrales
```

La finalidad y los comandos completos están en
[Estructura del repositorio](docs/arquitectura/ESTRUCTURA_REPOSITORIO.md).

## Requisitos de desarrollo

- JDK 21.
- Android SDK 36.1. La compatibilidad mínima está fijada provisionalmente en
  Android 6.0 (API 23) y debe confirmarse con los celulares reales.
- Node.js 22 o posterior y npm.
- PowerShell en Windows para los ejemplos; las tareas también funcionan en CI.

No es necesario instalar ni actualizar herramientas globales: cada aplicación
bloquea sus dependencias mediante Gradle Wrapper o `package-lock.json`.

## Identificadores provisionales

- Android `applicationId`: `com.arles.viverocampo`.
- Electron `appId`: `com.arles.viveromaestro`.

Deben confirmarse antes de registrar aplicaciones en Firebase o publicar
instaladores.

## Instalación y verificación

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

### Backend y emuladores

```powershell
Set-Location backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rules:emulator
```

El emulador usa el proyecto ficticio `demo-vivero-control-tests`. Las reglas
actuales deniegan toda lectura y escritura, y el punto de entrada de Functions
no exporta operaciones de negocio. No use un ID real ni ejecute `firebase deploy`.

## Alcance exacto de la ETAPA 2

- Capas base y marcadores técnicos de Campo y Maestro.
- Estados locales de sincronización separados de estados centrales.
- Puertos para Room y WorkManager, sin incorporar todavía sus implementaciones.
- Preload mínimo y configuración defensiva de Electron.
- Interfaces no disponibles para las cinco operaciones centrales futuras.
- Contratos de entidades, idempotencia, timestamps y auditoría.
- Arquitectura, seguridad, estrategia offline y siete ADR.
- Pruebas unitarias, pruebas negativas de reglas, lint y CI sin secretos.

## Documentación de la ETAPA 1

- [Definición funcional](docs/ETAPA_01_DEFINICION_FUNCIONAL.md)
- [Roles y permisos](docs/ROLES_Y_PERMISOS.md)
- [Flujo de jornada de inventario](docs/FLUJO_JORNADA_INVENTARIO.md)
- [Diccionario de datos](docs/DICCIONARIO_DE_DATOS.md)
- [Validaciones y casos límite](docs/VALIDACIONES_Y_CASOS_LIMITE.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)
- [Criterios de aceptación del MVP](docs/CRITERIOS_DE_ACEPTACION_MVP.md)

## Arquitectura y decisiones

- [Arquitectura general](docs/arquitectura/ARQUITECTURA_GENERAL.md)
- [Estrategia offline](docs/arquitectura/ESTRATEGIA_OFFLINE.md)
- [Seguridad](docs/arquitectura/SEGURIDAD.md)
- [ADR-001: Android con Kotlin y Compose](docs/adr/ADR-001-ANDROID-KOTLIN-COMPOSE.md)
- [ADR-002: Electron, React y TypeScript](docs/adr/ADR-002-ELECTRON-REACT-TYPESCRIPT.md)
- [ADR-003: Firebase y emuladores](docs/adr/ADR-003-FIREBASE-Y-EMULADORES.md)
- [ADR-004: backend transaccional](docs/adr/ADR-004-BACKEND-TRANSACCIONAL.md)
- [ADR-005: inventario por línea](docs/adr/ADR-005-INVENTARIO-FOTOGRAFIA-POR-LINEA.md)
- [ADR-006: estados centrales y locales](docs/adr/ADR-006-ESTADOS-CENTRALES-Y-LOCALES.md)
- [ADR-007: estrategia offline](docs/adr/ADR-007-ESTRATEGIA-OFFLINE.md)

## Principios obligatorios

- Una sola fuente central para el inventario oficial.
- Identificadores globales y catálogos controlados para ubicaciones.
- Operaciones críticas atómicas, autorizadas e idempotentes.
- Inventario oficial por línea, reemplazado solo por un conteo aprobado.
- Movimiento histórico y auditoría sin eliminaciones silenciosas.
- Trabajo temporal sin conexión después de confirmar una reserva.
- Separación estricta de desarrollo y producción.
