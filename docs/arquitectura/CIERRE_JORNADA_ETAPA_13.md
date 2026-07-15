# Cierre seguro de jornadas — ETAPA 13

## Alcance

`cerrarJornada` cambia una jornada de `ACTIVA` a `INACTIVA` exclusivamente en Firebase Emulator Suite. Recibe únicamente `jornadaId`, `versionEsperada` y `claveIdempotencia`; identidad, rol, actor y hora proceden de fuentes centrales.

Un supervisor activo solo cierra una jornada creada por él. Un administrador activo puede cerrar cualquier jornada. Un auxiliar no puede ejecutar la operación. No existe cierre forzado o excepcional.

## Precondiciones centrales

Antes de escribir, la transacción vuelve a leer y exige:

- jornada todavía `ACTIVA` y versión exacta;
- todas las `jornadaLineas` activas en estado `APROBADA`;
- ninguna línea `DISPONIBLE`, `EN_CONTEO`, `PENDIENTE_REVISION` o `DEVUELTA`;
- ninguna reserva `ACTIVA`;
- ningún `reservaActivaId`, responsable de corrección o reasignación activa;
- un documento `ocupacionesLineasActivas/{lineaId}` válido y perteneciente a la jornada por cada línea;
- máximo combinado de 200 líneas y autorizaciones.

El límite mantiene el peor caso en `2N + P + 3` escrituras: actualizar `N` líneas, eliminar `N` ocupaciones, desactivar `P` autorizaciones y escribir jornada, auditoría e idempotencia. Con `N + P <= 200`, nunca supera 403 escrituras y no se permiten lotes parciales.

## Transacción única

Después de todas las lecturas, la misma transacción:

1. cambia la jornada a `INACTIVA`, incrementa su versión y guarda `cerradaEn` y `cerradaPorUsuarioId`;
2. marca cada `jornadaLinea` como inactiva sin cambiar su estado, versión o historia;
3. desactiva cada autorización operativa sin eliminarla;
4. elimina exactamente los bloqueos `ocupacionesLineasActivas` de sus líneas;
5. crea auditoría `JORNADA_CERRADA`;
6. crea el resultado idempotente `CERRAR_JORNADA`.

Conteos, decisiones, inventarios, movimientos, reservas, autorizaciones y selecciones preparatorias permanecen conservados. La única eliminación es el bloqueo temporal de ocupación activa.

Cuando se aprueba la versión vigente de una corrección, `aprobarConteo` limpia únicamente los indicadores activos de responsable y reasignación de la línea. Los registros inmutables de conteo, decisión y reasignación no se modifican; así una corrección ya terminada no aparece como pendiente durante el cierre.

## Idempotencia y concurrencia

La clave se separa por actor y operación. El hash cubre jornada y versión esperada. La misma clave y payload recuperan exactamente el resultado confirmado aunque la jornada ya esté inactiva; cambiar el payload devuelve `IDEMPOTENCY_CONFLICT`.

Reservar, enviar, aprobar, devolver y liberar leen y modifican la misma jornada, línea o reserva que el cierre vuelve a validar. Firestore resuelve la disputa documental. Además, el cierre conserva una huella del primer intento interno: si un reintento transaccional observa trabajo distinto, devuelve `JOURNEY_CLOSE_STALE_VERSION`. Nunca confirma un subconjunto del cierre.

## Clientes

Maestro muestra la acción solo al supervisor creador o a un administrador. Resume estados, líneas aprobadas y pendientes, reservas y correcciones; presenta el motivo exacto del bloqueo y exige confirmación explícita. Tras el éxito cancela la suscripción, retira la jornada activa y refresca catálogo y selectores.

Campo detecta la revocación o el cambio a `INACTIVA`, vuelve a consultar jornadas activas y limpia la selección cuando no hay trabajo. No borra Room ni historial. Si apareciera trabajo local inesperado, lo conserva y pide consultar a supervisión.
