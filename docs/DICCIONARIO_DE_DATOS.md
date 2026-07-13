# Diccionario de datos propuesto

## 1. Convenciones

Este documento describe un modelo lógico, no colecciones de Firestore ya configuradas.

- Todos los IDs globales son cadenas opacas generadas por un mecanismo global; no son autoincrementos locales.
- `timestamp_servidor` representa una hora asignada por la fuente central.
- `timestamp_dispositivo` se conserva como evidencia, pero no decide orden, liberación ni autorización.
- Los campos terminados en `_id` referencian entidades canónicas; la interfaz no los reemplaza por texto manual.
- Los catálogos y enumeraciones deberán validarse tanto en el cliente como centralmente.
- Los campos de auditoría son inmutables una vez creados.
- No se proponen cantidades de registros ni valores reales de módulos, camas, líneas o usuarios.

## 2. Usuario

Identidad autenticada y perfil autorizado.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `usuario_id` | string | Sí | Firebase Authentication | UID global existente; no editable por el cliente. |
| `nombre_visible` | string | Sí | Administración | No vacío; formato por definir. |
| `identificador_acceso` | string | Sí | Auth/administración | Único según el método de autenticación pendiente. |
| `rol` | enum | Sí | Administrador | `AUXILIAR`, `SUPERVISOR` o `ADMINISTRADOR`. |
| `activo` | boolean | Sí | Administrador | Una cuenta inactiva no puede operar. |
| `creado_en_servidor` | timestamp | Sí | Servidor | Inmutable. |
| `actualizado_en_servidor` | timestamp | Sí | Servidor | Monótono según versión central. |

No se almacenarán secretos de autenticación en el perfil de Firestore.

## 3. Dispositivo

Identifica el origen técnico de las operaciones sin usarlo como único factor de seguridad.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `dispositivo_id` | string | Sí | Instalación de Campo | ID global persistente; no basado en nombre manual. |
| `usuario_id_ultimo` | string | No | Sesión autenticada | Debe referenciar usuario existente. |
| `nombre_visible` | string | No | Sistema/administración | Solo informativo. |
| `plataforma` | enum | Sí | Aplicación | Valor controlado; inicialmente Android para Campo. |
| `version_aplicacion` | string | Sí | Aplicación | Formato de versión válido. |
| `ultimo_contacto_servidor` | timestamp | No | Servidor | Nunca proviene del reloj local. |
| `activo` | boolean | Sí | Administración | Política de registro o bloqueo pendiente. |

## 4. Ubicación canónica

Representa la jerarquía administrada del vivero. Su estructura completa es una decisión pendiente.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `ubicacion_id` | string | Sí | Administración | ID global. |
| `tipo` | enum | Sí | Catálogo | Tipo controlado; al menos debe permitir identificar módulo, cama y línea cuando se confirme la jerarquía. |
| `padre_id` | string | Cond. | Catálogo | Referencia válida; obligatorio salvo en el nivel raíz. |
| `codigo` | string | Sí | Administración | Único dentro del alcance que se defina. |
| `nombre` | string | Sí | Administración | No vacío; no se usa como clave global. |
| `orden` | number | No | Administración | Entero; propósito solo de presentación. |
| `activo` | boolean | Sí | Administración | No se elimina si tiene historia asociada. |
| `version_catalogo` | number | Sí | Servidor | Entero positivo para detectar datos obsoletos. |

## 5. Línea

Entidad contable seleccionable desde el catálogo central.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `linea_id` | string | Sí | Administración | ID global y único. |
| `modulo_id` | string | Sí* | Catálogo | Referencia canónica; obligatoriedad final depende de confirmar la estructura. |
| `cama_id` | string | Sí* | Catálogo | Referencia canónica compatible con el módulo. |
| `codigo` | string | Sí | Administración | Único dentro del alcance definido; no es el ID global. |
| `nombre_visible` | string | No | Administración | Informativo y controlado. |
| `activa` | boolean | Sí | Administración | Una línea inactiva no entra en nuevas jornadas. |
| `version_catalogo` | number | Sí | Servidor | Entero positivo. |

`Sí*` indica un requisito esperado por los conceptos suministrados, sujeto a validar la jerarquía real antes de implementar.

## 6. Jornada

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `jornada_id` | string | Sí | Servidor | ID global. |
| `nombre` | string | Sí | Supervisor/administrador | No vacío; convención pendiente. |
| `descripcion` | string | No | Supervisor/administrador | Longitud máxima pendiente. |
| `estado_jornada` | enum | Sí | Flujo central | Catálogo de estados de jornada pendiente de definición. |
| `creada_por_usuario_id` | string | Sí | Sesión | Supervisor o administrador autorizado. |
| `creada_en_servidor` | timestamp | Sí | Servidor | Inmutable. |
| `activada_en_servidor` | timestamp | No | Servidor | Solo al activar. |
| `cerrada_en_servidor` | timestamp | No | Servidor | Solo al cerrar. |
| `cerrada_por_usuario_id` | string | No | Sesión | Requerido si está cerrada. |
| `version` | number | Sí | Servidor | Control de concurrencia; entero positivo. |

## 7. Autorización de jornada

Relaciona una jornada con un usuario autorizado sin preasignarle líneas.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `autorizacion_id` | string | Sí | Servidor | ID global. |
| `jornada_id` | string | Sí | Maestro | Jornada existente. |
| `usuario_id` | string | Sí | Maestro | Usuario activo. |
| `activa` | boolean | Sí | Maestro | Debe comprobarse en cada operación. |
| `otorgada_por_usuario_id` | string | Sí | Sesión | Actor con permiso; alcance pendiente. |
| `otorgada_en_servidor` | timestamp | Sí | Servidor | Inmutable. |
| `revocada_en_servidor` | timestamp | No | Servidor | Requerida si se revoca. |

Debe existir como máximo una autorización activa por pareja jornada/usuario.

## 8. Línea de jornada

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `jornada_linea_id` | string | Sí | Servidor | ID global. |
| `jornada_id` | string | Sí | Maestro | Jornada existente. |
| `linea_id` | string | Sí | Catálogo | Línea activa al incorporarla. |
| `estado` | enum | Sí | Flujo central | `DISPONIBLE`, `EN_CONTEO`, `PENDIENTE_REVISION`, `DEVUELTA` o `APROBADA`. |
| `reserva_activa_id` | string | No | Transacción de reserva | Nulo salvo durante una reserva vigente. |
| `conteo_vigente_id` | string | No | Sincronización | Referencia a la versión más reciente aceptada. |
| `responsable_correccion_usuario_id` | string | No | Devolución/reasignación | Autor original o usuario autorizado al que un supervisor reasignó la corrección. |
| `version` | number | Sí | Servidor | Control de concurrencia; aumenta en transiciones. |
| `actualizada_en_servidor` | timestamp | Sí | Servidor | Hora de la última transición. |

Debe existir una sola relación por jornada/línea.

## 9. Reserva

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `reserva_id` | string | Sí | Servidor | ID global. |
| `jornada_linea_id` | string | Sí | Solicitud | Línea `DISPONIBLE` para conteo normal o `DEVUELTA` para una corrección autorizada. |
| `usuario_id` | string | Sí | Sesión | Autenticado, activo y autorizado. |
| `rol_efectivo` | enum | Sí | Autorización central | Rol válido en el momento de reservar. |
| `dispositivo_id` | string | Sí | Aplicación | Dispositivo válido según política pendiente. |
| `solicitud_idempotencia` | string | Sí | Aplicación | Global y única; mismo resultado en reintentos. |
| `token_reserva` | string | Sí | Servidor | Opaco, ligado a la versión central. |
| `reservada_en_servidor` | timestamp | Sí | Servidor | Autoritativa. |
| `ultimo_contacto_servidor` | timestamp | No | Servidor | Se actualiza solo con eventos válidos. |
| `estado_reserva` | enum | Sí | Flujo central | Catálogo mínimo a definir para activa, consumida o liberada. |
| `liberada_en_servidor` | timestamp | No | Servidor | Requerida si se libera. |
| `liberada_por_usuario_id` | string | No | Sesión | Supervisor/administrador que liberó. |
| `motivo_liberacion` | string | No | Supervisor/administrador | Obligatorio si se libera manualmente. |

En el primer MVP una reserva no vence automáticamente. Solo supervisor o administrador puede liberarla manualmente con motivo y auditoría.

## 10. Conteo y versiones

Cada corrección crea otro registro. No se sobrescribe una versión existente.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `conteo_id` | string | Sí | Servidor | ID global. |
| `jornada_linea_id` | string | Sí | Reserva/formulario | Relación existente. |
| `reserva_id` | string | Sí | Formulario | Debe pertenecer al usuario responsable y a la línea; las correcciones crean una nueva reserva exclusiva. |
| `usuario_id` | string | Sí | Sesión | Titular de la reserva, autor habilitado para corregir o usuario al que se reasignó la corrección. |
| `rol_efectivo` | enum | Sí | Servidor | Rol central al enviar. |
| `dispositivo_id` | string | Sí | Aplicación | Coincide con la trazabilidad del borrador. |
| `hembras` | integer | Sí | Usuario | Mayor o igual a cero. |
| `machos` | integer | Sí | Usuario | Mayor o igual a cero. |
| `patrones` | integer | Sí | Usuario | Mayor o igual a cero. |
| `total` | integer | Sí | Sistema | Igual a la suma; no editable. |
| `observaciones` | string | No | Usuario | Longitud y obligatoriedad condicional pendientes. |
| `version_numero` | integer | Sí | Servidor | Positivo y secuencial dentro de la línea de jornada. |
| `conteo_anterior_id` | string | No | Servidor | Obligatorio en correcciones; misma línea de jornada. |
| `idempotencia_envio` | string | Sí | Aplicación | Única; mismo contenido en cada reintento. |
| `timestamp_dispositivo` | timestamp | Sí | Dispositivo | Se conserva aunque difiera del servidor. |
| `timestamp_servidor` | timestamp | Sí | Servidor | Autoritativa para secuencia. |
| `inmutable` | boolean | Sí | Servidor | Verdadero desde que se acepta. |

Una clave de envío no puede asociarse a dos payloads diferentes.

La creación del conteo, el consumo de la reserva y el cambio central de la línea desde `EN_CONTEO` hasta `PENDIENTE_REVISION` se realizan en una sola transacción. `ENVIADA` no es un valor de esta entidad; pertenece únicamente al borrador local.

## 11. Decisión de revisión

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `revision_id` | string | Sí | Servidor | ID global. |
| `conteo_id` | string | Sí | Maestro | Versión existente. |
| `decision` | enum | Sí | Revisor | `APROBAR` o `DEVOLVER` en el primer MVP. |
| `motivo` | string | Cond. | Revisor | Obligatorio al devolver y al aprobar un conteo propio como administrador. |
| `revisor_usuario_id` | string | Sí | Sesión | Supervisor o administrador autorizado. |
| `rol_efectivo` | enum | Sí | Servidor | Rol central al decidir. |
| `autorrevision_excepcional` | boolean | Sí | Servidor | Verdadero solo si un administrador aprueba su propio conteo. |
| `idempotencia_revision` | string | Sí | Maestro | Única por acción lógica. |
| `timestamp_dispositivo` | timestamp | Sí | Dispositivo | Evidencia. |
| `timestamp_servidor` | timestamp | Sí | Servidor | Autoritativa. |

Un supervisor no puede aprobar su propio conteo. Un administrador sí puede hacerlo excepcionalmente con advertencia, motivo obligatorio y auditoría.

## 12. Inventario oficial

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `inventario_id` | string | Sí | Servidor | ID global de la fotografía oficial. |
| `linea_id` | string | Sí | Catálogo | Unidad oficial; debe ser único entre fotografías vigentes. |
| `hembras` | integer | Sí | Transacción | Mayor o igual a cero. |
| `machos` | integer | Sí | Transacción | Mayor o igual a cero. |
| `patrones` | integer | Sí | Transacción | Mayor o igual a cero. |
| `total` | integer | Sí | Sistema | Suma exacta, no editable. |
| `conteo_fuente_id` | string | Sí | Aprobación | Conteo aprobado y no aplicado antes. |
| `version` | number | Sí | Servidor | Control de concurrencia. |
| `actualizado_por_usuario_id` | string | Sí | Aprobación | Revisor que aprobó. |
| `actualizado_en_servidor` | timestamp | Sí | Servidor | Autoritativa. |

Existe una sola fotografía oficial vigente por línea. Una aprobación reemplaza sus cantidades con el conteo aprobado; nunca suma el conteo al inventario anterior.

## 13. Movimiento histórico de ajuste por conteo

Registro inmutable que conserva la diferencia aplicada al reemplazar la fotografía oficial y vuelve auditable e idempotente la aprobación.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `movimiento_id` | string | Sí | Servidor | ID global. |
| `conteo_id` | string | Sí | Aprobación | Único: un conteo se aplica como máximo una vez. |
| `inventario_id` | string | Sí | Transacción | Fotografía oficial afectada. |
| `linea_id` | string | Sí | Transacción | Misma línea del conteo y del inventario. |
| `tipo_movimiento` | enum | Sí | Servidor | `AJUSTE_POR_CONTEO_APROBADO`. |
| `inventario_version_anterior` | number | Sí | Transacción | Debe coincidir al escribir. |
| `valores_anteriores` | map | Sí | Servidor | Fotografía inmutable. |
| `valores_nuevos` | map | Sí | Servidor | Coinciden exactamente con el conteo aprobado y no contienen negativos. |
| `diferencias` | map | Sí | Servidor | Para cada categoría: valor nuevo menos valor anterior. |
| `diferencia_total` | integer | Sí | Servidor | Total nuevo menos total anterior; puede ser negativo, cero o positivo. |
| `aprobada_por_usuario_id` | string | Sí | Sesión | Actor autorizado. |
| `idempotencia_aprobacion` | string | Sí | Maestro | Única para la acción lógica. |
| `timestamp_servidor` | timestamp | Sí | Servidor | Autoritativa. |

Ejemplo: total anterior `1000`, total nuevo `980`, `diferencia_total = -20`.

## 14. Evento de auditoría

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `evento_id` | string | Sí | Servidor | ID global. |
| `tipo_evento` | enum | Sí | Flujo central | Catálogo versionado de acciones auditables. |
| `entidad_tipo` | enum | Sí | Flujo central | Tipo controlado. |
| `entidad_id` | string | Sí | Flujo central | Referencia global. |
| `usuario_id` | string | Cond. | Sesión/sistema | Obligatorio para acciones humanas. |
| `rol_efectivo` | enum | Cond. | Servidor | Obligatorio para acciones humanas. |
| `dispositivo_id` | string | No | Aplicación | Se registra cuando exista. |
| `antes` | map | No | Servidor | Datos mínimos necesarios, sin secretos. |
| `despues` | map | No | Servidor | Datos mínimos necesarios, sin secretos. |
| `motivo` | string | No | Actor | Obligatorio según acción, incluida la autorrevisión administrativa excepcional. |
| `timestamp_dispositivo` | timestamp | No | Dispositivo | Evidencia. |
| `timestamp_servidor` | timestamp | Sí | Servidor | Inmutable y autoritativa. |
| `correlacion_id` | string | Sí | Flujo central | Agrupa eventos de una operación. |

La retención, exportación y acceso a auditoría están pendientes.

## 15. Borrador local de Campo

Entidad exclusiva del dispositivo hasta sincronizar; no es inventario oficial.

| Campo | Tipo | Req. | Origen | Validación |
|---|---|:---:|---|---|
| `borrador_local_id` | string | Sí | Aplicación | ID global local, no autoincremental. |
| `jornada_linea_id` | string | Sí | Reserva confirmada | No editable. |
| `reserva_id` | string | Sí | Servidor | Reserva previamente confirmada. |
| `token_reserva` | string | Sí | Servidor | Almacenamiento local protegido. |
| `usuario_id` | string | Sí | Sesión | No se sincroniza bajo otra cuenta. |
| `dispositivo_id` | string | Sí | Instalación | Debe coincidir con el origen. |
| `hembras` | integer | Sí | Usuario | Mayor o igual a cero. |
| `machos` | integer | Sí | Usuario | Mayor o igual a cero. |
| `patrones` | integer | Sí | Usuario | Mayor o igual a cero. |
| `observaciones` | string | No | Usuario | Reglas pendientes. |
| `estado_sincronizacion` | enum | Sí | Aplicación | `PENDIENTE`, `SINCRONIZANDO`, `ENVIADA` o `ERROR`. |
| `idempotencia_envio` | string | No | Aplicación | Se fija al confirmar el envío lógico. |
| `actualizado_en_dispositivo` | timestamp | Sí | Dispositivo | No es autoritativo centralmente. |
| `ultimo_error_codigo` | string | No | Aplicación/servidor | Código controlado, sin secretos. |

El borrador solo se elimina mediante una política segura después de confirmar el mismo conteo en el servidor; la retención local exacta está pendiente.

## 16. Datos deliberadamente no definidos

No se han definido ni inferido:

- número ni nombres reales de módulos, camas o líneas;
- cantidad, nombres o cuentas de usuarios;
- valores iniciales del inventario;
- identificadores de proyectos Firebase;
- nombres físicos de colecciones o rutas;
- umbrales informativos de inactividad, diferencia de reloj o longitud de textos;
- cantidad de líneas para una futura reserva anticipada;
- política de migración ni correspondencias con datos antiguos.
