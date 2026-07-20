# ETAPA 26 — Configuración segura de Google Drive

## Recursos autorizados

- Plantilla: `INVENTARIO JUNIO 2026.xlsx`.
- Archivo de plantilla: `1zz1_ESUkKX_B7jD5oEkz08g_uCiq8YpU`.
- Carpeta de destino: carpeta de inventarios indicada por el propietario.
- Carpeta: `1ZCmvbZTW3SP8Llc-yUZX49_ACLgR_qhM`.

Los IDs son configuración del backend. Android, Electron y las solicitudes Callable no pueden escogerlos.

## Variables

```dotenv
APP_ENV=production
GOOGLE_DRIVE_INVENTORY_MODE=google
GOOGLE_DRIVE_INVENTORY_FOLDER_ID=1ZCmvbZTW3SP8Llc-yUZX49_ACLgR_qhM
GOOGLE_DRIVE_INVENTORY_TEMPLATE_FILE_ID=1zz1_ESUkKX_B7jD5oEkz08g_uCiq8YpU
```

En Emulator Suite y CI el modo efectivo debe ser `fake` y no se permiten llamadas externas. Estos valores no deben agregarse a variables `VITE_*`, Android, contratos ni payloads.

## Identidad de ejecución

El adaptador usa Application Default Credentials de Cloud Functions Gen 2. La revisión de solo lectura de las Functions actuales y la ausencia de un override de servicio confirman como identidad prevista:

```text
107772600673-compute@developer.gserviceaccount.com
```

Permisos mínimos para esa identidad:

- carpeta `1ZCmvbZTW3SP8Llc-yUZX49_ACLgR_qhM`: editor;
- plantilla `1zz1_ESUkKX_B7jD5oEkz08g_uCiq8YpU`: lector;
- proyecto Firestore: `roles/datastore.user`;
- sin llaves JSON, sin acceso global a Drive y sin permisos de propietario.

El trigger `procesarInformeInventario` todavía no está desplegado. Después de su primer despliegue se debe confirmar la identidad efectiva de esa revisión antes de cualquier prueba de humo:

```powershell
gcloud functions describe procesarInformeInventario `
  --gen2 `
  --region=us-central1 `
  --project=viverocontrol-3f83f `
  --format="value(serviceConfig.serviceAccountEmail)"
```

Si la revisión desplegada devuelve otra identidad, no se escribe en Drive: primero se comparten los recursos con el principal real o se configura explícitamente una cuenta dedicada de mínimo privilegio. No cree ni descargue una llave JSON.

## Habilitación manual pendiente

1. Confirmar backup, rollback y autorización de cambio del proyecto.
2. Habilitar `drive.googleapis.com` en `viverocontrol-3f83f` mediante el procedimiento administrativo aprobado:

   ```powershell
   gcloud services enable drive.googleapis.com --project=viverocontrol-3f83f
   ```

3. Compartir plantilla y carpeta con la identidad de ejecución verificada.
4. Configurar las tres variables solo en el entorno de Functions.
5. Desplegar reglas y Functions únicamente mediante un cambio autorizado y enumerado; esta etapa no modifica índices.
6. Ejecutar una prueba de humo con una jornada y datos de prueba aprobados; nunca desde CI.
7. Confirmar que el archivo queda en la carpeta esperada y que un reintento conserva su ID.

## Despliegue enumerado pendiente

Después de aprobar la etapa, configurar Drive, confirmar backup y preparar rollback, ejecutar desde `backend` únicamente:

```powershell
$only = @(
  "firestore:rules",
  "functions:activarJornada",
  "functions:cerrarJornada",
  "functions:reintentarCierreJornada",
  "functions:procesarCierreJornada",
  "functions:listarInformesInventario",
  "functions:reintentarInformeInventario",
  "functions:procesarInformeInventario",
  "functions:listarCatalogoAdministrable",
  "functions:crearUbicacion",
  "functions:actualizarUbicacion",
  "functions:crearLinea",
  "functions:actualizarLinea",
  "functions:crearJornadaBorrador",
  "functions:actualizarLineasJornadaBorrador",
  "functions:listarJornadasAdministrables",
  "functions:listarJornadasActivas",
  "functions:enviarConteo",
  "functions:listarLineasDescarte",
  "functions:registrarDescarte",
  "functions:aprobarDescarte",
  "functions:devolverDescarte"
) -join ","

firebase deploy --config firebase.json `
  --project viverocontrol-3f83f `
  --only $only
```

No hay cambios de índices en la ETAPA 26. No agregar `firestore:indexes`, no usar `--force` y detenerse si Firebase propone eliminar o reemplazar recursos fuera de esta lista.

## Idempotencia de archivo

Cada archivo usa `appProperties` con la jornada y el periodo. El adaptador busca dentro de la carpeta antes de crear. Si existe una coincidencia, usa `files.update`; si no existe, usa `files.create`. Una multiplicidad inesperada bloquea el proceso para no ocultar duplicados.

No se generan PDF, copias numeradas, tokens OAuth de usuario ni credenciales en clientes.
