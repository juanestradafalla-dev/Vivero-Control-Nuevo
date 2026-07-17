# Vivero Control Nuevo

Sistema de inventario por línea compuesto por Vivero Campo (Android), Vivero Maestro (Electron/React para Windows) y un backend transaccional en Firebase. Este repositorio es independiente y no reutiliza código del proyecto anterior `Vivero-Control`.

## Estado: ETAPA 23 — descartes transaccionales y captura sin señal

La ETAPA 22 dejó preparados localmente los datos reales sin importarlos. La ETAPA 23 incorpora el flujo A de descartes: Campo registra incluso sin señal, Maestro revisa y solo una aprobación central descuenta el inventario. Las causas pueden superponerse, pero el total único se calcula por hembras, machos y patrones. **No se ejecutó validación remota contra producción, importación, creación de cuentas, despliegue ni puesta en producción.**

| Ambiente | Proyecto | Uso | Datos |
|---|---|---|---|
| `EMULATOR` | `demo-*` | Desarrollo y pruebas con Firebase Emulator Suite | Exclusivamente ficticios |
| `PRODUCTION` | `viverocontrol-3f83f` | Operación futura de cuentas autorizadas | Reales solo después del corte controlado |

No existe `STAGING` como ambiente funcional. Firestore permanecerá en `nam5` y Functions en `us-central1`.

El inventario previo confirmó 3 aplicaciones, 3 cuentas con perfil y referencias operativas, 41 documentos Firestore en 12 grupos —38 superiores y 3 anidados—, 5 principales IAM, 11 de 30 Functions y 2 buckets técnicos. El propietario clasificó y eliminó exclusivamente las 3 cuentas y los 41 documentos como datos de prueba. Las aplicaciones, IAM, Functions y buckets no formaron parte de la limpieza y conservan sus decisiones anteriores.

La clasificación identificable, los datos reales, sus fuentes, responsables, cantidades y el paquete generado viven solo en `.private/`. El repositorio conserva únicamente reglas, validadores, fixtures ficticios y evidencia sanitizada del estado de los bloques. Un inventario inicial total cero solo es compatible con la migración cuando se confirma explícitamente que la línea está vacía; el cero no confirmado sigue bloqueado. La renuncia al backup se limitó a los datos de prueba eliminados; backups, PITR y restauración continúan pendientes antes de operar información real.

## Frontera del backend

Cada Callable ejecuta la misma frontera antes de autenticar o procesar la solicitud:

- `EMULATOR`: `FUNCTIONS_EMULATOR=true` y Project ID `demo-*`.
- `PRODUCTION`: `FUNCTIONS_EMULATOR` distinto de `true`, Project ID exacto `viverocontrol-3f83f` y `APP_ENV=production`.
- cualquier otra combinación se rechaza con `ENVIRONMENT_NOT_ALLOWED`.

Las 34 Callables conservan autenticación, perfil activo, roles, autorización, validación, versión observada, idempotencia, concurrencia, transacciones y auditoría:

```text
importarPaqueteMigracion             listarImportacionesMigracion
revertirImportacionMigracion         validarPaqueteMigracion
registrarInventarioInicial           listarCatalogoAdministrable
crearUbicacion                       actualizarUbicacion
crearLinea                           actualizarLinea
listarUsuariosAdministrables        actualizarEstadoUsuario
actualizarRolUsuario                 cancelarJornadaBorrador
reabrirJornadaCancelada              cerrarJornada
activarJornada                       listarParticipantesJornadaBorrador
actualizarParticipantesJornadaBorrador
crearJornadaBorrador                 actualizarLineasJornadaBorrador
listarJornadasAdministrables         listarJornadasActivas
reservarLinea                        enviarConteo
iniciarCorreccionConteo              reasignarCorreccionConteo
liberarReservaLinea                  aprobarConteo
devolverConteo                       listarLineasDescarte
registrarDescarte                    aprobarDescarte
devolverDescarte
```

Importación, reversión, inventario inicial, catálogo y usuarios continúan restringidos a administradores donde corresponde y conservan confirmaciones adicionales. Los clientes no escriben directamente inventario, movimientos, decisiones, auditoría, idempotencia ni estados críticos.

## Aplicaciones

### Vivero Campo

- `debug` instala `com.arles.viverocampo.emulator`, usa `demo-*` y llama `useEmulator`.
- `release` conserva `com.arles.viverocampo`, exige `viverocontrol-3f83f` y nunca configura emuladores.
- Room, preferencias, FirebaseApp, WorkManager y el alias de Android Keystore usan namespaces `emulator` o `production` distintos.
- autenticación, restauración de sesión, selección de jornada, reserva, conteo y descarte offline, sincronización, corrección e historial local están disponibles según permisos.
- la firma real solo puede proporcionarse mediante propiedades locales o variables de entorno; no se versiona ninguna llave.

### Vivero Maestro

- `VITE_APP_ENV=emulator` exige emuladores y un proyecto `demo-*`.
- `VITE_APP_ENV=production` exige `VITE_USE_FIREBASE_EMULATORS=false` y `viverocontrol-3f83f`.
- API key, App ID y Auth Domain se proporcionan en `.env.local`, ignorado por Git.
- la interfaz muestra conteos, descartes pendientes, revisiones, correcciones, jornadas, usuarios, catálogo, inventario inicial y migración según el rol central.
- Electron Builder queda preparado como `com.arles.viveromaestro`, `Vivero Maestro` y `Vivero-Maestro-Setup-${version}.${ext}`; esta etapa no genera el instalador.

## Seguridad

- Firestore Rules conserva denegación final por defecto.
- las escrituras críticas solo se realizan mediante Functions.
- colecciones administrativas, auditoría e idempotencia permanecen inaccesibles directamente desde clientes.
- no se usa `allow read, write: if true`, puertas traseras ni credenciales versionadas.
- las pruebas de backend y reglas solo usan Emulator Suite.
- CI no contiene despliegues, firmas, cuentas ni identificadores Web reales.

## Verificación local

Requisitos: Node.js 22, JDK 21, Android SDK 36.1 y npm.

```powershell
# Contratos
Set-Location contracts
npm ci
npm run validate
npm test

# Android
Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat assembleRelease --no-configuration-cache `
  -PproductionFirebaseProjectId=viverocontrol-3f83f `
  -PproductionFirebaseApiKey=API_KEY_FICTICIA_SOLO_COMPILACION `
  -PproductionFirebaseAppId=1:000000000000:android:app-ficticia
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

# Backend, reglas y concurrencia
Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

Ninguno de estos comandos despliega Firebase. La compilación `release` usa identificadores manifiestamente ficticios, no inicia la aplicación y produce únicamente un artefacto local no firmado e ignorado por Git.

La preparación privada se opera desde `backend/functions`:

```powershell
# Crea plantillas sin sobrescribir archivos existentes
npm run prepare:etapa21:init

# Valida exclusivamente el JSON privado
npm run validate:etapa21:private

# Solo cuando estructura e inventario estén completos y no haya errores
npm run package:etapa21:private
```

`prepare:etapa21:classify` es una auditoría manual de solo lectura contra el Project ID literal; aborta en CI y escribe únicamente bajo `.private/`. No es parte de la matriz cotidiana ni debe programarse automáticamente.

## Configuración local posterior

Cuando se prepare el despliegue controlado, el archivo local de Functions `.env.viverocontrol-3f83f` deberá contener:

```dotenv
APP_ENV=production
```

Ese archivo no se crea ni se versiona en esta etapa. Consulte los README de [Vivero Campo](apps/campo-android/README.md) y [Vivero Maestro](apps/maestro-desktop/README.md) para las variables locales de cada cliente.

## Documentación vigente

- [Criterios de aceptación de la ETAPA 23](docs/ETAPA_23_CRITERIOS_DE_ACEPTACION.md)
- [Arquitectura de descartes transaccionales](docs/arquitectura/DESCARTES_TRANSACCIONALES_ETAPA_23.md)
- [Pruebas de la ETAPA 23](docs/pruebas/PRUEBAS_ETAPA_23.md)
- [Criterios de aceptación de la ETAPA 22](docs/ETAPA_22_CRITERIOS_DE_ACEPTACION.md)
- [Preparación privada de datos reales de la ETAPA 22](docs/arquitectura/PREPARACION_DATOS_REALES_ETAPA_22.md)
- [Pruebas de la ETAPA 22](docs/pruebas/PRUEBAS_ETAPA_22.md)
- [Cierre de la limpieza manual de datos de prueba](docs/ETAPA_21_FASE_B1_LIMPIEZA_MANUAL.md)
- [Auditoría Firebase sanitizada de la ETAPA 21](docs/arquitectura/AUDITORIA_FIREBASE_ETAPA_21.md)
- [Clasificación sanitizada de recursos](docs/arquitectura/CLASIFICACION_RECURSOS_ETAPA_21.md)
- [Preparación local de datos reales](docs/arquitectura/PREPARACION_DATOS_REALES_ETAPA_21.md)
- [Plan de respaldo, limpieza, corte y rollback](docs/arquitectura/PLAN_CORTE_Y_ROLLBACK_ETAPA_21.md)
- [Pruebas de la ETAPA 21](docs/pruebas/PRUEBAS_ETAPA_21.md)
- [Pruebas de preparación de la ETAPA 21](docs/pruebas/PRUEBAS_PREPARACION_ETAPA_21.md)
- [Criterios de aceptación de la ETAPA 21](docs/ETAPA_21_CRITERIOS_DE_ACEPTACION.md)
- [Información real requerida al propietario](docs/INFORMACION_REAL_REQUERIDA_ETAPA_21.md)
- [Arquitectura de producción de la ETAPA 20](docs/arquitectura/PRODUCCION_ETAPA_20.md)
- [Matriz de pruebas de la ETAPA 20](docs/pruebas/PRUEBAS_ETAPA_20.md)
- [Criterios de aceptación](docs/ETAPA_20_CRITERIOS_DE_ACEPTACION.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)
- [Seguridad](docs/arquitectura/SEGURIDAD.md)
- [Importación y reversión de la ETAPA 19](docs/arquitectura/IMPORTACION_CONTROLADA_ETAPA_19.md)

## Fuera de alcance

No se despliega Firebase, no se crean cuentas o Apps reales, no se cargan datos, no se generan llaves de firma, APK firmados ni instaladores definitivos, y no se modifica o fusiona directamente `main`. El paquete privado generado es preparación local y no autoriza importación. La validación remota, el respaldo restaurable, la ventana de corte, los secretos productivos y la autorización expresa de despliegue continúan pendientes.
