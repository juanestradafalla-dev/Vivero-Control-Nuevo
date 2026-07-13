# Criterios de aceptación del MVP

## 1. Uso de estos criterios

La primera versión no estará lista para piloto hasta demostrar todos los criterios aplicables en un ambiente de desarrollo separado de producción. Los umbrales operativos que dependan de cantidades, señal o dispositivos reales deberán completarse después de recibir esa información.

## 2. Autenticación y autorización

- [ ] Todos los usuarios inician sesión mediante Firebase Authentication.
- [ ] Una cuenta inactiva o sin autorización no puede leer ni operar una jornada protegida.
- [ ] Auxiliar, supervisor y administrador obtienen exactamente los permisos de la matriz documentada.
- [ ] El servidor vuelve a validar identidad, rol y autorización en cada operación crítica.
- [ ] Un cambio de rol o revocación entra en vigor sin confiar en permisos almacenados por la interfaz.
- [ ] Desarrollo y producción usan proyectos, configuración y datos separados.
- [ ] Las reglas de Firestore están versionadas en GitHub y cuentan con pruebas automatizadas de acceso permitido y denegado.

## 3. Catálogo y jornadas

- [ ] Módulo, cama y línea se seleccionan por ID desde el catálogo central, sin identificación basada en texto libre.
- [ ] No se puede incluir dos veces la misma línea en una jornada.
- [ ] Solo supervisor o administrador crea, activa, gestiona o cierra una jornada.
- [ ] Un usuario solo ve jornadas activas para las que está autorizado.
- [ ] Al activar una jornada, cada línea incluida queda `DISPONIBLE`.
- [ ] Maestro muestra avance y totales por cada estado sin ocultar líneas.
- [ ] El cierre cumple la política aprobada y nunca elimina historia.

## 4. Reserva concurrente

- [ ] Reservar requiere conexión y confirmación de la fuente central.
- [ ] Todos los roles que cuentan usan el mismo procedimiento.
- [ ] Una prueba concurrente demuestra que dos dispositivos que intentan la misma línea producen exactamente una reserva activa.
- [ ] El ganador pasa la línea a `EN_CONTEO`; el otro recibe un conflicto claro y puede escoger otra.
- [ ] La creación de reserva y el cambio de estado son atómicos.
- [ ] Una pantalla o caché desactualizada no permite sobrescribir la reserva central.

## 5. Captura y trabajo sin conexión

- [ ] Campo presenta una tarea principal por pantalla, botones grandes y teclado numérico.
- [ ] Hembras, machos y patrones solo aceptan enteros no negativos.
- [ ] El total se calcula automáticamente y no puede editarse.
- [ ] Se muestra un resumen y se solicita confirmación antes de enviar.
- [ ] Después de una reserva válida, el usuario puede contar sin señal y el borrador sobrevive al cierre de la aplicación.
- [ ] Los borradores de usuarios distintos quedan aislados en un dispositivo compartido.
- [ ] La interfaz distingue claramente `PENDIENTE`, `SINCRONIZANDO`, `ENVIADO` y `ERROR`.
- [ ] Ningún fallo de red muestra «enviado» antes de la confirmación central.
- [ ] Un borrador cuya reserva fue liberada se conserva, pero no se aplica automáticamente.

## 6. Sincronización e idempotencia

- [ ] Cada envío lógico tiene una clave idempotente global.
- [ ] Doble pulsación, reintento y respuesta perdida crean un solo conteo y una sola versión.
- [ ] Reutilizar la misma clave con contenido diferente se rechaza.
- [ ] Un envío aceptado registra usuario, rol efectivo, dispositivo, hora del dispositivo y hora del servidor.
- [ ] El conteo aceptado queda inmutable.
- [ ] La transición recorre `ENVIADA` y `PENDIENTE_REVISION` según la definición aprobada.
- [ ] Existe una recuperación idempotente para envíos persistidos que no entren inicialmente a revisión.
- [ ] Los errores muestran una causa útil y no eliminan el borrador.

## 7. Revisión, devolución y verificación

- [ ] Un conteo enviado no modifica el inventario oficial antes de aprobarse.
- [ ] Supervisor y administrador pueden revisar el contenido y su trazabilidad completa.
- [ ] Devolver exige un motivo y cambia la línea a `DEVUELTA`.
- [ ] El autor ve el motivo y puede generar una nueva versión sin alterar la anterior.
- [ ] El historial permite comparar todas las versiones y decisiones.
- [ ] El sistema nunca promedia automáticamente conteos diferentes.
- [ ] Solicitar verificación deja evidencia y no cambia el inventario.
- [ ] Antes del piloto está definido y probado quién ejecuta la verificación y cuál es su resultado.

## 8. Aprobación e inventario oficial

- [ ] Solo supervisor o administrador autorizado puede aprobar.
- [ ] La aprobación verifica que la versión siga pendiente y no aplicada.
- [ ] La actualización del inventario, el registro de aplicación, la auditoría y `APROBADA` se confirman de forma atómica.
- [ ] Una aprobación repetida o simultánea afecta el inventario exactamente una vez.
- [ ] Cada inventario oficial referencia el conteo aprobado que lo originó.
- [ ] Se conserva el valor anterior y el resultante para auditoría.
- [ ] Ninguna aprobación, descarte o despacho puede producir inventario negativo.
- [ ] La política de consolidación del conteo al inventario está formalmente aprobada y cubierta por pruebas.

## 9. Liberación y recuperación

- [ ] Solo supervisor o administrador puede liberar una línea abandonada.
- [ ] La liberación exige motivo, confirmación y auditoría.
- [ ] La transacción impide liberar una reserva que cambió desde que se mostró.
- [ ] La línea vuelve a `DISPONIBLE` sin perder borradores ni conteos existentes.
- [ ] Un token liberado no permite enviar como si la reserva siguiera activa.
- [ ] Existe un procedimiento operativo aprobado para recuperar o descartar justificadamente un borrador tardío.
- [ ] La política de abandono y sus avisos está definida antes del piloto.

## 10. Tiempo, auditoría y seguridad

- [ ] La hora del servidor gobierna secuencia, vencimientos y decisiones.
- [ ] Una fecha incorrecta del dispositivo se registra y no permite alterar orden o vigencia.
- [ ] Reservas, liberaciones, envíos, devoluciones, verificaciones, aprobaciones, cambios de rol y cierres generan auditoría.
- [ ] La auditoría es inmutable para los clientes y registra actor, rol, entidad, operación y hora del servidor.
- [ ] No se guardan secretos en Git, registros visibles ni aplicaciones cliente.
- [ ] Las reglas impiden acceso cruzado entre ambientes.
- [ ] Los IDs globales no dependen de autoincrementos locales.
- [ ] Se completó una revisión de seguridad de reglas y almacenamiento local antes del piloto.

## 11. Experiencia de uso

- [ ] Campo permite completar la tarea sin navegar por módulos administrativos.
- [ ] Los errores explican qué ocurrió y qué puede hacer el usuario.
- [ ] El estado de conexión y sincronización permanece visible durante el flujo.
- [ ] Maestro usa selecciones controladas, validaciones y resumen antes de acciones críticas.
- [ ] Maestro permite buscar, filtrar y ordenar jornadas, líneas y conteos.
- [ ] La identidad visual verde es coherente sin reutilizar dependencias ni código del proyecto anterior.
- [ ] Las pruebas con los dispositivos y usuarios reales cumplen los umbrales de usabilidad que se definan.

## 12. Evidencia previa al piloto

- [ ] Pruebas automatizadas de reglas, transacciones, idempotencia, estados y validaciones pasan en el ambiente de desarrollo.
- [ ] Pruebas en al menos los dispositivos objetivo definidos cubren pérdida de señal, cierre abrupto y reintentos.
- [ ] Se ejecutó una jornada de prueba de extremo a extremo con datos ficticios autorizados.
- [ ] Se verificó que ningún conteo pendiente, devuelto o fallido alterara el inventario oficial.
- [ ] Se verificó que todas las aprobaciones válidas fueran trazables y únicas.
- [ ] Se acordaron responsables de soporte, respaldo, monitoreo y recuperación.
- [ ] Todas las decisiones pendientes que bloquean comportamiento o seguridad están cerradas y versionadas en documentación.
- [ ] Existe aprobación formal del responsable operativo para iniciar el piloto.

## 13. Condición de no aceptación

El MVP no se acepta si puede ocurrir cualquiera de estas situaciones:

- dos reservas activas para la misma línea de jornada;
- envío duplicado que cree versiones adicionales;
- inventario oficial modificado sin aprobación;
- aprobación aplicada más de una vez;
- pérdida silenciosa de un original o una corrección;
- inventario negativo;
- acceso autorizado solo por controles de interfaz;
- borrador marcado como enviado sin confirmación central;
- identificación de ubicación dependiente de texto libre;
- mezcla de datos o credenciales entre desarrollo y producción.
