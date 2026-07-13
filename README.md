# Vivero Control

Vivero Control es el proyecto nuevo para operar inventario por línea mediante
Vivero Campo (Android), Vivero Maestro (Windows) y un backend transaccional. No
es una modificación ni una copia del repositorio anterior `Vivero-Control`.

## Estado: ETAPA 3

La primera operación vertical funciona exclusivamente en Firebase Emulator
Suite:

1. un usuario ficticio inicia sesión en Campo;
2. consulta la jornada ficticia activa y sus líneas;
3. `reservarLinea` valida identidad, rol y autorización centrales;
4. una transacción crea reserva, cambia `DISPONIBLE` a `EN_CONTEO`, incrementa
   versión y registra auditoría e idempotencia;
5. solo un usuario gana si dos intentan la misma línea;
6. Maestro refleja el estado mediante un monitor de solo lectura.

> **MODO DE PRUEBA — EMULADOR.** No existe Firebase real configurado, no hay
> credenciales de producción y ningún comando del repositorio despliega recursos.

No están implementados el formulario de conteo, aprobación, devolución,
liberación, inventario oficial, descartes, despachos, aplicaciones, químicos,
reingreso, administración completa ni migración de datos reales.

## Estructura

```text
Vivero-Control-Nuevo/
|-- .github/workflows/       # CI de validación, sin despliegue
|-- apps/
|   |-- campo-android/       # Android Kotlin, Compose, MVVM y Room
|   `-- maestro-desktop/     # Electron, React y TypeScript; solo lectura
|-- backend/                 # Functions, reglas, emuladores y seed ficticio
|-- contracts/               # JSON Schema y ejemplos compartidos
|-- data/templates/          # CSV vacíos para levantamiento futuro
|-- docs/                    # definición, arquitectura, datos y pruebas
`-- tests/                   # espacio para escenarios integrales futuros
```

## Requisitos

- JDK 21.
- Android SDK 36.1; `minSdk` provisional 23.
- Node.js 22 o posterior y npm.
- Java disponible para Firestore Emulator.

Las dependencias quedan bloqueadas mediante Gradle Wrapper, Gradle dependency
locking y `package-lock.json`.

## Emuladores y datos ficticios

Instale, compile e inicie los servicios desde `backend/functions`:

```powershell
npm ci
npm run build
npm run emulators:start
```

En otra terminal cargue el escenario reproducible:

```powershell
Set-Location backend/functions
npm run emulator:seed
```

Servicios: Auth `9099`, Firestore `8180`, Functions `5001` y Emulator UI `4000`.
El seed se niega a trabajar si el proyecto no comienza por `demo-`.

### Cuentas operativas ficticias

| Correo | Rol |
|---|---|
| `auxiliar1@prueba.local` | Auxiliar |
| `auxiliar2@prueba.local` | Auxiliar |
| `supervisor@prueba.local` | Supervisor |
| `administrador@prueba.local` | Administrador |

Contraseña exclusiva del emulador: `SoloEmulador-Etapa3!`. Es pública y no debe
reutilizarse. El seed agrega otras cuentas técnicas para casos negativos.

## Ejecutar Vivero Campo

Con Emulator Suite y el seed activos:

```powershell
Set-Location apps/campo-android
./gradlew.bat installDebug
```

Android Emulator usa `10.0.2.2`. Para un celular físico de desarrollo se puede
pasar `-PemulatorHost=<IP_PRIVADA_DEL_PC>` y habilitar los emuladores únicamente
en la red privada controlada. Consulte
[Configuración de clientes](docs/arquitectura/CONFIGURACION_EMULADORES_CLIENTES.md).

La variante `release` no contiene configuración Firebase y falla de forma
segura. No se incluye `google-services.json`.

## Ejecutar Vivero Maestro

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run dev
```

Maestro usa valores demo de `.env.example`, permite iniciar sesión y observa la
jornada. Solo supervisor o administrador ven el titular y la hora de una
reserva. No existen botones de escritura.

## Verificación

### Contratos

```powershell
Set-Location contracts
npm ci
npm run validate
npm test
```

### Android

```powershell
Set-Location apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

### Maestro

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

### Backend y prueba integrada

```powershell
Set-Location backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev
```

`test:emulators` inicia Auth, Firestore y Functions, carga el seed, prueba dos
reservas concurrentes y valida reglas. CI ejecuta las mismas áreas y falla ante
alertas npm altas o críticas; nunca despliega.

## Documentación de la ETAPA 3

- [Modelo Firestore](docs/arquitectura/MODELO_FIRESTORE_ETAPA_03.md)
- [Autenticación y autorización](docs/arquitectura/AUTENTICACION_Y_AUTORIZACION.md)
- [Operación reservarLinea](docs/arquitectura/OPERACION_RESERVAR_LINEA.md)
- [Datos ficticios](docs/arquitectura/DATOS_FICTICIOS_EMULADOR.md)
- [Configuración de emuladores](docs/arquitectura/CONFIGURACION_EMULADORES_CLIENTES.md)
- [Pruebas de concurrencia](docs/pruebas/PRUEBAS_CONCURRENCIA_RESERVA.md)
- [Plantillas futuras](docs/datos/COMPLETAR_PLANTILLAS_REALES.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)

## Documentación previa

- [Definición funcional](docs/ETAPA_01_DEFINICION_FUNCIONAL.md)
- [Roles y permisos](docs/ROLES_Y_PERMISOS.md)
- [Flujo de jornada](docs/FLUJO_JORNADA_INVENTARIO.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)
- [Arquitectura general](docs/arquitectura/ARQUITECTURA_GENERAL.md)
- [Seguridad](docs/arquitectura/SEGURIDAD.md)
- [Estrategia offline](docs/arquitectura/ESTRATEGIA_OFFLINE.md)

## Principios vigentes

- Identidad, roles, permisos y hora nunca se confían al cliente.
- Operaciones críticas atómicas, autorizadas, auditadas e idempotentes.
- Una sola fuente central y una versión por línea de jornada.
- Escrituras directas críticas cerradas por reglas.
- Separación estricta entre datos ficticios, desarrollo y futura producción.
- Inventario oficial por línea, actualizado solo por un conteo aprobado futuro.
