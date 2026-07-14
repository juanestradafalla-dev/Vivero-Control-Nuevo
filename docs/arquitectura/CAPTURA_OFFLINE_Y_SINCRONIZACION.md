# Captura offline y sincronización

## Persistencia local

Room 2.8.4 usa la base `vivero-campo-emulador.db`, versión 2, con migración explícita desde la versión 1.

- `confirmed_reservations`: reserva, cuenta, dispositivo, ubicación y token cifrado;
- `count_drafts`: inputs, alcance, estado local, payload congelado, clave, errores y metadatos mínimos de éxito.

El índice único `(userId, deviceId, reservationId)` y las consultas con los tres valores aíslan el borrador. Una cuenta distinta en el mismo teléfono no lo recibe.

La migración no inventa un token para reservas antiguas de la Etapa 3, porque esa versión no lo persistía. En el entorno ficticio se reinicia el escenario; no se almacena un sustituto en texto plano.

## Captura

Las cantidades se conservan como texto mientras el usuario escribe para poder señalar incompletos, negativos, decimales, texto y desbordamientos. Antes de confirmar se convierten a enteros seguros y se vuelve a validar la suma. El total es derivado y no editable.

El borrador se guarda después de cada cambio. Cerrar y reabrir Campo restaura datos y estado.

## Intento lógico

El resumen no es editable. La confirmación genera una sola clave y congela cantidades, observaciones y hora de dispositivo. Una doble pulsación no crea otro trabajo: el ViewModel bloquea la confirmación y WorkManager usa trabajo único con `ExistingWorkPolicy.KEEP`.

Si un error permite corregir datos, editar cancela el trabajo del intento anterior, elimina payload y clave congelados localmente, y la siguiente confirmación crea un intento nuevo.

## WorkManager

WorkManager 2.11.2 ejecuta `CountSyncWorker` con restricción `NetworkType.CONNECTED`. El trabajo recibe solo `reservationId`; recupera el payload congelado y el token cifrado desde Room.

Estados visibles:

```text
PENDIENTE -> SINCRONIZANDO -> ENVIADA
                          \-> ERROR
ERROR -> SINCRONIZANDO (mismo intento)
ERROR -> PENDIENTE (después de editar y crear otro intento)
```

`ENVIADA` se escribe solo después de una respuesta central válida. Un fallo de red deja `ERROR`, conserva payload, clave y token cifrado, y devuelve `Result.retry()`. Un rechazo controlado conserva el borrador y devuelve fallo permanente con mensaje accionable.

## Decisiones no cerradas

Siguen pendientes retención local definitiva, modelos Android reales, calidad de señal, tolerancia de reloj, límites operativos y política de conteos cero.
