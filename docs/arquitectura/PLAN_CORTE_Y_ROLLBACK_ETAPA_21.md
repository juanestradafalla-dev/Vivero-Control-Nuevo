# ETAPA 21 — Plan de respaldo, limpieza, corte y rollback

## Regla de no ejecución

Este documento es un diseño para una fase posterior. En FASE A no se ejecuta ningún backup, despliegue, alta, importación, cambio de IAM, limpieza o restauración. Ningún ejemplo constituye autorización y no se define un comando de “borrar todo”.

El Project ID se conserva siempre como `viverocontrol-3f83f`, Firestore permanece en `nam5` y Functions en `us-central1`.

## Puertas previas obligatorias

El responsable del cambio debe detener el proceso si falta cualquiera de estas evidencias:

1. propietario, operador y revisor identificados;
2. ventana de cambio aprobada y usuarios informados;
3. inventario remoto repetido y firmado con IDs enmascarados;
4. objetivos de limpieza enumerados uno a uno, sin globs;
5. backup Firestore finalizado, retenido y restaurable;
6. inventario Auth y Storage cifrado y conciliado;
7. reglas, índices y versiones de Functions preservados;
8. presupuesto, cuotas y alertas revisados;
9. datos reales y cuentas iniciales aprobados por el propietario;
10. criterios de humo, RPO, RTO y responsables de rollback completos.

La evidencia actual no supera las puertas 4 a 10. No hay backup programado, backup listado o PITR.

## Plan verificable de respaldo

| Componente | Acción futura | Evidencia de finalización | Restauración / comprobación |
|---|---|---|---|
| Firestore | exportación administrada completa de la base `(default)` a un bucket de respaldo aprobado y compatible con `nam5` | operación finalizada, ubicación, hora de corte, conteos por colección y checksum del manifiesto | restauración ensayada en un destino aislado autorizado; conciliación de conteos y consultas de humo |
| Índices | preservar `backend/firestore.indexes.json` y exportar inventario remoto sanitizado | hash Git, 0 índices compuestos y override confirmado | volver a aplicar solo el archivo revisado y verificar estado listo |
| Reglas | conservar fuente local y hash de ruleset remoto | ambos hashes y release activa registrados | republicar la versión aprobada y ejecutar pruebas de reglas antes de habilitar clientes |
| Authentication | generar inventario cifrado de cuentas y proveedores con identificadores enmascarados; nunca exportar contraseñas al repositorio | total conciliado, custodio, ubicación, retención y control de acceso | procedimiento aprobado de recreación/recuperación y reasignación de perfiles; ensayo con cuentas ficticias |
| Storage | manifiesto de buckets, objetos, tamaños, generaciones y retención, sin descargar contenido en la terminal | conteo y bytes conciliados por bucket; manifiesto cifrado | restauración por generación o copia preservada, validada en muestra aprobada |
| Functions | registrar las 30 esperadas, las desplegadas, región, runtime, huella y variables solo por nombre | manifiesto versionado y artefactos fuente asociados al commit de corte | redeploy de la versión previa aprobada y smoke tests por Callable |
| Apps Firebase | inventario Android/Web con App IDs enmascarados y package names | lista firmada de registros a conservar, retirar o crear | restaurar configuración del cliente anterior sin publicar claves en documentación |
| IAM / servicios | snapshot sanitizado de bindings, APIs y cuenta de facturación | revisor confirma mínimo privilegio y servicios requeridos | procedimiento de recuperación de acceso con doble control |

### Ubicación, retención y costos

El propietario debe definir bucket, región compatible, cifrado, retención, inmutabilidad, responsable y fecha de eliminación. La facturación está vinculada, pero los costos de exportación, almacenamiento, restauración y egreso deben aprobarse antes. Billing Budgets no fue consultable; esa revisión es una puerta, no una suposición.

### Criterio que impide limpiar

No puede iniciarse limpieza si la exportación Firestore no figura `SUCCESS`, si los conteos no concilian, si el manifiesto Auth/Storage no está custodiado, si no existe ensayo de restauración o si el propietario no firmó los objetivos exactos. Una captura de pantalla o una lista de objetos no equivale a respaldo restaurable.

## Plan posterior de limpieza controlada

### Preparación del manifiesto

Cada objetivo debe tener: servicio, ID exacto mantenido fuera de Git, hash para revisión, motivo, evidencia de clasificación, dependencia, aprobador, operador, hora y resultado. No se admiten prefijos amplios, comodines, rangos por fecha, “todo staging” ni “todo lo antiguo”.

El inventario actual solo confirma como recursos de prueba dos registros de aplicación llamados Staging. No hay usuarios o documentos `FICTICIO_CONFIRMADO`; por tanto, no existe hoy un lote autorizado de limpieza de Auth o Firestore.

### Orden y pausas

1. **Clientes y accesos de prueba.** Revocar distribución y credenciales de clientes aprobados; verificar que no queden sesiones operativas. Pausa y conciliación.
2. **Authentication.** Procesar solo UID exactos aprobados. Los tres usuarios actuales quedan fuera mientras sean `REQUIERE_REVISION`. Pausa y conciliación de totales.
3. **Firestore.** Procesar documentos exactos y sus subcolecciones explícitas. Los 38 documentos de nivel superior actuales y todos los documentos anidados aún no cuantificados quedan fuera. Nunca usar borrado recursivo amplio. Pausa por colección.
4. **Storage.** Procesar nombres y generaciones exactas. Los dos buckets técnicos de Functions se conservan. Nunca eliminar buckets completos por patrón. Pausa por bucket.
5. **Functions.** Retirar únicamente Functions remotas extra y aprobadas; la auditoría encontró cero extras. Las 11 existentes se conservan y las 19 ausentes no son objetivos de limpieza.
6. **Apps registradas.** Tratar por separado Android staging, Web staging y el Android heredado. Ninguno se elimina sin confirmar consumidores, respaldo de configuración y aprobación.
7. **Verificación.** Repetir conteos, reglas, índices, Functions, Auth y Storage; anexar un registro inmutable de cada cambio.

El proyecto, la base Firestore, su ubicación, la región de Functions y la cuenta de facturación no forman parte de ningún manifiesto de limpieza.

## Secuencia futura de corte y rollback

| Paso | Acción futura | Criterio de detención | Rollback definido |
|---:|---|---|---|
| 1 | congelar temporalmente accesos y escrituras operativas | clientes activos no controlados o ventana no confirmada | retirar congelación y volver al estado anterior sin tocar datos |
| 2 | confirmar respaldo y ensayo | exportación incompleta, conteos distintos o restauración no probada | cancelar corte; conservar sistema anterior |
| 3 | limpiar únicamente objetivos aprobados | aparece un recurso no incluido o cualquier dependencia ambigua | detener lote; restaurar solo el grupo afectado desde manifiesto/backup |
| 4 | configurar producción y secretos localmente | Project ID, región, package o App ID no coinciden | descartar configuración nueva y mantener clientes bloqueados |
| 5 | publicar reglas e índices aprobados | pruebas de reglas fallan o un índice no llega a listo | restaurar release/hash anterior; no continuar |
| 6 | publicar las 30 Functions en `us-central1` | falta una Callable, runtime/ambiente incorrecto o humo falla | volver a la versión de Functions preservada y mantener congelamiento |
| 7 | crear administrador inicial | identidad o custodio sin doble aprobación | deshabilitar acceso nuevo y recuperar mediante responsable designado |
| 8 | cargar catálogo e inventario aprobados | preflight, checksum, totales o versión observada no coinciden | ejecutar reversión controlada del paquete intacto o restaurar backup |
| 9 | crear usuarios y perfiles | roles/correos no aprobados o total distinto | deshabilitar lote exacto y restaurar perfiles previos |
| 10 | realizar smoke tests | cualquier flujo crítico, regla o auditoría falla | mantener acceso congelado y aplicar rollback del último grupo |
| 11 | habilitar operación | no existe firma conjunta del humo | no distribuir clientes; conservar sistema anterior |
| 12 | monitorear | errores, latencia, costos o bloqueos superan umbral aprobado | congelar nuevas operaciones y ejecutar rollback según componente |
| 13 | cerrar o aplicar rollback | evidencia incompleta o reconciliación fallida | declarar incidente, preservar logs y restaurar el último punto válido |

## Smoke tests mínimos

- autenticación de un usuario aprobado por rol;
- lectura de jornada y catálogo;
- reserva de una línea y rechazo de segunda reserva concurrente;
- conteo offline, reintento idempotente y envío;
- aprobación/devolución y corrección/reasignación;
- inventario y movimiento coherentes;
- auditoría generada y no editable desde clientes;
- reglas niegan accesos no autorizados;
- las 30 Callables responden en `us-central1`;
- Campo y Maestro usan exclusivamente sus registros productivos.

No se usan cuentas o datos reales hasta que el propietario apruebe el conjunto. Los smoke tests previos deben usar fixtures inequívocos y eliminables incluidos en el manifiesto.

## Umbrales y responsables pendientes

Antes de FASE B deben completarse:

| Dato | Valor requerido |
|---|---|
| RPO máximo | `[pendiente del propietario]` |
| RTO máximo | `[pendiente del propietario]` |
| duración de ventana | `[pendiente]` |
| umbral de errores | `[pendiente]` |
| umbral de latencia | `[pendiente]` |
| umbral de gasto/alerta | `[pendiente]` |
| responsable de cambio | `[pendiente]` |
| responsable de backup | `[pendiente]` |
| aprobador de datos | `[pendiente]` |
| responsable de rollback | `[pendiente]` |

Sin estos valores, el corte no puede empezar.
