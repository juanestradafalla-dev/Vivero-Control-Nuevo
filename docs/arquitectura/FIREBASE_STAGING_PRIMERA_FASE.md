# Firebase staging — primera fase

## Alcance y frontera

Esta preparación permite que Vivero Campo autentique cuentas creadas manualmente en Firebase Authentication y consulte sus jornadas activas en el proyecto staging exacto `viverocontrol-3f83f`. No es producción y no habilita escrituras operativas.

La base Firestore del proyecto ya existe en la ubicación multirregional `nam5`. No debe recrearse, eliminarse ni intentarse cambiar su ubicación. Las Cloud Functions permanecen en `us-central1`; tanto la Callable publicada como el cliente Android deben conservar esa región.

El build `debug` permanece conectado a Emulator Suite. El build `staging`:

- instala `com.arles.viverocampo.staging` con firma debug;
- muestra `STAGING — DATOS DE PRUEBA`;
- nunca ejecuta `useEmulator`;
- acepta únicamente `viverocontrol-3f83f`;
- usa un sandbox Android y namespaces de Room, preferencias, WorkManager y Keystore diferentes del emulador;
- bloquea reservas, conteos y correcciones en la interfaz y el repositorio.

En backend, `listarJornadasActivas` acepta el emulador existente o la combinación simultánea `GCLOUD_PROJECT=viverocontrol-3f83f`, `APP_ENV=staging` y usuario autenticado. Todas las demás Callables conservan `assertEmulatorOnly`.

## Registrar la aplicación Android

El propietario debe entrar a Firebase Console, seleccionar `viverocontrol-3f83f` y registrar una aplicación Android con este package name exacto:

```text
com.arles.viverocampo.staging
```

La firma es debug durante esta fase. No agregue el plugin Google Services ni copie `google-services.json` al repositorio. Obtenga desde la configuración de la aplicación únicamente el App ID y la API key necesarios para FirebaseOptions; manténgalos locales.

## Configuración local de Campo

Cree `apps/campo-android/local.properties`. El archivo ya está ignorado por Git:

```properties
sdk.dir=C:\\Users\\USUARIO\\AppData\\Local\\Android\\Sdk
stagingFirebaseProjectId=viverocontrol-3f83f
stagingFirebaseApiKey=VALOR_LOCAL_DE_FIREBASE
stagingFirebaseAppId=VALOR_LOCAL_DE_FIREBASE
```

También puede inyectar los tres valores mediante `-P`. Para instalar en un celular conectado:

```powershell
Set-Location apps/campo-android
.\gradlew.bat installStaging
```

Si falta API key/App ID o el Project ID cambia, la aplicación no inicializa Firebase, deshabilita el formulario y presenta el motivo. No registra esos valores en logs.

## Authentication y perfiles

En Firebase Console habilite Authentication > Sign-in method > Email/Password. Cree las cuentas de prueba manualmente. No escriba correos ni contraseñas en Git, documentación, scripts, logs o mensajes de error.

Por cada UID de Authentication cree manualmente `usuarios/{uid}` en Firestore con el contrato vigente:

```text
id: <uid exacto de Firebase Authentication>
nombreVisible: <nombre autorizado para pruebas>
roles: [AUXILIAR] | [SUPERVISOR] | [ADMINISTRADOR]
activo: true
version: 1
creadoEn: <Firestore Timestamp>
actualizadoEn: <Firestore Timestamp>
```

No agregue correo, contraseña, token ni metadatos internos de Auth al perfil. Una cuenta sin perfil, inactiva o sin rol central se rechaza. Para que aparezca una jornada también deben existir una jornada `ACTIVA` y `jornadas/{jornadaId}/autorizaciones/{uid}` activa y coherente; crear estos datos queda como paso manual controlado, no como parte de este PR.

## APP_ENV y despliegue posterior del propietario

Antes de un despliegue autorizado, el propietario debe crear localmente `backend/functions/.env.viverocontrol-3f83f`:

```dotenv
APP_ENV=staging
```

Ese archivo está ignorado y no contiene secretos. Después de revisar el PR, configurar Firebase CLI y confirmar el proyecto, el comando exacto para desplegar únicamente reglas, índices y la Callable de lectura es:

```powershell
Set-Location backend/functions
npx firebase deploy --config ../firebase.json --project viverocontrol-3f83f --only "firestore:rules,firestore:indexes,functions:listarJornadasActivas"
```

Este comando se documenta para ejecución manual futura. No fue ejecutado por Codex ni por CI. Reservas, conteos, revisión, administración y migración no deben incluirse en ese despliegue.

## Datos prohibidos

Nunca versionar o registrar `google-services.json`, `.env.viverocontrol-3f83f`, API keys reales, App IDs reales, cuentas de servicio, tokens, correos de usuarios o contraseñas. Staging contiene exclusivamente datos de prueba autorizados.
