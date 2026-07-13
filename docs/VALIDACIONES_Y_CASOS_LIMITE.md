# Validaciones y casos límite

## 1. Criterios generales

- Las validaciones de interfaz mejoran la experiencia, pero la fuente central vuelve a validar todo.
- Una operación rechazada no debe alterar parcialmente reservas, conteos, inventario ni auditoría.
- Los errores se expresan con códigos controlados y mensajes accionables; no se muestran trazas ni secretos.
- Los reintentos conservan la idempotencia y nunca convierten un fallo incierto en un efecto duplicado.
- Los borradores locales no se eliminan hasta confirmar inequívocamente su recepción o aplicar una política de recuperación.

## 2. Dos usuarios intentan tomar la misma línea

**Dado** que la línea está `DISPONIBLE` y dos usuarios autorizados solicitan reservarla casi al mismo tiempo, **cuando** se ejecutan las transacciones, **entonces**:

- solo una puede cambiarla a `EN_CONTEO` y crear la reserva activa;
- el ganador recibe el ID y token de reserva;
- el otro recibe un conflicto de disponibilidad con el estado central actual;
- no quedan dos reservas activas ni una reserva huérfana;
- el segundo usuario vuelve a la lista actualizada y elige otra línea.

La interfaz nunca debe prometer la reserva antes de la confirmación del servidor.

## 3. Pérdida de conexión

### Antes de reservar

- se impide la reserva;
- se informa que se necesita conexión;
- no se crea una reserva o línea «ocupada» solo localmente.

### Después de reservar

- el formulario sigue disponible;
- el borrador se guarda localmente;
- el indicador muestra el estado real, no «enviado»;
- al reconectar se consulta primero la reserva central y luego se sincroniza.

### Durante un envío de resultado incierto

- se conserva la misma clave idempotente;
- se consulta o reintenta hasta obtener el resultado central;
- si el servidor ya lo aceptó, se muestra el mismo conteo sin duplicarlo;
- si lo rechazó, se mantiene el borrador con la causa y una acción posible.

## 4. Aplicación cerrada durante el conteo

**Al reabrir:**

1. La sesión se vuelve a validar.
2. Se localiza el borrador por usuario, dispositivo, jornada, línea y reserva.
3. Con conexión, se consulta la vigencia central.
4. Si sigue vigente, se continúa el conteo.
5. Si fue liberada o consumida, no se sincroniza automáticamente; se conserva para recuperación supervisada.
6. Si inicia sesión otra persona, no se le muestra ni permite enviar el borrador anterior.

Debe probarse también un cierre abrupto durante una escritura local para asegurar que el último borrador válido no quede corrupto.

## 5. Doble pulsación de guardar o enviar

- El botón se deshabilita visualmente mientras procesa, pero la garantía real es la idempotencia central.
- Ambos intentos del mismo envío lógico usan la misma clave.
- El servidor crea un solo conteo, una sola versión y una sola transición.
- La respuesta repetida contiene el mismo ID y resultado.
- Una clave reutilizada con payload distinto se rechaza como conflicto, no se interpreta como corrección.

## 6. Línea abandonada

- La aplicación Maestro la señala usando el último contacto del servidor, no la hora local.
- No se libera automáticamente hasta aprobar una política de tiempo y avisos.
- Solo supervisor o administrador puede liberarla.
- Se exige motivo, confirmación y auditoría.
- La transacción comprueba que la reserva observada aún sea la activa.
- La línea vuelve a `DISPONIBLE` únicamente si la liberación termina por completo.
- Un envío posterior con el token anterior se rechaza y conserva para recuperación, sin reemplazar el trabajo del nuevo titular.

## 7. Conteo devuelto

- La devolución solo opera sobre la versión todavía `PENDIENTE_REVISION`.
- Exige un motivo visible al autor.
- La versión original queda inmutable.
- Solo el autor puede iniciar la corrección prevista.
- La corrección genera nueva versión y nueva clave idempotente.
- La nueva versión referencia la anterior.
- El inventario oficial no cambia durante la devolución ni durante la corrección.
- Si el autor no está disponible, se bloquea la reasignación hasta que exista una política autorizada.

## 8. Aprobación repetida o simultánea

- La aprobación comprueba estado, versión de línea, versión de inventario y marcador de aplicación.
- Una sola transacción aplica el conteo y marca `APROBADA`.
- Un reintento con la misma clave devuelve la aplicación previa.
- Otra clave para la misma versión detecta que ya fue aplicada y no suma, resta ni reemplaza de nuevo.
- Un intento de aprobar una versión devuelta, obsoleta o de otra jornada se rechaza.
- Un fallo no puede dejar el inventario actualizado y la línea sin aprobar, ni al contrario.

## 9. Dispositivo con fecha incorrecta

- Se registran la hora del dispositivo y la del servidor.
- La hora del servidor gobierna orden, reservas, abandono, revisión y aprobación.
- La interfaz advierte una diferencia relevante cuando se defina el umbral.
- Una fecha local futura o pasada no permite extender una reserva, adelantarse en la cola ni alterar auditoría.
- La diferencia no destruye el conteo; queda como señal para revisión y soporte.

El umbral de advertencia y si bloquea alguna acción siguen pendientes.

## 10. Usuario sin autorización

Se debe denegar una operación cuando la cuenta:

- no está autenticada;
- está inactiva;
- no tiene el rol necesario;
- no está autorizada para la jornada;
- intenta operar una línea de otra jornada;
- intenta usar datos de desarrollo contra producción o viceversa;
- perdió permisos después de cargar la pantalla.

La denegación ocurre centralmente, no filtra datos ajenos y queda auditada cuando corresponda. Una caché o pantalla antigua nunca conserva autoridad.

## 11. Datos negativos, inválidos o inconsistentes

- Hembras, machos y patrones aceptan solo enteros mayores o iguales a cero.
- Se rechazan negativos, decimales, texto, valores vacíos requeridos y números fuera del rango técnico seguro.
- El total se recalcula y debe coincidir exactamente; no se acepta uno enviado manualmente que difiera.
- Jornada, línea, usuario, dispositivo y reserva deben existir y ser compatibles.
- Módulo, cama y línea deben provenir del catálogo y respetar su jerarquía.
- No se aceptan IDs de otro ambiente.
- La aprobación rechaza cualquier resultado oficial negativo.
- Los límites numéricos máximos se fijarán con datos reales, no se inventan en esta etapa.

Un total cero es técnicamente no negativo, pero debe decidirse si exige observación o verificación.

## 12. Otros casos que debe cubrir el MVP

### Reserva liberada al mismo tiempo que se envía

La transacción que valide primero define el resultado. Nunca pueden quedar a la vez un envío aceptado con reserva consumida y una liberación que haga la línea disponible. El perdedor recibe el estado definitivo.

### Jornada cerrada o modificada desde otra pantalla

Toda operación vuelve a leer el estado central. Una pantalla desactualizada no puede reservar ni enviar contra una jornada cerrada.

### Conteo recibido pero no colocado en revisión

Una línea que quede `ENVIADA` debe ser detectable y reconciliable por un proceso seguro e idempotente hacia `PENDIENTE_REVISION`. No se pide al usuario reenviar con otra clave.

### Cambio de usuario en el mismo dispositivo

Los borradores se aíslan por cuenta. El nuevo usuario no puede leer, editar ni sincronizar el borrador anterior.

### Cambio de rol durante una operación

Se usa el rol central vigente al autorizar cada acción y se registra como `rol_efectivo`. Un rol capturado previamente no concede permiso.

### Línea o ubicación desactivada

No entra en jornadas nuevas. Si ya tiene historia o una jornada activa, el sistema no borra registros; aplica la política de continuidad que se defina y alerta al supervisor.

### Conflicto de versión de catálogo

Campo refresca el catálogo antes de reservar. Un borrador existente conserva los IDs originales y no los sustituye automáticamente por textos o nuevas ubicaciones.

### Solicitud de verificación repetida

Debe deduplicarse mediante idempotencia, conservar motivos y dejar la línea pendiente. El actor responsable y el resultado de la verificación están pendientes.

## 13. Evidencia mínima de prueba

Cada caso debe producir:

- datos iniciales controlados del ambiente de desarrollo;
- acciones y actores identificados;
- resultado visible esperado;
- estado central final;
- número esperado de conteos, versiones y aplicaciones;
- evento de auditoría correspondiente;
- comprobación de que el inventario oficial no cambió cuando no debía.
