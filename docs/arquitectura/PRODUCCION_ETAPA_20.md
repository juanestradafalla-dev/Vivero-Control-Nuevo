# Arquitectura de producción — ETAPA 20

## Alcance

Esta etapa transforma la configuración de código para que el mismo proyecto Firebase `viverocontrol-3f83f` pueda convertirse de forma controlada en producción durante una etapa posterior. No despliega recursos, no cambia datos, no crea cuentas y no conecta las pruebas con Firebase real.

Firestore permanece definido en `nam5` y las 30 Functions en `us-central1`. Firebase Emulator Suite continúa siendo el único destino de desarrollo y pruebas.

## Matriz definitiva

| Señal | `EMULATOR` | `PRODUCTION` |
|---|---|---|
| Project ID | prefijo `demo-*` | exacto `viverocontrol-3f83f` |
| Functions Emulator | `FUNCTIONS_EMULATOR=true` | cualquier valor distinto de `true` |
| `APP_ENV` del backend | no convierte el ambiente | exactamente `production` |
| Datos | ficticios | reales solo después de la etapa de corte |
| Pruebas automatizadas | sí | solo configuración y compilación ficticia |

No existe `STAGING` como ambiente funcional. Cualquier tercera combinación se rechaza antes de autenticación y antes de ejecutar lógica de negocio.

## Frontera central de Functions

`backend/functions/src/runtimeEnvironment.ts` concentra la clasificación. Resuelve el Project ID desde `GCLOUD_PROJECT` o `GOOGLE_CLOUD_PROJECT`, rechaza valores contradictorios y devuelve únicamente `EMULATOR` o `PRODUCTION`. Un emulador con `APP_ENV=production` sigue siendo emulador; un emulador apuntando al proyecto real se rechaza.

Las 30 exportaciones `onCall` invocan `assertRuntimeEnvironment()` como primera instrucción del bloque protegido. Después conservan sin cambios:

1. autenticación por `request.auth.uid`;
2. validación y normalización del payload;
3. perfil central activo y rol;
4. autorización de jornada o recurso;
5. versión observada y estado actual;
6. idempotencia y detección de payload conflictivo;
7. transacciones y controles de concurrencia;
8. auditoría y trazabilidad inmutable.

`CALLABLE_NAMES` enumera las 30 operaciones y una prueba estática comprueba que todas aplican la frontera antes de autenticar. Las pruebas de integración existentes continúan comprobando roles, autorización, transacciones, carreras e idempotencia mediante Emulator Suite.

El error `ENVIRONMENT_NOT_ALLOWED` sustituye al error que describía incorrectamente un backend exclusivo del emulador. El contrato JSON Schema se actualizó junto con el tipo TypeScript.

Las nuevas cargas administrativas usan orígenes neutrales (`CARGA_INICIAL_ADMINISTRATIVA` y `MIGRACION_CONTROLADA`) y referencias trazables, sin exigir marcadores de datos ficticios. Los valores históricos terminados en `_EMULADOR` permanecen únicamente en los esquemas y en la reversión para poder leer y deshacer registros creados durante etapas anteriores; ninguna operación nueva los escribe.

## Vivero Campo

`debug` representa `EMULATOR` y agrega `.emulator` al applicationId. `release` representa `PRODUCTION` y conserva `com.arles.viverocampo`.

`FirebaseRuntimeConfig` exige de manera conjunta ambiente, Project ID, applicationId Android, API key, App ID Firebase, ausencia o presencia del host del emulador y namespace local. Una configuración incompleta produce `DisabledCampoRepository`; no se inicializa Firebase.

`LocalRuntimeNames` deriva nombres distintos para:

- Room: `vivero-campo-emulator.db` / `vivero-campo-production.db`;
- preferencias: `technical_emulator` / `technical_production`;
- FirebaseApp: `vivero-control-emulator` / `vivero-control-production`;
- etiquetas y trabajos únicos de WorkManager;
- alias no exportables de Android Keystore.

Ambos ambientes usan el mismo flujo funcional. Los permisos provienen del backend, no de una bandera local de solo lectura. La firma de `release` es opcional y solo se configura cuando están presentes las cuatro propiedades locales o variables de entorno; una configuración parcial hace fallar Gradle.

## Vivero Maestro

`loadFirebaseConfig` acepta solo `emulator` o `production`. Production exige `VITE_USE_FIREBASE_EMULATORS=false`, Project ID exacto y los tres valores Web proporcionados localmente. Functions se inicializa siempre en `us-central1`.

La UI no oculta operaciones por ambiente. Continúa ocultándolas por capacidades derivadas del perfil:

- `canReview`, `canRelease` y autorización de jornada;
- `canManageDraftJourneys`;
- `canManageUsers`;
- `canManageCatalog`;
- rol `ADMINISTRADOR` para migración e inventario inicial.

Usuarios, catálogo, jornadas, cierre, revisión, devolución, reasignación, liberación, importación y reversión reutilizan sus Callables y confirmaciones existentes.

La CSP permite solo Vite y los tres emuladores locales, Auth y Firestore oficiales, y el endpoint exacto de Functions de `viverocontrol-3f83f`. Electron Builder queda preparado con la identidad final, sin ejecutar NSIS ni firmar binarios.

## Firestore Rules

No se modificó la política de acceso para abrir producción. Continúan vigentes:

- lecturas condicionadas por perfil activo, rol y autorización de jornada;
- escrituras críticas exclusivas de Admin SDK dentro de Functions;
- colecciones administrativas, auditoría, idempotencia y bloqueos sin acceso directo de clientes;
- denegación final por defecto.

Toda validación de Rules sigue ejecutándose con `@firebase/rules-unit-testing` contra Firestore Emulator.

## Configuración que no se versiona

En la siguiente etapa, Functions requerirá localmente `.env.viverocontrol-3f83f` con:

```dotenv
APP_ENV=production
```

Maestro requerirá `.env.local`; Campo requerirá propiedades Firebase locales y, solo al firmar, la configuración completa de Keystore. `.gitignore` y CI rechazan archivos de credenciales, llaves y artefactos generados.

## Estado al cerrar la etapa

El código queda preparado y comprobado, pero Firebase no se ha desplegado, sus datos no se han limpiado, no existen cuentas reales aprobadas, no se cargó inventario real y no existen APK ni instalador definitivos.
