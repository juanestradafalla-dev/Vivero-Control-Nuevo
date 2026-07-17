# ETAPA 21 — FASE A: auditoría sanitizada de Firebase

## Estado y alcance

Auditoría ejecutada el 17 de julio de 2026 sobre el único Project ID autorizado: `viverocontrol-3f83f`. La rama parte de `main` en `c9edc0eb711e7b5f7ecf314f1bbb28ab0a31ec86`.

Esta fase fue exclusivamente de lectura. No se desplegaron reglas, índices, Functions o clientes; no se escribieron documentos; no se crearon, modificaron o eliminaron usuarios, objetos, secretos, permisos, servicios, presupuestos o backups. La salida detallada se guardó solo en `.private/etapa-21/`, ruta ignorada por Git. Este documento conserva únicamente cantidades, nombres técnicos no privados, clasificaciones y bloqueos.

## Frontera de seguridad aplicada

- sesión local de Firebase disponible y acceso al Project ID literal comprobado;
- cada comando Firebase remoto incluyó `--project viverocontrol-3f83f`;
- la herramienta auxiliar fija el mismo Project ID en código, lo envía como recurso o cabecera explícita y aborta ante cualquier otro;
- la herramienta no puede ejecutarse con `CI` y su transporte solo admite una lista cerrada de lecturas;
- no contiene llamadas `.set`, `.update`, `.create`, `.delete` o `recursiveDelete`;
- los dos `POST` admitidos son consultas semánticas: `listCollectionIds` y `getIamPolicy`;
- los documentos Firestore se enumeraron con una máscara de campo deliberadamente inexistente: solo se conservaron nombres en memoria para contar y después se descartaron;
- correos, UID, App IDs, API keys, tokens, principales IAM y rutas de objetos no se publicaron;
- no se leyó el contenido de archivos locales privados.

Versiones registradas: Node `24.15.0`, npm `11.12.1`, Java `21.0.10`, Firebase CLI global `15.18.0` y Firebase Tools del backend `15.23.0`. Google Cloud CLI no está instalado.

## Lecturas remotas ejecutadas

Se usaron las siguientes operaciones, siempre con salida capturada y sanitizada:

```text
firebase projects:list --project viverocontrol-3f83f --json
firebase apps:list --project viverocontrol-3f83f --json
firebase apps:list ANDROID --project viverocontrol-3f83f --json
firebase apps:sdkconfig ANDROID <App ID mantenido solo en memoria> --project viverocontrol-3f83f --json
firebase firestore:databases:get '(default)' --project viverocontrol-3f83f --json
firebase firestore:indexes --database '(default)' --project viverocontrol-3f83f --json
firebase firestore:backups:schedules:list --database '(default)' --project viverocontrol-3f83f --json
firebase firestore:backups:list --location nam5 --project viverocontrol-3f83f --json
firebase functions:list --project viverocontrol-3f83f --json
npm run audit:firebase:production
```

La última operación usa solo APIs de lectura para proyecto, servicios, Auth, Firestore, reglas, Storage, IAM, facturación y observabilidad. Los intentos no consultables se conservaron como códigos HTTP, nunca como respuestas crudas.

## Inventario por servicio

### Proyecto y capacidad

| Dato | Resultado sanitizado | Clasificación |
|---|---|---|
| Project ID | `viverocontrol-3f83f` | `CONSERVAR` |
| Número de proyecto | comprobado; no publicado | `CONSERVAR` |
| Nombre visible / estado | `ViveroControl` / `ACTIVE` | `CONSERVAR` |
| Firestore | base `(default)`, modo nativo, concurrencia pesimista | `CONSERVAR` |
| Ubicación Firestore | `nam5` | `CONSERVAR` |
| Functions observadas | `us-central1` | `CONSERVAR` |
| Facturación | cuenta vinculada y facturación habilitada | `CONSERVAR` |
| Logging / Monitoring | APIs habilitadas | `CONSERVAR` |
| PITR | deshabilitado | `REQUIERE_REVISION` |
| Protección de borrado de Firestore | deshabilitada | `REQUIERE_REVISION` |

La vinculación de facturación cubre la capacidad básica necesaria para los recursos Gen 2 ya presentes. La consulta disponible no expuso el nombre comercial exacto del plan Firebase y no se infiere uno.

APIs relevantes habilitadas: Artifact Registry, Cloud Billing, Cloud Build, Cloud Functions, Eventarc, Firebase, Firebase Rules, Firestore, Identity Toolkit, Logging, Monitoring, Cloud Run y Storage. Secret Manager y Billing Budgets aparecen deshabilitadas; no se activaron.

### Aplicaciones registradas

| Plataforma | Registro sanitizado | Estado | Clasificación |
|---|---|---|---|
| Android | `Vivero Control`, package `com.arles.viverocontrol` | activo, identidad heredada distinta al contrato vigente | `INCONSISTENTE` |
| Android | `Vivero Campo Staging`, package `com.arles.viverocampo.staging` | activo y explícitamente staging | `FICTICIO_CONFIRMADO` |
| Android | package requerido `com.arles.viverocampo` | no existe registro | `NO_DESPLEGADO` |
| Web | `Vivero Maestro Staging` | activo y explícitamente staging | `FICTICIO_CONFIRMADO` |
| Web | registro productivo de Maestro | no existe | `NO_DESPLEGADO` |

`FICTICIO_CONFIRMADO` significa que el propósito de prueba es inequívoco; no significa que exista autorización de borrado. El registro Android heredado no se clasifica como eliminable: primero debe identificarse su consumidor y propietario.

### Authentication

| Dato | Resultado | Clasificación |
|---|---:|---|
| Usuarios totales | 3 | — |
| Cuentas con dominio inequívoco de prueba | 0 | `FICTICIO_CONFIRMADO`: ninguna |
| Cuentas sin evidencia suficiente | 3 | `REQUIERE_REVISION` |
| Proveedor habilitado | Email/Password | `CONSERVAR` |
| Contraseña requerida | sí | `CONSERVAR` |

No se publicaron correos, UID, fechas, hashes ni metadatos de cuenta. Ninguna cuenta puede incluirse todavía en un manifiesto de limpieza.

### Firestore

Se encontraron 11 colecciones y 38 documentos de nivel superior. Ningún ID cumplió los marcadores `JORNADA-PRUEBA-*` o `LINEA-PRUEBA-*`; como no se leyeron campos de negocio, los 38 documentos quedan protegidos como `REQUIERE_REVISION`. La ejecución original detectó además la subcolección `autorizaciones`, pero no cuantificó sus documentos: el total real es al menos 38 y cualquier documento anidado queda igualmente `REQUIERE_REVISION`.

| Colección | Documentos de nivel superior | Estructura | Datos |
|---|---:|---|---|
| `auditoria` | 9 | `CONSERVAR` | 9 `REQUIERE_REVISION` |
| `bloqueosCodigosCatalogo` | 5 | `CONSERVAR` | 5 `REQUIERE_REVISION` |
| `idempotencia` | 9 | `CONSERVAR` | 9 `REQUIERE_REVISION` |
| `jornadaLineas` | 2 | `CONSERVAR` | 2 `REQUIERE_REVISION` |
| `jornadas` | 1 | `CONSERVAR` | 1 `REQUIERE_REVISION` |
| `lineas` | 2 | `CONSERVAR` | 2 `REQUIERE_REVISION` |
| `ocupacionesLineasActivas` | 2 | `CONSERVAR` | 2 `REQUIERE_REVISION` |
| `seleccionesLineasJornada` | 1 | `CONSERVAR` | 1 `REQUIERE_REVISION` |
| `seleccionesParticipantesJornada` | 1 | `CONSERVAR` | 1 `REQUIERE_REVISION` |
| `ubicaciones` | 3 | `CONSERVAR` | 3 `REQUIERE_REVISION` |
| `usuarios` | 3 | `CONSERVAR` | 3 `REQUIERE_REVISION` |

La única subcolección observada fue `autorizaciones` bajo el documento de `jornadas`. El muestreo de documentos padre cubrió los 38 registros de nivel superior porque ninguna colección superó el límite de 50. La ejecución original solo identificaba el nombre de la subcolección y no listaba sus documentos, por lo que su volumen no quedó establecido. La herramienta quedó corregida para contar y clasificar esos documentos en futuras ejecuciones de lectura; no se repitió el acceso a producción durante el cierre del PR.

Colecciones requeridas por el contrato pero ausentes:

- `reservas`, `conteos`, `decisionesRevision`, `reasignacionesCorreccion` y `liberacionesReserva`;
- `inventarioOficialLineas`, `cargasInventarioInicial` y `movimientosInventario`;
- `importacionesMigracion` y `bloqueosHashesMigracion`.

Se clasifican como `NO_DESPLEGADO`; una colección Firestore puede materializarse solo cuando exista su primer documento, por lo que la ausencia no prueba por sí sola un defecto.

No hay índices compuestos remotos. Existe un override para `autorizaciones.usuarioId` con los mismos tres modos versionados en `backend/firestore.indexes.json`; índices locales y remotos coinciden. La regla Firestore activa coincide, tras normalizar finales de línea, con `backend/firestore.rules`.

El volumen comprobable de nivel superior es 38 documentos. El total que incluye subcolecciones no quedó cuantificado en la ejecución original. No se obtuvo una métrica remota fiable de bytes de Firestore y no se estimó a partir de documentos completos.

### Cloud Functions

Hay 11 Functions Gen 2 activas, todas en `us-central1` y runtime `nodejs22`:

```text
activarJornada
actualizarLineasJornadaBorrador
actualizarParticipantesJornadaBorrador
crearJornadaBorrador
crearLinea
crearUbicacion
listarCatalogoAdministrable
listarJornadasActivas
listarJornadasAdministrables
listarParticipantesJornadaBorrador
listarUsuariosAdministrables
```

La CLI proporcionó huellas de código, usadas solo para correlación local, pero no fecha de actualización. Las 11 incluyen una variable llamada `APP_ENV`; su valor no se leyó por la regla expresa de enumerar solo nombres.

Frente a las 30 Callables versionadas, faltan 19:

```text
actualizarEstadoUsuario
actualizarLinea
actualizarRolUsuario
actualizarUbicacion
aprobarConteo
cancelarJornadaBorrador
cerrarJornada
devolverConteo
enviarConteo
importarPaqueteMigracion
iniciarCorreccionConteo
liberarReservaLinea
listarImportacionesMigracion
reabrirJornadaCancelada
reasignarCorreccionConteo
registrarInventarioInicial
reservarLinea
revertirImportacionMigracion
validarPaqueteMigracion
```

Resultado: 11 `CONSERVAR`, 19 `NO_DESPLEGADO`, ninguna Function remota extra. El valor exacto `APP_ENV=production` queda `REQUIERE_REVISION` hasta una verificación autorizada que respete la política de valores.

### Cloud Storage

Se observaron dos buckets técnicos de artefactos Gen 2 en `us-central1`, con 13 objetos y aproximadamente 5,62 MiB combinados. No se abrieron ni descargaron objetos; sus rutas de primer nivel se correlacionaron solo mediante hashes en la salida privada.

Ambos buckets y sus objetos se clasifican `CONSERVAR` porque respaldan Functions desplegadas. No se observó un bucket de datos de negocio en la lista disponible. No existe una release de Firebase Storage Rules y tampoco hay un archivo `storage.rules` versionado: el punto queda `REQUIERE_REVISION`, no como objetivo de limpieza.

### Seguridad y operación

- IAM contiene 5 principales con roles administrativos `owner`, `editor` o `firebaseauth.admin`; solo se guardaron hashes privados. Todos quedan `REQUIERE_REVISION` para mínimo privilegio, sin sugerir su eliminación.
- Secret Manager devolvió `HTTP 403` y su API figura deshabilitada. No se pudieron enumerar nombres y no se activó el servicio.
- La facturación está vinculada, pero Billing Budgets devolvió `HTTP 403` y su API figura deshabilitada. No puede afirmarse que exista un presupuesto o alerta.
- La ruta de cuotas disponible devolvió `HTTP 404`; Google Cloud CLI no está instalado. Cuotas y bloqueos quedan `REQUIERE_REVISION`.
- Logging y Monitoring están habilitados; no se consultaron ni imprimieron logs.

## Matriz de clasificación

| Categoría | Recursos agregados |
|---|---|
| `CONSERVAR` | proyecto, Firestore `nam5`, reglas e índices coincidentes, 11 estructuras de colección, Email/Password, 11 Functions activas, 2 buckets técnicos y servicios operativos existentes |
| `FICTICIO_CONFIRMADO` | registro Android `Vivero Campo Staging` y registro Web `Vivero Maestro Staging`; no hay usuarios o documentos confirmados como ficticios |
| `REQUIERE_REVISION` | 3 cuentas, 38 documentos de nivel superior, todos los documentos anidados aún no cuantificados, 5 principales administrativos, valor de `APP_ENV`, registro Android heredado para determinar consumidor, Storage Rules, secretos, presupuestos y cuotas no consultables |
| `INCONSISTENTE` | package Android heredado `com.arles.viverocontrol` frente al contrato `com.arles.viverocampo`; despliegue parcial de 11/30 Functions |
| `NO_DESPLEGADO` | Android producción, Web Maestro producción, 19 Functions y 10 colecciones contractuales todavía no materializadas |

## Comparación repositorio / Firebase

| Contrato en `main` | Firebase real | Resultado |
|---|---|---|
| 30 Callables | 11 activas, 19 ausentes | `INCONSISTENTE` / corte bloqueado |
| Functions `us-central1` | 11/11 en `us-central1` | coincide para lo desplegado |
| runtime Node 22 | 11/11 `nodejs22` | coincide |
| `APP_ENV=production` | existe el nombre; valor no leído | `REQUIERE_REVISION` |
| Firestore `nam5` | `nam5` | coincide |
| reglas Firestore versionadas | hash normalizado idéntico | coincide |
| índices versionados | 0 compuestos + mismo override | coincide |
| Android `com.arles.viverocampo` | ausente | `NO_DESPLEGADO` |
| Maestro producción | ausente; solo staging | `NO_DESPLEGADO` |
| Email/Password | habilitado y contraseña requerida | coincide |
| 21 colecciones contractuales | 11 presentes, 10 no materializadas | revisar antes de corte |

## Backups y PITR comprobados

- schedules de backup Firestore: 0;
- backups listados en `nam5`: 0;
- PITR: deshabilitado;
- protección de borrado: deshabilitada;
- no se generó ningún backup en esta fase.

No existe evidencia suficiente para afirmar que el proyecto tenga un respaldo restaurable. La FASE B y cualquier limpieza quedan bloqueadas hasta ejecutar y verificar el plan de respaldo de `PLAN_CORTE_Y_ROLLBACK_ETAPA_21.md`.

## Bloqueos y conclusión

1. No existe respaldo remoto comprobado ni PITR.
2. Secret Manager y Billing Budgets no son consultables sin habilitar APIs o ampliar permisos, acciones prohibidas en esta fase.
3. Cuotas no fueron consultables y falta Google Cloud CLI.
4. Los tres usuarios, los 38 documentos de nivel superior y todos los documentos anidados son ambiguos; ninguno puede borrarse.
5. Faltan 19 Functions y los registros productivos de Android y Maestro.
6. El propietario todavía debe suministrar y aprobar la información real solicitada en `docs/INFORMACION_REAL_REQUERIDA_ETAPA_21.md`.

La auditoría permite diseñar el corte, pero no autoriza FASE B, limpieza ni despliegue.
