# Pruebas de la ETAPA 20

## Principio

Todas las pruebas con ejecución Firebase usan proyectos `demo-*` y Emulator Suite. La compilación Android `release` recibe API key y App ID manifiestamente ficticios, no inicia la aplicación y no se firma. Maestro se compila sin empaquetar Electron. Ningún comando despliega recursos.

## Matriz obligatoria

### Contratos

```powershell
Set-Location contracts
npm ci
npm run validate
npm test
```

Comprueba los JSON Schema compartidos, incluido `ENVIRONMENT_NOT_ALLOWED`.

### Android

```powershell
Set-Location apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat assembleRelease --no-configuration-cache `
  -PproductionFirebaseProjectId=viverocontrol-3f83f `
  -PproductionFirebaseApiKey=API_KEY_FICTICIA_SOLO_CI `
  -PproductionFirebaseAppId=1:000000000000:android:app-ficticia-solo-ci
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

Las pruebas cubren Project ID, applicationId, rechazo seguro de configuración incompleta, ausencia de emuladores en production, operaciones habilitadas y separación de Room, preferencias, FirebaseApp, WorkManager y Keystore.

### Vivero Maestro

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

Las pruebas cubren la matriz de ambiente, `us-central1`, no uso de emuladores en production, CSP cerrada y disponibilidad de operaciones según rol.

### Backend, Rules y concurrencia

```powershell
Set-Location backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

`npm test` cubre la frontera central y las 30 Callables. `test:emulators` levanta Auth, Firestore y Functions, carga el seed ficticio y ejecuta integración, reglas, idempotencia y carreras transaccionales.

## Casos específicos de ambiente

| Caso | Resultado esperado |
|---|---|
| Functions Emulator + `demo-*` | `EMULATOR` |
| Functions Emulator + `demo-*` + `APP_ENV=production` | sigue siendo `EMULATOR` |
| no emulador + `viverocontrol-3f83f` + `APP_ENV=production` | `PRODUCTION` |
| otro proyecto real | rechazo íntegro |
| proyecto correcto sin `APP_ENV=production` | rechazo íntegro |
| emulador apuntando al proyecto real | rechazo íntegro |
| dos variables de Project ID contradictorias | rechazo íntegro |

## Auditoría de repositorio

CI rechaza `google-services.json`, archivos `.env` locales, API keys Firebase con formato real, llaves privadas, KeyStores, APK, AAB, EXE, MSI y directorios generados. También comprueba que no exista un comando de despliegue en scripts o workflows.

## Resultados

Ejecución local final del 16 de julio de 2026:

| Bloque | Resultado exacto |
|---|---|
| Contratos `npm ci` | correcto; 6 paquetes, 0 vulnerabilidades reportadas |
| Contratos `npm run validate` | correcto; 94 esquemas de entidad, 1 esquema común y 5 enums |
| Contratos `npm test` | 57/57 pruebas aprobadas |
| Android `assembleDebug` | compilación correcta; manifest `com.arles.viverocampo.emulator` |
| Android `assembleRelease` ficticio y sin firma | compilación correcta; manifest `com.arles.viverocampo` |
| Android `testDebugUnitTest` | 35/35 pruebas aprobadas, 0 fallos, 0 errores y 0 omitidas |
| Android `lintDebug` | correcto, 0 errores |
| Maestro `npm ci` | correcto; 574 paquetes, 0 vulnerabilidades reportadas |
| Maestro lint / typecheck / build | correctos |
| Maestro `npm test` | 5 archivos y 54/54 pruebas aprobadas |
| Backend `npm ci` | correcto; 899 paquetes; el árbol completo reportó 12 vulnerabilidades moderadas incluidas dependencias de desarrollo |
| Backend lint / typecheck / build | correctos |
| Backend `npm test` | 4 archivos y 22/22 pruebas aprobadas |
| Backend integración en Emulator Suite | 17 archivos y 179/179 pruebas aprobadas |
| Firestore Rules en Emulator Suite | 1 archivo y 22/22 pruebas aprobadas |
| Auditoría Maestro `--omit=dev --audit-level=high` | 0 vulnerabilidades, salida 0 |
| Auditoría Backend `--omit=dev --audit-level=high` | 8 moderadas, 0 altas, 0 críticas, salida 0 |
| Auditoría del repositorio | 0 secretos, comandos de despliegue o artefactos prohibidos versionados |

La compilación de Maestro emitió una advertencia no bloqueante por un único chunk minificado de 867,39 kB (250,80 kB gzip). La ejecución local usó Node 24.15.0, compatible con `engines >=22`; CI queda fijado a Node 22, que es el runtime objetivo de Functions.

Una repetición adicional de Maestro ejecutada mientras Gradle consumía recursos agotó el timeout de 5 segundos en 2 casos (52/54). La misma suite, sin modificar pruebas ni timeouts y repetida sin contención, aprobó 54/54 en 16,32 segundos. La matriz final aislada no tiene fallos pendientes.
