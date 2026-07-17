# Vivero Control Nuevo

Sistema de inventario por línea compuesto por Vivero Campo (Android), Vivero Maestro (Electron/React para Windows) y un backend transaccional en Firebase. Este repositorio es independiente y no reutiliza código del proyecto anterior `Vivero-Control`.

## Estado: ETAPA 21 — FASE A

El código quedó preparado en la ETAPA 20 para dos ambientes y un único proyecto Firebase real. La FASE A de la ETAPA 21 auditó ese proyecto de forma exclusivamente de lectura y diseñó respaldo, limpieza, corte y rollback. **No se ha limpiado ni desplegado y no se afirma que el sistema esté listo para producción.**

| Ambiente | Proyecto | Uso | Datos |
|---|---|---|---|
| `EMULATOR` | `demo-*` | Desarrollo y pruebas con Firebase Emulator Suite | Exclusivamente ficticios |
| `PRODUCTION` | `viverocontrol-3f83f` | Operación futura de cuentas autorizadas | Reales solo después del corte controlado |

No existe `STAGING` como ambiente funcional. Firestore permanecerá en `nam5` y Functions en `us-central1`.

La auditoría remota confirmó Firestore en `nam5`, 11 de 30 Functions activas en `us-central1`, reglas e índices iguales a los versionados, Email/Password habilitado, 3 cuentas ambiguas y 38 documentos ambiguos de nivel superior. También detectó la subcolección `autorizaciones`, pero esa ejecución no cuantificó sus documentos; todos los recursos anidados permanecen igualmente `REQUIERE_REVISION`. No hay backup programado, backup listado o PITR; faltan los registros productivos de Android y Maestro. Los recursos ambiguos permanecen protegidos y FASE B está bloqueada.

La ETAPA 21 FASE A agrega auditoría, herramienta de lectura y documentación. La matriz local también detectó y corrigió una asimetría defensiva al resolver la carrera entre liberar y enviar una reserva: ahora ambos lados recuperan el estado final y usan los errores de dominio existentes, sin introducir estados, escrituras o alcance funcional. Todavía no se han limpiado datos, creado cuentas reales, cargado inventario real, desplegado Firebase, firmado un APK ni generado el instalador definitivo de Windows.

## Frontera del backend

Cada Callable ejecuta la misma frontera antes de autenticar o procesar la solicitud:

- `EMULATOR`: `FUNCTIONS_EMULATOR=true` y Project ID `demo-*`.
- `PRODUCTION`: `FUNCTIONS_EMULATOR` distinto de `true`, Project ID exacto `viverocontrol-3f83f` y `APP_ENV=production`.
- cualquier otra combinación se rechaza con `ENVIRONMENT_NOT_ALLOWED`.

Las 30 Callables conservan autenticación, perfil activo, roles, autorización de jornada, validación, versión observada, idempotencia, concurrencia, transacciones y auditoría:

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
devolverConteo
```

Importación, reversión, inventario inicial, catálogo y usuarios continúan restringidos a administradores donde corresponde y conservan confirmaciones adicionales. Los clientes no escriben directamente inventario, movimientos, decisiones, auditoría, idempotencia ni estados críticos.

## Aplicaciones

### Vivero Campo

- `debug` instala `com.arles.viverocampo.emulator`, usa `demo-*` y llama `useEmulator`.
- `release` conserva `com.arles.viverocampo`, exige `viverocontrol-3f83f` y nunca configura emuladores.
- Room, preferencias, FirebaseApp, WorkManager y el alias de Android Keystore usan namespaces `emulator` o `production` distintos.
- autenticación, selección de jornada, reserva, conteo offline, sincronización, corrección e historial local están disponibles en ambos ambientes según permisos.
- la firma real solo puede proporcionarse mediante propiedades locales o variables de entorno; no se versiona ninguna llave.

### Vivero Maestro

- `VITE_APP_ENV=emulator` exige emuladores y un proyecto `demo-*`.
- `VITE_APP_ENV=production` exige `VITE_USE_FIREBASE_EMULATORS=false` y `viverocontrol-3f83f`.
- API key, App ID y Auth Domain se proporcionan en `.env.local`, ignorado por Git.
- la interfaz muestra conteos, revisiones, correcciones, jornadas, usuarios, catálogo, inventario inicial y migración según el rol central.
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

## Configuración local posterior

Cuando se prepare el despliegue controlado, el archivo local de Functions `.env.viverocontrol-3f83f` deberá contener:

```dotenv
APP_ENV=production
```

Ese archivo no se crea ni se versiona en esta etapa. Consulte los README de [Vivero Campo](apps/campo-android/README.md) y [Vivero Maestro](apps/maestro-desktop/README.md) para las variables locales de cada cliente.

## Documentación vigente

- [Auditoría Firebase sanitizada de la ETAPA 21](docs/arquitectura/AUDITORIA_FIREBASE_ETAPA_21.md)
- [Plan de respaldo, limpieza, corte y rollback](docs/arquitectura/PLAN_CORTE_Y_ROLLBACK_ETAPA_21.md)
- [Pruebas de la ETAPA 21](docs/pruebas/PRUEBAS_ETAPA_21.md)
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

No se despliega Firebase, no se eliminan datos o usuarios, no se crean cuentas reales, no se cargan datos reales, no se crean paquetes reales de migración, no se generan llaves de firma, APK firmados ni instaladores definitivos, y no se modifica o fusiona directamente `main`. Tampoco se inicia FASE B mientras no exista backup restaurable y aprobación explícita del propietario.
