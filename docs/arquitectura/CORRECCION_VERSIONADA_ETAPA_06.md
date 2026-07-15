# Corrección versionada de conteos devueltos

## Flujo central

`DEVUELTA → EN_CONTEO → PENDIENTE_REVISION` se ejecuta exclusivamente mediante `iniciarCorreccionConteo` y `enviarConteo` dentro de Firebase Emulator Suite.

`iniciarCorreccionConteo` acepta solo `conteoId`, `dispositivoId` y `claveIdempotencia`. La identidad procede de Authentication. En una transacción comprueba cuenta y autorización activas, jornada activa, autoría, conteo vigente, línea exactamente `DEVUELTA` y ausencia de otra reserva activa. Después crea una reserva `CORRECCION`, guarda únicamente el hash SHA-256 del token en la reserva, enlaza `conteoAnteriorId`, incrementa la versión de línea y registra auditoría e idempotencia.

El token opaco se cifra en Campo con AES-GCM y una clave no exportable de Android Keystore antes de persistir la reserva. Room nunca recibe el token en texto plano.

## Nueva versión

Al consumir una reserva `CORRECCION`, `enviarConteo` vuelve a validar autor, dispositivo, token, jornada, autorización, reserva y estado de línea. Lee el conteo anterior dentro de la misma transacción y crea un documento nuevo con:

- `versionNumero = versionNumero anterior + 1`;
- `conteoAnteriorId` igual al conteo devuelto;
- las cantidades y el total recalculado por el servidor;
- `inmutable = true`.

El conteo anterior no se actualiza ni elimina. La línea cambia a `PENDIENTE_REVISION`, apunta al conteo nuevo y consume la reserva exactamente una vez. Inventario oficial y movimientos de inventario no participan en esta operación.

## Clientes

Campo consulta únicamente conteos y decisiones del usuario autenticado. Muestra el motivo, solicita una nueva reserva y crea un borrador Room separado con los valores anteriores como referencia editable. WorkManager reutiliza el payload y la clave congelados.

Maestro consulta todas las versiones autorizadas de la jornada, las ordena por `versionNumero`, marca la vigente y muestra el motivo asociado a cada devolución. No ofrece edición. `aprobarConteo` y `devolverConteo` vuelven a comprobar centralmente que el identificador recibido sea `conteoVigenteId`.

## Exclusiones

No hay reasignación, liberación, corrección por otra cuenta, gestión de jornadas, datos reales, Firebase de producción ni despliegue.
