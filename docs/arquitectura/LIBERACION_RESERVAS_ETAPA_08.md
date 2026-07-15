# Liberación manual supervisada — Etapa 8

## Alcance

`liberarReservaLinea` es una Callable exclusiva de Firebase Emulator Suite. Solo un supervisor o administrador activo y autorizado para la jornada puede liberar una reserva central `ACTIVA`. La operación no interpreta tiempo transcurrido ni clasifica una línea como abandonada: exige una decisión humana y un motivo.

Solicitud estricta:

```json
{
  "reservaId": "...",
  "motivo": "...",
  "claveIdempotencia": "..."
}
```

La identidad y el rol proceden de Authentication, `usuarios` y la autorización vigente de la jornada. Se rechazan propiedades adicionales y nunca se acepta estado, línea, titular ni hora central desde el cliente.

## Transacción

La transacción lee actor, autorización, reserva y `jornadaLinea`; valida reserva `ACTIVA`, línea `EN_CONTEO`, coincidencia de `reservaActivaId` y ausencia de `conteoId`. Después confirma conjuntamente:

1. registro inmutable en `liberacionesReserva`;
2. reserva `ACTIVA → LIBERADA`, con actor, motivo y hora central;
3. limpieza de `reservaActivaId`;
4. línea inicial `EN_CONTEO → DISPONIBLE`, o corrección `EN_CONTEO → DEVUELTA`;
5. restauración de `reasignacionOrigenId` para una corrección reasignada, sin cambiar `responsableCorreccionUsuarioId`;
6. un solo incremento de la versión de línea;
7. auditoría `RESERVA_LINEA_LIBERADA`;
8. resultado idempotente `LIBERAR_RESERVA_LINEA`.

La reserva no se elimina. `enviarConteo` vincula atómicamente `conteoId` al consumirla. Como ambas operaciones disputan la misma reserva y línea, liberar y enviar simultáneamente producen exactamente un ganador.

## Campo

Campo observa el estado de su reserva. Al recibir `LIBERADA` cancela el trabajo único de WorkManager, cambia el borrador local a `ERROR/RESERVATION_RELEASED` y conserva cantidades, observaciones, payload congelado, clave idempotente y token cifrado. El botón de reintento desaparece y se indica consultar con supervisión.

El backend también rechaza un envío tardío con `RESERVATION_RELEASED`; el identificador de reserva no puede afectar una reserva nueva de la misma línea.

## Maestro y reglas

Maestro muestra únicamente hechos de la reserva activa: ubicación, titular, tipo, dispositivo, hora y versión. El formulario exige motivo, advierte que puede existir un borrador y presenta el estado de retorno antes de invocar la Callable con una sola clave lógica.

Los clientes no pueden escribir reservas, líneas, liberaciones, auditoría ni idempotencia. `liberacionesReserva` solo puede leerse por supervisores y administradores autorizados.

## Exclusiones

No existen vencimientos, temporizadores, detección automática de abandono, borrado de borradores ni recuperación administrativa de su contenido. No se configuró Firebase real ni despliegue.
