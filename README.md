# Vivero Control Nuevo

Sistema nuevo para operar inventario por línea mediante Vivero Campo (Android), Vivero Maestro (Windows) y un backend transaccional. Este repositorio no consulta, modifica ni reutiliza el proyecto anterior `Vivero-Control`.

## Estado: ETAPA 5

La vertical disponible funciona exclusivamente con Firebase Emulator Suite y datos ficticios:

1. Campo reserva una línea, captura el conteo offline y lo sincroniza idempotentemente.
2. Después de `ENVIADA`, la persona finaliza y puede tomar otra línea sin perder el historial local.
3. `enviarConteo` deja la línea en `PENDIENTE_REVISION` sin tocar inventario.
4. Maestro presenta una bandeja con conteo, inventario oficial actual y diferencias.
5. Supervisor o administrador autorizado solicita `aprobarConteo` o `devolverConteo`.
6. La aprobación reemplaza la fotografía oficial y crea un movimiento histórico en una sola transacción.
7. La devolución conserva el inventario intacto y deja la corrección para la Etapa 6.

> **MODO DE PRUEBA — EMULADOR.** No existe Firebase real configurado, no hay credenciales de producción y ningún comando despliega recursos.

Los conteos y las decisiones son inmutables desde clientes. Maestro no escribe directamente inventario, movimientos, decisiones, auditoría ni estados de línea.

## Reglas de revisión

- Un auxiliar no revisa conteos.
- Supervisor y administrador requieren autorización activa de la jornada.
- Un supervisor no puede aprobar su propio conteo.
- Un administrador puede hacerlo excepcionalmente con advertencia y motivo obligatorio auditado.
- Toda devolución exige motivo.
- Repetir la misma clave con el mismo payload recupera el resultado anterior.
- Una misma clave con otro payload produce `IDEMPOTENCY_CONFLICT`.
- Si dos decisiones compiten, solo una puede confirmar la transición y sus efectos.
- Nunca se asume inventario cero: si falta la fotografía inicial, la aprobación se rechaza íntegramente.

## Inventario ficticio del emulador

El seed repetible crea estas fotografías claramente ficticias:

| Línea | Hembras | Machos | Patrones | Total |
|---|---:|---:|---:|---:|
| `LINEA-PRUEBA-1` | 500 | 300 | 200 | 1.000 |
| `LINEA-PRUEBA-2` | 380 | 220 | 150 | 750 |
| `LINEA-PRUEBA-3` | 270 | 180 | 90 | 540 |

Una aprobación de 450 hembras, 320 machos y 210 patrones para la primera línea reemplaza 1.000 por 980 y registra diferencias `-50`, `+20`, `+10` y `-20`.

## Estructura

```text
Vivero-Control-Nuevo/
|-- .github/workflows/       # CI y auditoría, sin despliegue
|-- apps/campo-android/      # Kotlin, Compose, Room, WorkManager y Keystore
|-- apps/maestro-desktop/    # Electron, React y bandeja de revisión
|-- backend/                 # Callables, reglas, emuladores y seed ficticio
|-- contracts/               # JSON Schema y ejemplos compartidos
|-- data/templates/          # plantillas vacías para levantamiento futuro
|-- docs/                    # definición, arquitectura y pruebas
`-- tests/                   # espacio para escenarios integrales futuros
```

## Emuladores

Requisitos: JDK 21, Android SDK 36.1, Node.js 22 o posterior y npm.

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

Servicios: Auth `9099`, Firestore `8180`, Functions `5001` y Emulator UI `4000`. El seed y las cuatro Functions se niegan a operar fuera de `FUNCTIONS_EMULATOR=true` y un proyecto `demo-*`.

| Correo ficticio | Rol |
|---|---|
| `auxiliar1@prueba.local` | Auxiliar |
| `auxiliar2@prueba.local` | Auxiliar |
| `supervisor@prueba.local` | Supervisor |
| `administrador@prueba.local` | Administrador |

Contraseña exclusiva del emulador: `SoloEmulador-Etapa3!`. Es pública y no debe reutilizarse.

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

# backend, reglas y concurrencia
Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

## Documentación de la ETAPA 5

- [Operación aprobarConteo](docs/arquitectura/OPERACION_APROBAR_CONTEO.md)
- [Operación devolverConteo](docs/arquitectura/OPERACION_DEVOLVER_CONTEO.md)
- [Inventario oficial y movimientos](docs/arquitectura/INVENTARIO_OFICIAL_Y_MOVIMIENTOS_ETAPA_05.md)
- [Reglas de autorrevisión](docs/arquitectura/REGLAS_AUTORREVISION_ETAPA_05.md)
- [Pruebas y concurrencia](docs/pruebas/PRUEBAS_ETAPA_05.md)
- [Criterios de aceptación](docs/ETAPA_05_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)

## Exclusiones vigentes

No están implementados: corrección de conteos devueltos, reasignación, liberación de reservas, gestión completa de jornadas, administración de usuarios, datos reales, migración, Firebase de producción, despliegues, APK de producción, instalador Windows definitivo, descartes, despachos, químicos, aplicaciones ni reingresos.
