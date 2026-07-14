# Vivero Control Nuevo

Sistema nuevo para operar inventario por línea mediante Vivero Campo (Android), Vivero Maestro (Windows) y un backend transaccional. Este repositorio no modifica ni reutiliza el proyecto anterior `Vivero-Control`.

## Estado: ETAPA 4

La vertical disponible funciona exclusivamente con Firebase Emulator Suite y datos ficticios:

1. una cuenta autenticada reserva una línea con `reservarLinea`;
2. Campo protege el token con Android Keystore y AES-GCM;
3. el conteo se captura en un borrador Room aislado por cuenta, dispositivo y reserva;
4. una confirmación explícita congela payload y clave idempotente;
5. WorkManager espera conectividad y reintenta el mismo intento lógico;
6. `enviarConteo` valida fuentes centrales y, en una transacción, crea un conteo inmutable, consume la reserva y cambia `EN_CONTEO` a `PENDIENTE_REVISION`;
7. Maestro muestra el conteo al supervisor o administrador como monitor de solo lectura.

> **MODO DE PRUEBA — EMULADOR.** No existe Firebase real configurado, no hay credenciales de producción y ningún comando despliega recursos.

`ENVIADA` es un estado local de sincronización. No existe como estado central. Un conteo pendiente de revisión no crea, actualiza ni reemplaza inventario oficial.

## Componentes

```text
Vivero-Control-Nuevo/
|-- .github/workflows/       # CI y auditoría, sin despliegue
|-- apps/campo-android/      # Kotlin, Compose, Room, WorkManager y Keystore
|-- apps/maestro-desktop/    # Electron, React y TypeScript; solo lectura
|-- backend/                 # Functions, reglas, emuladores y seed ficticio
|-- contracts/               # JSON Schema y ejemplos compartidos
|-- data/templates/          # plantillas vacías para levantamiento futuro
|-- docs/                    # definición, arquitectura y pruebas
`-- tests/                   # espacio para escenarios integrales futuros
```

## Requisitos

- JDK 21.
- Android SDK 36.1; `minSdk` provisional 23.
- Node.js 22 o posterior y npm.
- Java disponible para Firestore Emulator.

Gradle Wrapper, dependency locking y `package-lock.json` fijan dependencias reproducibles. No se incluye `google-services.json`.

## Emuladores y datos ficticios

```powershell
Set-Location backend/functions
npm ci
npm run build
npm run emulators:start
```

En otra terminal:

```powershell
Set-Location backend/functions
npm run emulator:seed
```

Servicios: Auth `9099`, Firestore `8180`, Functions `5001` y Emulator UI `4000`. El seed se niega a trabajar si el proyecto no comienza por `demo-`.

| Correo ficticio | Rol |
|---|---|
| `auxiliar1@prueba.local` | Auxiliar |
| `auxiliar2@prueba.local` | Auxiliar |
| `supervisor@prueba.local` | Supervisor |
| `administrador@prueba.local` | Administrador |

Contraseña exclusiva del emulador: `SoloEmulador-Etapa3!`. Es pública y no debe reutilizarse.

## Ejecutar clientes

Campo, con Emulator Suite activo:

```powershell
Set-Location apps/campo-android
./gradlew.bat installDebug
```

Android Emulator usa `10.0.2.2`. La variante `release` carece de configuración Firebase y falla de forma segura.

Maestro:

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run dev
```

Maestro permite búsqueda y filtro por estado. Solo supervisor o administrador autorizados consultan el detalle de conteos. No existen acciones de aprobar, devolver, corregir, reasignar, liberar ni modificar inventario.

## Verificación

```powershell
# contratos
Set-Location contracts
npm ci
npm run validate
npm test

# Android
Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug

# Maestro
Set-Location ../maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high

# backend y emuladores
Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

`test:emulators` reserva primero y luego envía mediante Auth, Functions y Firestore Emulator reales. Incluye dos reservas concurrentes, dos envíos concurrentes, recuperación idempotente y reglas positivas/negativas.

## Documentación de la ETAPA 4

- [Modelo Firestore](docs/arquitectura/MODELO_FIRESTORE_ETAPA_04.md)
- [Operación enviarConteo](docs/arquitectura/OPERACION_ENVIAR_CONTEO.md)
- [Captura offline y sincronización](docs/arquitectura/CAPTURA_OFFLINE_Y_SINCRONIZACION.md)
- [Protección del token en Android](docs/arquitectura/PROTECCION_TOKEN_RESERVA_ANDROID.md)
- [Pruebas](docs/pruebas/PRUEBAS_ETAPA_04.md)
- [Criterios de aceptación](docs/ETAPA_04_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)

## Exclusiones vigentes

No están implementados aprobación, devolución, correcciones, reasignación, inventario oficial, movimientos, liberación manual, gestión de jornadas, administración de usuarios, datos reales, migración, Firebase real, despliegues, APK de producción, instalador definitivo, descartes, despachos, químicos, aplicaciones ni reingresos.
