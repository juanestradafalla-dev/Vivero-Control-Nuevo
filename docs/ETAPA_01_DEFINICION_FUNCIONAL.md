# Etapa 1: definición funcional

## 1. Propósito

Definir el comportamiento del nuevo Vivero Control antes de seleccionar tecnologías o escribir código. El sistema estará compuesto por Vivero Campo y Vivero Maestro, conectados en el futuro a una única base central.

La Etapa 1 convierte los requisitos operativos conocidos en reglas verificables. Todo dato no suministrado queda identificado como decisión pendiente y no como valor asumido.

## 2. Objetivos

1. Separar la captura de conteos del inventario oficial.
2. Evitar que dos personas cuenten simultáneamente la misma línea dentro de una jornada.
3. Permitir que un conteo ya reservado continúe ante una pérdida temporal de conexión.
4. Someter cada conteo a revisión antes de modificar el inventario oficial.
5. Conservar autores, dispositivos, fechas, versiones y decisiones de revisión.
6. Aplicar el mismo procedimiento de reserva a auxiliares, supervisores y administradores que cuenten desde Vivero Campo.
7. Dejar una base documental para implementar seguridad, transacciones, sincronización y pruebas sin depender del proyecto anterior.

## 3. Alcance de esta etapa

Incluye la definición de:

- responsabilidades de Vivero Campo y Vivero Maestro;
- permisos de auxiliar, supervisor y administrador;
- ciclo de una jornada y estados de cada línea;
- captura, almacenamiento local, sincronización, revisión y aprobación;
- entidades y campos propuestos, sin cargar datos operativos;
- casos normales, excepciones y criterios de aceptación del MVP;
- estructura futura del repositorio.

No incluye:

- código de aplicaciones, backend o pruebas ejecutables;
- elección definitiva del framework de Vivero Maestro;
- proyectos, credenciales, colecciones, reglas o índices reales de Firebase;
- migración, copia o transformación de información del sistema anterior;
- definición inventada de módulos, camas, líneas, usuarios o volúmenes;
- diseño gráfico final.

## 4. Vivero Campo

Vivero Campo tendrá solamente funciones ligadas al trabajo de inventario:

1. Autenticar al usuario mediante Firebase Authentication.
2. Mostrar las jornadas activas para las cuales el usuario está autorizado.
3. Mostrar líneas disponibles usando identificadores y nombres del catálogo central.
4. Reservar una línea con conexión y mediante una transacción central.
5. Mostrar quién posee la reserva y el estado resultante, sin exponer datos personales innecesarios.
6. Capturar hembras, machos, patrones y observaciones.
7. Calcular el total automáticamente sin permitir su edición manual.
8. Guardar borradores locales durante una pérdida temporal de señal.
9. Confirmar el resumen antes del envío.
10. Sincronizar con una clave idempotente y mostrar `PENDIENTE`, `SINCRONIZANDO`, `ENVIADA` o `ERROR` como estados locales.
11. Mostrar al usuario el estado de sus propios conteos.
12. Permitir correcciones únicamente sobre conteos devueltos, al autor original o al usuario que un supervisor haya reasignado formalmente.

La cuenta maestra tendrá rol de administrador y contará desde Vivero Campo. No tendrá un atajo especial: deberá reservar, capturar y enviar igual que cualquier auxiliar.

### Pautas de interfaz de Campo

- una tarea principal por pantalla;
- controles grandes y legibles;
- teclado numérico para cantidades;
- validación inmediata y mensajes de error concretos;
- total calculado y siempre visible;
- confirmación explícita antes de enviar;
- estado de conexión y sincronización visible;
- recuperación del borrador después de cerrar y volver a abrir la aplicación.

## 5. Vivero Maestro

Vivero Maestro será una aplicación para Windows. En el primer MVP deberá:

1. Autenticar y autorizar según el rol.
2. Crear y gestionar jornadas de inventario.
3. Seleccionar desde el catálogo las líneas incluidas en una jornada.
4. Activar y cerrar jornadas conforme a reglas verificables.
5. Mostrar el avance completo por jornada y por estado.
6. Identificar reservas vigentes y líneas posiblemente abandonadas.
7. Liberar una reserva mediante una acción explícita, justificada y auditada.
8. Revisar el conteo enviado y su historial.
9. Aprobar o devolver conteos sin eliminar el original.
10. Aplicar una aprobación al inventario oficial mediante una transacción idempotente.
11. Consultar el inventario oficial y su procedencia.
12. Ofrecer búsqueda, filtros, ordenamiento, selecciones controladas y resúmenes antes de acciones críticas.

La administración de usuarios, permisos, ubicaciones, configuración, auditoría, copias de seguridad y mantenimiento será exclusiva del administrador. El alcance operativo exacto de algunas de estas pantallas para el primer piloto debe decidirse antes de implementar.

La verificación adicional queda fuera del primer MVP. Inicialmente, el supervisor o administrador solo podrá aprobar o devolver para corrección.

## 6. Reglas operativas obligatorias

### Jornada y líneas

- El supervisor o administrador crea la jornada y selecciona sus líneas desde el catálogo central.
- Las líneas no se preasignan a un auxiliar.
- Una línea puede tener como máximo una reserva activa dentro de la misma jornada.
- Todos los roles que cuentan usan la misma operación transaccional de reserva.
- Reservar requiere conexión y confirmación del servidor.
- Un resultado local de «seleccionada» no equivale a una reserva hasta recibir confirmación central.

### Conteo y sincronización

- Después de una reserva confirmada, el conteo puede continuar temporalmente sin conexión.
- El borrador local se relaciona con la jornada, línea, usuario, dispositivo y token de reserva.
- Hembras, machos y patrones son enteros mayores o iguales a cero.
- El total es la suma calculada; no es una entrada independiente.
- Cada intento lógico de envío conserva la misma clave idempotente durante reintentos.
- Recibir nuevamente la misma clave devuelve el resultado previo y no crea otra versión ni otro efecto.
- El registro del conteo y el cambio central de `EN_CONTEO` a `PENDIENTE_REVISION` ocurren en una sola transacción.
- `ENVIADA` es exclusivamente un estado local de sincronización; no es un estado central de la línea en Firestore.
- Un conteo aceptado nunca actualiza por sí solo el inventario oficial.

### Revisión, corrección y aprobación

- El original enviado permanece inmutable.
- Una devolución exige motivo y habilita una nueva versión vinculada a la anterior.
- No se promedian automáticamente dos conteos ni se reemplaza silenciosamente uno con otro.
- Aprobar exige autorización, estado vigente y transacción central.
- Repetir la aprobación de la misma versión no debe aplicar el inventario dos veces.
- El inventario oficial tiene una fotografía vigente por línea.
- Aprobar reemplaza esa fotografía con el conteo aprobado y registra un movimiento histórico con la diferencia entre el valor anterior y el nuevo.
- Si el administrador aprueba excepcionalmente un conteo propio, la interfaz debe advertirlo y exigir motivo; la excepción queda auditada.
- Cada cambio de estado, liberación, revisión y aprobación genera auditoría.

### Seguridad, identidad y tiempo

- Firebase Authentication será obligatorio; el método de inicio de sesión está pendiente.
- Las reglas de Firestore deberán almacenarse en este repositorio y versionarse en GitHub cuando se implementen.
- El backend y las reglas no confiarán en el rol declarado por el cliente.
- Los IDs globales serán opacos y no dependerán de contadores locales.
- Módulo, cama y línea se seleccionarán desde catálogos centrales mediante IDs; no se identificarán con texto libre.
- Se registrarán usuario, rol efectivo, dispositivo, hora declarada por el dispositivo y hora asignada por el servidor.
- La hora del servidor gobernará reservas, orden, revisiones y aprobaciones.
- Desarrollo y producción usarán proyectos y credenciales separados.

### Consistencia del inventario

- El inventario oficial tendrá una única fuente central.
- La unidad del inventario oficial será cada línea.
- La aprobación verificará en una transacción que la versión siga pendiente, que no haya sido aplicada y que el resultado no sea negativo.
- Esa transacción reemplazará la fotografía oficial de la línea y registrará un ajuste histórico por categoría y total.
- Por ejemplo, si el total anterior era `1000` y el conteo aprobado es `980`, el nuevo inventario será `980` y el movimiento histórico será `-20`.
- Las futuras operaciones de descartes y despachos también deberán ser transaccionales e impedir inventarios negativos.

## 7. Casos normales

### 7.1 Conteo aprobado

1. Un supervisor crea y activa una jornada con líneas del catálogo.
2. Un usuario autorizado abre Vivero Campo y reserva una línea disponible.
3. El servidor confirma que la línea quedó `EN_CONTEO` para ese usuario y dispositivo.
4. El usuario registra las cantidades, revisa el total y confirma el envío.
5. El servidor guarda el original, deduplica por clave idempotente y cambia la línea directamente de `EN_CONTEO` a `PENDIENTE_REVISION` en la misma transacción.
6. Un supervisor revisa y aprueba.
7. Una transacción actualiza el inventario oficial una sola vez, marca la línea `APROBADA` y registra auditoría.

### 7.2 Conteo devuelto y corregido

1. Un supervisor devuelve un conteo pendiente indicando el motivo.
2. El original permanece inmutable y visible en el historial.
3. El autor abre el conteo devuelto y genera una nueva versión. Si está ausente, el supervisor puede reasignar la corrección a otro usuario autorizado sin cambiar la autoría del original.
4. El nuevo envío vuelve a revisión con otra clave idempotente.
5. La revisión compara el historial y decide sin promedios automáticos.

### 7.3 Conteo con pérdida temporal de señal

1. La reserva se confirma mientras existe conexión.
2. La señal se pierde y el usuario sigue contando.
3. Cada cambio relevante queda como borrador local.
4. El envío queda pendiente hasta recuperar la conexión.
5. Al reconectar, la aplicación valida la reserva y sincroniza idempotentemente.

## 8. Casos excepcionales

- **Reserva simultánea:** la transacción concede la línea a un solo usuario; el otro recibe el estado actualizado y debe escoger otra.
- **Reserva liberada mientras hay un borrador local:** el envío tardío no se aplica automáticamente; se conserva localmente y se remite a recuperación supervisada.
- **Cierre de la aplicación:** al reabrir se restaura el borrador y se verifica centralmente la reserva antes de sincronizar.
- **Doble pulsación o reintento:** la misma clave idempotente produce un único conteo lógico.
- **Fecha incorrecta del dispositivo:** se conserva como evidencia, pero la hora del servidor determina la secuencia.
- **Aprobación simultánea o repetida:** una sola transacción puede aplicar la versión; los demás intentos reciben el resultado ya consolidado.
- **Usuario desactivado o sin autorización:** no puede reservar, enviar, revisar ni aprobar, incluso si la interfaz conserva datos antiguos.
- **Línea abandonada:** durante el MVP no vence automáticamente; solo supervisor o administrador puede liberarla manualmente, con motivo y auditoría.

## 9. Funciones fuera del primer MVP

- descartes;
- despachos;
- aplicaciones de productos;
- productos químicos;
- reingreso;
- reportes avanzados;
- explotación completa de auditoría y mantenimiento;
- verificación adicional de conteos;
- automatización de copias de seguridad más allá de la política mínima que se defina;
- reserva anticipada de bloques de líneas, que no se reconsiderará hasta medir la calidad real de la señal;
- migración de datos históricos;
- cualquier integración no descrita expresamente.

Estos módulos se conservarán en la arquitectura funcional de Vivero Maestro, pero no deben bloquear el piloto de jornadas de inventario.
