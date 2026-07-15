# Pruebas — ETAPA 13

## Contratos

- solicitud estricta con jornada, versión e idempotencia;
- rechazo de identidad o campos adicionales;
- resultado central `INACTIVA`;
- resultado idempotente `CERRAR_JORNADA`;
- versión y permiso de cierre central en `listarJornadasActivas`, sin exponer el creador.

## Backend y emuladores

La integración con Auth, Functions y Firestore Emulator reales cubre:

- cierre válido con todas las líneas `APROBADA`;
- supervisor propietario, supervisor ajeno, administrador y auxiliar;
- jornada inactiva y versión obsoleta;
- cada estado de línea bloqueante;
- reserva, corrección y reasignación pendientes;
- limpieza de indicadores activos al aprobar una corrección, conservando su historial;
- idempotencia y conflicto de payload;
- dos cierres concurrentes con un solo efecto;
- carreras contra reservar, enviar, aprobar, devolver y liberar;
- ocupación ausente o incorrecta sin escrituras parciales;
- liberación exacta de ocupaciones;
- líneas y autorizaciones inactivas pero conservadas;
- inventario, movimientos, conteos, decisiones y reservas intactos;
- jornada ausente de Campo y líneas nuevamente seleccionables en borradores.

La matriz integrada actual ejecuta 102 pruebas en 11 archivos y 19 pruebas de reglas. Las reglas continúan rechazando escrituras directas de jornadas, `jornadaLineas`, autorizaciones, ocupaciones, auditoría e idempotencia.

## Maestro y Campo

Maestro prueba acción bloqueada con motivo exacto, resumen de cierre, confirmación explícita, envío de la versión observada, permiso del supervisor creador y retiro de la jornada tras el éxito.

Campo prueba que una jornada cerrada desaparece de la selección y que el historial local permanece. También cubre la defensa que conserva selección, reserva y borrador si existiera trabajo local inesperado.

## Matriz

Se ejecutan contratos, `assembleDebug`, pruebas Android, `lintDebug`, lint/typecheck/test/build de Maestro, lint/typecheck/test/build del backend, Emulator Suite, reglas, concurrencia y auditorías de dependencias. No existe paso `firebase deploy`.
