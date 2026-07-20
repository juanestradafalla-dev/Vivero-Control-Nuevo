# ETAPA 27B — OAuth de usuario para Google Drive

## Decisión y alcance

La integración usa Authorization Code con PKCE S256 para una aplicación Desktop. Electron crea un listener efímero en `127.0.0.1`, abre el navegador predeterminado y nunca muestra OAuth dentro de una `WebView`. Google Picker solicita acceso explícito a una plantilla o a una carpeta y devuelve un único ID por intento. El único alcance permitido es:

```text
https://www.googleapis.com/auth/drive.file
```

`drive.file` es no sensible y limita la aplicación a los recursos que la persona abre o comparte con la aplicación. La selección puede incluir una carpeta ubicada en “Compartidos conmigo”, porque el corpus de usuario comprende archivos propios y compartidos y Picker opera con la sesión del usuario. No se solicita `drive`, `drive.readonly`, identidad, correo u otro alcance.

La autorización duradera es viable si la pantalla de consentimiento no queda en estado **Testing**. Para una aplicación externa, debe publicarse como **In production**; una aplicación elegible configurada como interna también evita el vencimiento de siete días asociado a pruebas. La publicación no reemplaza las políticas del administrador de Google Workspace.

## Flujo seguro

1. Un administrador pulsa “Conectar Google Drive” o selecciona el recurso faltante.
2. Electron genera localmente un `code_verifier`, su challenge S256 y un puerto aleatorio.
3. `iniciarConexionGoogleDrive` valida al administrador, crea `state` con nonce aleatorio y una sesión central de diez minutos. Solo guarda hashes y el challenge, nunca tokens.
4. Electron valida host, ruta, scope, redirect, challenge, `state` y parámetros obligatorios antes de abrir el navegador del sistema.
5. Picker permite escoger exactamente un recurso. La plantilla admite XLSX o Google Sheets; la carpeta exige `canAddChildren=true`.
6. `completarConexionGoogleDrive` reclama la sesión, intercambia el código con PKCE, confirma el único scope, consulta el correo mediante Drive `about.get` y lo compara con la cuenta principal configurada.
7. El refresh token se agrega directamente a Secret Manager. Firestore conserva únicamente nombres, IDs seleccionados, estado, versión y auditoría.
8. Al quedar plantilla y carpeta configuradas, el estado pasa a `LISTO`. El procesador lee solo la versión `latest` del secreto.
9. `invalid_grant` cambia la conexión a `REQUIERE_RECONEXION` con un error sanitizado. La jornada no se reabre y el informe queda reintentable.
10. “Revocar autorización” revoca el grant en Google y marca el estado central `REVOCADO`; nunca devuelve o muestra el token.

Los archivos siguen deduplicándose con `appProperties` de jornada y periodo. Una respuesta perdida se recupera mediante la misma sesión o clave idempotente, sin crear sesiones, auditorías o archivos lógicos duplicados.

## Configuración manual posterior

### 1. APIs y plataforma OAuth

Ejecutar solo después de autorización productiva:

```powershell
gcloud services enable drive.googleapis.com picker.googleapis.com secretmanager.googleapis.com `
  --project=viverocontrol-3f83f
```

En Google Auth Platform:

- configurar audiencia interna si el proyecto pertenece al Workspace y la política lo permite; en caso contrario, audiencia externa;
- declarar únicamente `https://www.googleapis.com/auth/drive.file`;
- agregar la cuenta principal como usuario de prueba solo durante la preparación;
- antes del uso continuo, publicar la aplicación como **In production** para evitar el vencimiento de siete días de los refresh tokens de Testing;
- crear un cliente OAuth **Desktop app** y conservar únicamente su Client ID como configuración de Functions;
- no crear Client Secret operativo, llave JSON, origen JavaScript ni redirect Web.

La redirección exacta se genera en cada intento con este patrón nativo:

```text
http://127.0.0.1:<PUERTO_EFIMERO>/
```

No se usa `localhost`, IP pública, HTTPS local, puerto fijo ni ruta adicional.

### 2. Secret Manager e identidades dedicadas

Crear dos cuentas de servicio dedicadas sin llaves y un secreto vacío, cuyo nombre no revele una persona. Los marcadores deben sustituirse durante la operación aprobada:

```powershell
gcloud iam service-accounts create <SA_OAUTH_WRITER> --project=viverocontrol-3f83f
gcloud iam service-accounts create <SA_REPORT_RUNTIME> --project=viverocontrol-3f83f
gcloud secrets create <OAUTH_REFRESH_SECRET> --replication-policy=automatic --project=viverocontrol-3f83f

gcloud secrets add-iam-policy-binding <OAUTH_REFRESH_SECRET> `
  --project=viverocontrol-3f83f `
  --member="serviceAccount:<SA_OAUTH_WRITER_EMAIL>" `
  --role="roles/secretmanager.secretVersionAdder"

gcloud secrets add-iam-policy-binding <OAUTH_REFRESH_SECRET> `
  --project=viverocontrol-3f83f `
  --member="serviceAccount:<SA_REPORT_RUNTIME_EMAIL>" `
  --role="roles/secretmanager.secretAccessor"
```

Permisos mínimos de proyecto:

| Identidad | Permisos propios del código |
|---|---|
| OAuth writer | `roles/datastore.user`, `roles/logging.logWriter` y `roles/secretmanager.secretVersionAdder` solo en el secreto |
| Report runtime | `roles/datastore.user`, `roles/logging.logWriter`, `roles/eventarc.eventReceiver` y `roles/secretmanager.secretAccessor` solo en el secreto |

La identidad report runtime no recibe `secretVersionAdder`; la identidad writer no recibe `secretAccessor`. La cuenta que despliega necesita `roles/iam.serviceAccountUser` sobre ambas identidades para asignarlas, pero ese rol no se concede a las identidades de ejecucion. Ninguna de ellas necesita `Editor`, `Owner`, acceso global a secretos o acceso IAM de cuenta de servicio. Confirme la identidad efectiva en cada revision Gen 2 despues del despliegue.

### 3. Variables de Functions

Partir de `backend/functions/.env.example` y guardar los valores reales únicamente en el archivo local ignorado correspondiente al proyecto:

```dotenv
APP_ENV=production
GOOGLE_DRIVE_INVENTORY_MODE=oauth-user
GOOGLE_DRIVE_OAUTH_MODE=oauth-user
GOOGLE_DRIVE_OAUTH_CLIENT_ID=<CLIENT_ID_DESKTOP>
GOOGLE_DRIVE_INVENTORY_PRIMARY_EMAIL=<CUENTA_PRINCIPAL>
GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN_SECRET=<NOMBRE_SECRETO>
GOOGLE_DRIVE_OAUTH_WRITER_SERVICE_ACCOUNT=<SA_OAUTH_WRITER_EMAIL>
GOOGLE_DRIVE_REPORT_SERVICE_ACCOUNT=<SA_REPORT_RUNTIME_EMAIL>
```

El código aborta en producción si faltan las dos identidades dedicadas, si coinciden entre sí, si el proyecto o ambiente no son exactos o si el modo no es `oauth-user`.

### 4. Despliegue enumerado pendiente

Desde `backend`, después de backup `READY`, rollback aprobado, APIs, OAuth, secreto e IAM:

```powershell
$only = @(
  "firestore:rules",
  "functions:iniciarConexionGoogleDrive",
  "functions:completarConexionGoogleDrive",
  "functions:obtenerEstadoConexionGoogleDrive",
  "functions:revocarConexionGoogleDrive",
  "functions:procesarInformeInventario",
  "functions:listarInformesInventario",
  "functions:reintentarInformeInventario"
) -join ","

firebase deploy --config firebase.json `
  --project viverocontrol-3f83f `
  --only $only
```

No usar `--force`. Detenerse si Firebase propone eliminar, cambiar región o desplegar recursos fuera de la lista. Si el código de cierre durable aún no está en producción, sus Functions y dependencias deben incluirse en un cambio separado, enumerado y revisado; este comando no las presupone.

## Conexión, prueba y revocación

1. Iniciar Maestro con una cuenta Firebase `ADMINISTRADOR`.
2. Pulsar “Conectar Google Drive” y autenticarse con la cuenta principal configurada.
3. Seleccionar primero la plantilla y después la carpeta privada de salida mediante Picker.
4. Confirmar estado `LISTO`, nombres esperados y ausencia de tokens o IDs en pantalla.
5. Ejecutar una única jornada ficticia aprobada y confirmar un archivo, enlace permitido y mismo ID tras reintento.
6. Confirmar que no cambió ningún archivo preexistente salvo el informe lógico de prueba autorizado.
7. Para revocar, usar el botón administrativo, confirmar `REVOCADO` y verificar que el procesador queda bloqueado hasta reconectar.

## Rollback

- detener primero nuevos cierres con informe;
- revocar el grant desde Maestro o desde la cuenta Google;
- revertir únicamente las revisiones de las ocho Functions y las reglas enumeradas;
- conservar documentos de informe, auditoría y archivos existentes;
- no borrar el secreto ni sus versiones durante un incidente hasta preservar evidencia;
- retirar IAM dedicado solo después de comprobar que ninguna revisión activa usa las identidades.

Esta guía prepara el cambio, pero no autoriza APIs, OAuth, IAM, Secret Manager, despliegues ni escrituras en Drive.
