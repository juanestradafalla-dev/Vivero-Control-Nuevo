# Vivero Campo

Aplicación Android de captura operativa. Auxiliares, supervisores y administradores usan el mismo flujo según sus permisos centrales: autenticación, selección de jornada, reserva, conteo, descarte offline, sincronización, corrección e historial local.

## Ambientes

| Build type | Ambiente | Application ID | Firebase | Namespace local |
|---|---|---|---|---|
| `debug` | `EMULATOR` | `com.arles.viverocampo.emulator` | Proyecto `demo-*` y Emulator Suite | `emulator` |
| `release` | `PRODUCTION` | `com.arles.viverocampo` | Proyecto exacto `viverocontrol-3f83f` | `production` |

`PRODUCTION` rechaza Project ID distinto, API key o App ID ausentes, applicationId incorrecto, host de emulador o namespace local diferente. `FirebaseServicesInitializer` solo invoca `useEmulator` cuando el ambiente validado es `EMULATOR`.

Room, preferencias, FirebaseApp, WorkManager y Android Keystore derivan nombres distintos del namespace validado. Así pueden coexistir ambas instalaciones sin compartir base de datos, instalación técnica, trabajos pendientes ni claves de reserva.

## Persistencia y sincronización

- Room conserva reserva, borrador e historial por usuario, dispositivo y reserva.
- Android Keystore cifra el token con AES-GCM y nunca lo persiste en texto plano.
- WorkManager mantiene payload y clave idempotente durante reintentos.
- `ENVIADA` solo aparece después de confirmación central.
- una reserva liberada conserva el borrador local y cancela su trabajo único.
- las correcciones crean una versión nueva sin alterar la autoría ni el historial anterior.
- Room conserva también el catálogo de líneas y un borrador de descarte por cuenta y dispositivo.
- una sesión previamente iniciada se restaura desde Firebase y Firestore local al reiniciar sin cobertura.
- el descarte confirmado se sincroniza con WorkManager al recuperar señal y queda pendiente de revisión.

Campo no aprueba, devuelve, reasigna, libera ni modifica inventario. Registrar un descarte tampoco descuenta inventario: esas decisiones pertenecen a Maestro y al backend.

## Compilación segura

Emulador:

```powershell
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

Comprobación de código `PRODUCTION` con identificadores ficticios y sin firma:

```powershell
./gradlew.bat assembleRelease --no-configuration-cache `
  -PproductionFirebaseProjectId=viverocontrol-3f83f `
  -PproductionFirebaseApiKey=API_KEY_FICTICIA_SOLO_COMPILACION `
  -PproductionFirebaseAppId=1:000000000000:android:app-ficticia
```

La compilación no inicia Firebase ni conecta con el proyecto real. El APK local resultante no está firmado y permanece ignorado por Git; no es un APK definitivo.

## Configuración local posterior

Los valores Web de Firebase pueden proporcionarse en `local.properties` (ignorado) o mediante `-P`:

```properties
productionFirebaseProjectId=viverocontrol-3f83f
productionFirebaseApiKey=VALOR_LOCAL
productionFirebaseAppId=VALOR_LOCAL
```

La firma futura admite estas propiedades locales:

```properties
productionKeystorePath=RUTA_LOCAL
productionKeystorePassword=VALOR_LOCAL
productionKeyAlias=VALOR_LOCAL
productionKeyPassword=VALOR_LOCAL
```

También admite `VIVERO_CAMPO_KEYSTORE_PATH`, `VIVERO_CAMPO_KEYSTORE_PASSWORD`, `VIVERO_CAMPO_KEY_ALIAS` y `VIVERO_CAMPO_KEY_PASSWORD`. Si se proporciona solo una parte, Gradle falla de forma segura. No se genera ni versiona ninguna llave o contraseña.
