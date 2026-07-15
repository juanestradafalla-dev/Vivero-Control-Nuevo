# Pruebas — ETAPA 12

## Contratos

- solicitud estricta con tres versiones e idempotencia;
- rechazo de identidad o campos adicionales;
- resultado de activación;
- bloqueo determinista de línea activa;
- resultado idempotente `ACTIVAR_JORNADA`.

## Backend y emuladores

La prueba integrada usa Auth, Functions y Firestore Emulator reales y cubre:

- activación válida y materialización exacta de jornada, líneas, autorizaciones y bloqueos;
- permisos de auxiliar, supervisor propietario, supervisor ajeno y administrador;
- jornada fuera de `BORRADOR`, versión obsoleta y selecciones ausentes;
- ausencia de líneas, contador o revisor;
- perfil inexistente, inactivo o con rol central cambiado;
- línea inexistente, inactiva u ocupada;
- límite combinado mayor de 200;
- recuperación idempotente y conflicto de payload;
- dos borradores concurrentes sobre la misma línea con exactamente un ganador;
- visibilidad en Campo solo para participantes seleccionados;
- selecciones preparatorias intactas;
- cero escrituras parciales ante error;
- inventario oficial y movimientos sin cambios.

El seed repetible elimina también subcolecciones de autorizaciones creadas por activaciones anteriores y materializa los bloqueos correspondientes a todas las jornadas activas ficticias.

## Reglas

Las pruebas confirman que clientes autenticados, incluidos supervisor y administrador, no pueden leer ni escribir directamente `ocupacionesLineasActivas`. Se mantienen los rechazos directos sobre jornadas, autorizaciones, `jornadaLineas`, selecciones, auditoría e idempotencia.

## Vivero Maestro y compatibilidad de Campo

Maestro prueba:

- acción bloqueada con preparación incompleta o cambios sin guardar;
- resumen de nombre, líneas, participantes y permisos;
- advertencias previas;
- envío de las tres versiones observadas;
- una única clave por intento lógico;
- retiro del borrador, refresco de jornadas activas y confirmación posterior.

Campo conserva sus pruebas de selección dinámica. La integración demuestra que el participante autorizado descubre la nueva jornada y una cuenta no seleccionada no la recibe.

## Matriz local y CI

La matriz obligatoria incluye contratos, Android, Maestro, backend, reglas, emuladores, concurrencia y auditorías de dependencias. No contiene pasos `firebase deploy` ni configuración de Firebase real.
