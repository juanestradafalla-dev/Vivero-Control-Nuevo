# Pruebas de la ETAPA 21 — FASE A

## Principio

La única conexión a Firebase real corresponde a la auditoría manual de solo lectura, ejecutada localmente con el Project ID literal `viverocontrol-3f83f`. Las pruebas funcionales, de integración y Firestore Rules continúan usando exclusivamente `demo-vivero-control-etapa3` y Firebase Emulator Suite.

CI no ejecuta `audit:firebase:production`, no recibe credenciales reales y el propio script aborta si existe `CI`.

## Verificación local inicial

| Control | Resultado |
|---|---|
| rama base | `ops/etapa-21-auditoria-firebase-produccion` desde `c9edc0eb711e7b5f7ecf314f1bbb28ab0a31ec86` |
| árbol inicial | limpio, 0 archivos no ignorados sin seguimiento |
| privados locales | `.env.local`, `.env.viverocontrol-3f83f`, `local.properties`, configuración Android y paquetes generados permanecen ignorados |
| secretos versionados | 0 coincidencias del escaneo inicial |
| sesión Firebase | autorizada y con acceso al Project ID literal |
| Google Cloud CLI | no instalado |

No se leyó el contenido de archivos privados.

## Pruebas de la herramienta de auditoría

Comando:

```powershell
Set-Location backend/functions
npm run test:audit
```

Casos cubiertos:

1. rechazo de cualquier Project ID distinto a `viverocontrol-3f83f`;
2. salida permitida únicamente dentro de `.private/` y con extensión JSON;
3. enmascaramiento irreversible de correos y UID de prueba;
4. clasificación conservadora y desconocidos como `REQUIERE_REVISION`;
5. lista blanca de host, ruta y método para lecturas remotas;
6. rechazo de secretos, correos, App IDs, tokens y contenido documental en la salida;
7. conteo y clasificación conservadora de documentos dentro de subcolecciones Firestore mediante dobles locales;
8. reconocimiento de releases de Storage con alcance `firebase.storage/<bucket>`;
9. ausencia estática de `.set`, `.update`, `.create`, `.delete`, `recursiveDelete`, importaciones de usuarios y comandos de despliegue;
10. presencia de guardia que prohíbe Firebase real bajo `CI`.

Resultado final: 9/9 pruebas aprobadas; los diez controles enumerados se agrupan en nueve casos, porque la última prueba estática valida conjuntamente ausencia de mutaciones y guardia de CI.

## Auditoría real de solo lectura

Comandos únicos empleados:

```text
firebase projects:list --project viverocontrol-3f83f --json
firebase apps:list --project viverocontrol-3f83f --json
firebase apps:list ANDROID --project viverocontrol-3f83f --json
firebase apps:sdkconfig ANDROID <ID mantenido en memoria> --project viverocontrol-3f83f --json
firebase firestore:databases:get '(default)' --project viverocontrol-3f83f --json
firebase firestore:indexes --database '(default)' --project viverocontrol-3f83f --json
firebase firestore:backups:schedules:list --database '(default)' --project viverocontrol-3f83f --json
firebase firestore:backups:list --location nam5 --project viverocontrol-3f83f --json
firebase functions:list --project viverocontrol-3f83f --json
npm run audit:firebase:production
```

La herramienta usa `GET` y únicamente dos consultas `POST` semánticamente de lectura: enumeración de collection IDs y obtención de política IAM. Durante el diagnóstico se repitieron lecturas Firestore con el mismo Project ID para validar la máscara mínima. No se ejecutó ninguna operación remota distinta.

Resultado: reporte sanitizado creado en `.private/etapa-21/firebase-audit.json`, ignorado por Git; `REMOTE_MUTATIONS=0`. Secret Manager y Billing Budgets devolvieron `HTTP 403`, y cuotas `HTTP 404`. Al aparecer esos bloqueos no se intentaron credenciales alternativas ni activación de APIs.

## Matriz funcional obligatoria

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
./gradlew.bat assembleRelease --no-configuration-cache `
  -PproductionFirebaseProjectId=viverocontrol-3f83f `
  -PproductionFirebaseApiKey=API_KEY_FICTICIA_SOLO_CI `
  -PproductionFirebaseAppId=1:000000000000:android:app-ficticia-solo-ci
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
```

La compilación release usa valores manifiestamente ficticios, no conecta Firebase real y no genera firma.

### Maestro

```powershell
Set-Location apps/maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

No se ejecuta el empaquetado ni se inicia la aplicación con configuración real.

### Backend, reglas y Emulator Suite

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

`npm test` incluye las pruebas puras de la auditoría. `test:emulators` usa el Project ID `demo-vivero-control-etapa3` y levanta Auth, Firestore y Functions locales.

## Controles de repositorio

La verificación final debe confirmar:

- 0 archivos no ignorados sin seguimiento;
- 0 credenciales, llaves privadas o API keys reales versionadas;
- 0 APK, AAB, EXE, MSI, KeyStores o reportes privados versionados;
- `.private/`, `.env.*`, `local.properties`, configuración Android local y paquetes release ignorados;
- 0 invocaciones de escritura/borrado en la herramienta;
- 0 pasos CI que ejecuten la auditoría real;
- árbol limpio después del commit local.

## Resultados finales

| Bloque | Resultado |
|---|---|
| Herramienta de auditoría | 9/9 pruebas aprobadas; guardias de proyecto, salida, PII, transporte, subcolecciones, releases por bucket, CI y ausencia de mutaciones aprobadas |
| Contratos | validación aprobada: 94 schemas, 1 common y 5 enums; 57/57 pruebas aprobadas |
| Android assemble debug/release | ambas compilaciones aprobadas; `release` no firmado y con identificadores ficticios |
| Android unit tests/lint | 35/35 pruebas aprobadas; lint: 0 problemas |
| Maestro lint/typecheck/tests/build | todo aprobado; 5 archivos y 54/54 pruebas |
| Backend lint/typecheck/unit/build | todo aprobado; 5 archivos y 24/24 pruebas, más 9/9 de la auditoría |
| Emulator Suite + integración + reglas | 17 archivos y 179/179 pruebas de integración; 22/22 pruebas de Rules |
| npm audit Maestro | 0 vulnerabilidades de producción |
| npm audit Backend | 8 moderadas de producción; 0 altas y 0 críticas; el árbol completo reporta 12 moderadas |
| secretos, artefactos y métodos de escritura | aprobado: 0 secretos/artefactos prohibidos versionados y 0 métodos remotos de mutación en la herramienta |

## Incidencias observadas y resolución

- Una primera instalación de Maestro se solapó accidentalmente con un segundo intento y este devolvió `ENOTEMPTY`; se esperó a que terminara todo proceso Node y `npm ci` se repitió de forma aislada con éxito. No se omitió ningún control.
- Vite mantiene la advertencia conocida de un chunk minificado de 867,39 kB (250,80 kB gzip). El build aprobó y la división queda como riesgo de rendimiento, no como error oculto.
- La primera suite completa del backend aprobó 178/179 pruebas. En la carrera simultánea entre `liberarReservaLinea` y `enviarConteo`, el emulador agotó los reintentos transaccionales y el lado perdedor se convirtió en `INTERNAL_ERROR`.
- El diagnóstico encontró una asimetría: `enviarConteo` ya releía el estado final de la reserva ante un error no funcional de transacción, mientras `liberarReservaLinea` no. Se añadió la recuperación equivalente en `ReleaseReservationService`, sin estados, escrituras, contratos ni timeouts nuevos.
- Dos pruebas unitarias deterministas confirman que la recuperación devuelve `RESERVATION_NOT_ACTIVE` cuando otra operación ya consumió la reserva y conserva la excepción original si la reserva todavía está activa.
- La prueba de integración afectada aprobó después 6/6 con `testTimeout=30000`. La suite completa se repitió sin reducir archivos ni aumentar el timeout y aprobó 179/179 integración y 22/22 Rules.
- Emulator Suite advirtió que el host usa Node 24.15.0 frente a Node 22 solicitado y que existe una versión posterior de `firebase-functions`. La matriz conserva Node 22 como runtime objetivo y no actualiza dependencias fuera del alcance.
- El audit de producción del backend pasó el umbral `high`, pero conserva 8 vulnerabilidades moderadas transitivas asociadas al advisory de `uuid`; el árbol completo reporta 12 al incluir desarrollo y el advisory de OpenTelemetry. Las correcciones automáticas propuestas requieren cambios incompatibles y no se aplicaron sin una actualización controlada.
- La revisión del PR detectó que la ejecución original solo enumeraba nombres de subcolecciones y no contaba sus documentos. La herramienta ahora lista, agrega y clasifica esos documentos con rutas REST anidadas permitidas; el esquema privado sube a versión 2 para distinguir conteo de nivel superior y total. La documentación conserva 38 como conteo de nivel superior y declara el volumen anidado como no cuantificado, sin repetir la lectura de producción.
- La misma revisión detectó que un release de Storage puede usar el alcance `firebase.storage/<bucket>`. La detección ahora admite ese formato y lo cubre con una prueba local determinista. Las dos correcciones quedaron incluidas en 9/9 pruebas y en el lint oficial de la herramienta.

No se ampliarán timeouts ni se reducirán suites para obtener un resultado verde.
