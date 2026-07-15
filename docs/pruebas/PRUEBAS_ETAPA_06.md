# Pruebas de la Etapa 6

## Cobertura

- autor inicia una corrección válida y recibe una reserva `CORRECCION`;
- otro usuario y una línea no devuelta son rechazados;
- otra reserva activa bloquea el inicio;
- una clave repetida devuelve la misma reserva sin duplicar auditoría;
- dos claves concurrentes producen un solo ganador;
- el reenvío crea versión 2 y enlaza la versión 1;
- la versión anterior permanece byte a byte igual;
- la línea vuelve a `PENDIENTE_REVISION`;
- inventario oficial y movimientos no cambian;
- Campo restaura el borrador de corrección después de cerrar sesión;
- Maestro muestra historial, motivo y versión vigente;
- las reglas continúan prohibiendo escrituras directas críticas.

## Comandos locales

Los comandos oficiales permanecen en el README raíz. La suite integrada ejecuta Auth, Functions y Firestore Emulator reales con proyecto `demo-vivero-control-etapa3` y después prueba las reglas.

Resultado local de implementación: 30 contratos, 19 pruebas Android, 9 pruebas Maestro, 12 unitarias backend, 47 integradas y 13 de reglas, todas aprobadas.
